import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GitHubService } from '../github/github.service';
import { UploadsService } from '../uploads/uploads.service';
import {
    RustAnalysisFactors,
    ComplexityScores,
    OracleUsage,
    CrossProgramInvocation,
    DeFiPattern,
    EconomicRiskFactor,
    AnchorSpecificFeatures,
    StaticAnalysisReport,
    StaticAnalysisReportDocument,
} from './dto/static-analysis.dto';
import { StaticAnalysisReport as StaticAnalysisModel } from './schemas/static-analysis.schema';

// Re-export the interface for use in the controller
export { StaticAnalysisReport };
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StaticAnalysisService {
    private readonly logger = new Logger(StaticAnalysisService.name);

    constructor(
        private readonly githubService: GitHubService,
        private readonly uploadsService: UploadsService,
        @InjectModel(StaticAnalysisModel.name)
        private readonly staticAnalysisModel: Model<StaticAnalysisModel>,
    ) { }

    /**
     * Analyze a Rust smart contract repository for Solana/Anchor
     */
    async analyzeRustContract(
        owner: string,
        repo: string,
        accessToken: string,
        selectedFiles?: string[],
        _analysisOptions?: any,
    ): Promise<StaticAnalysisReport> {
        this.logger.log(`Starting static analysis for ${owner}/${repo}`);

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        try {
            // Step 1: Get repository information
            const repoInfo = await this.githubService.getRepositoryInfo(
                owner,
                repo,
                accessToken,
            );

            // Step 2: Clone repository
            const repoUrl = repoInfo.clone_url;
            const repoName = `${owner}-${repo}`;
            const repoPath = await this.githubService.cloneRepository(
                repoUrl,
                repoName,
                accessToken,
            );

            // Step 3: Detect framework (before cleanup!)
            const framework = this.detectFramework(repoPath);

            // Step 4: Analyze Rust files
            const analysisFactors = this.analyzeRustFiles(
                repoPath,
                selectedFiles,
            );

            // Step 5: Calculate complexity scores
            const scores = this.calculateComplexityScores(analysisFactors);

            // Step 6: Clean up
            await this.githubService.cleanupRepository(repoPath);

            const endTime = Date.now();
            const endMemory = process.memoryUsage().heapUsed;

            const report: StaticAnalysisReport = {
                repository: `${owner}/${repo}`,
                repositoryUrl: repoInfo.html_url,
                language: 'rust',
                framework,
                analysisFactors,
                scores,
                performance: {
                    analysisTime: endTime - startTime,
                    memoryUsage: endMemory - startMemory,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Save report to MongoDB
            try {
                const savedReport = new this.staticAnalysisModel(report);
                await savedReport.save();
                this.logger.log(`Report saved to database for ${owner}/${repo}`);
            } catch (dbError) {
                this.logger.error(`Failed to save report to database: ${dbError.message}`);
                // Continue execution even if database save fails
            }

            this.logger.log(`Static analysis completed for ${owner}/${repo}`);
            return report;
        } catch (error) {
            this.logger.error(`Failed to analyze Rust contract: ${error.message}`);
            throw new Error(`Failed to analyze Rust contract: ${error.message}`);
        }
    }

    /**
     * Get all saved analysis reports
     */
    async getAllReports(): Promise<StaticAnalysisReportDocument[]> {
        try {
            const reports = await this.staticAnalysisModel.find().sort({ createdAt: -1 }).exec();
            return reports.map(report => {
                const obj = report.toObject();
                return {
                    ...obj,
                    _id: obj._id.toString(),
                } as StaticAnalysisReportDocument;
            });
        } catch (error) {
            this.logger.error(`Failed to retrieve reports: ${error.message}`);
            throw new Error(`Failed to retrieve reports: ${error.message}`);
        }
    }

    /**
     * Get analysis report by repository name
     */
    async getReportByRepository(repository: string): Promise<StaticAnalysisReportDocument | null> {
        try {
            const report = await this.staticAnalysisModel.findOne({ repository }).exec();
            if (!report) return null;

            const obj = report.toObject();
            return {
                ...obj,
                _id: obj._id.toString(),
            } as StaticAnalysisReportDocument;
        } catch (error) {
            this.logger.error(`Failed to retrieve report for ${repository}: ${error.message}`);
            throw new Error(`Failed to retrieve report for ${repository}: ${error.message}`);
        }
    }

    /**
     * Debug framework detection - returns detailed info about repository structure
     */
    async analyzeUploadedContract(
        extractedPath: string,
        projectName: string,
        originalFilename: string,
        selectedFiles?: string[],
    ): Promise<StaticAnalysisReport> {
        const startTime = Date.now();
        const memoryStart = process.memoryUsage().heapUsed;

        this.logger.log(`Starting static analysis of uploaded contract: ${projectName}`);

        try {
            // Step 1: Detect framework
            const framework = this.detectFramework(extractedPath);

            // Step 2: Analyze Rust files
            const analysisFactors = this.analyzeRustFiles(
                extractedPath,
                selectedFiles,
            );

            // Step 3: Calculate complexity scores
            const scores = this.calculateComplexityScores(analysisFactors);

            // Step 4: Build report
            const endTime = Date.now();
            const memoryEnd = process.memoryUsage().heapUsed;

            const report: StaticAnalysisReport = {
                repository: projectName,
                repositoryUrl: `uploaded://${originalFilename}`,
                language: 'rust',
                framework,
                analysisFactors,
                scores,
                performance: {
                    analysisTime: endTime - startTime,
                    memoryUsage: Math.max(0, memoryEnd - memoryStart),
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Step 5: Save report to MongoDB
            try {
                const savedReport = new this.staticAnalysisModel(report);
                await savedReport.save();
                this.logger.log(`Report saved to database for uploaded contract: ${projectName}`);
            } catch (dbError) {
                this.logger.error(`Failed to save report to database: ${dbError.message}`);
            }

            this.logger.log(`Static analysis completed for uploaded contract: ${projectName}`);

            // Step 6: Cleanup extracted directory and upload session after analysis
            try {
                await this.cleanupExtractedDirectory(extractedPath);
                this.uploadsService.removeUploadSession(extractedPath);
                this.logger.log(`Cleaned up extracted directory and session: ${extractedPath}`);
            } catch (cleanupError) {
                this.logger.warn(`Failed to cleanup extracted directory and session: ${cleanupError.message}`);
            }

            return report;

        } catch (error) {
            this.logger.error(`Static analysis failed for uploaded contract: ${error.message}`);

            // Cleanup on error as well
            try {
                await this.cleanupExtractedDirectory(extractedPath);
                this.uploadsService.removeUploadSession(extractedPath);
                this.logger.log(`Cleaned up extracted directory and session after error: ${extractedPath}`);
            } catch (cleanupError) {
                this.logger.warn(`Failed to cleanup extracted directory and session after error: ${cleanupError.message}`);
            }

            throw error;
        }
    }

    async debugFrameworkDetection(owner: string, repo: string, accessToken: string): Promise<any> {
        try {
            // Step 1: Get repository information
            const repoInfo = await this.githubService.getRepositoryInfo(owner, repo, accessToken);

            // Step 2: Clone repository
            const repoUrl = repoInfo.clone_url;
            const repoName = `${owner}-${repo}`;
            const repoPath = await this.githubService.cloneRepository(repoUrl, repoName, accessToken);

            // Step 3: Analyze repository structure
            const debugInfo = {
                repoPath,
                repoContents: [] as string[],
                cargoTomlExists: false,
                cargoTomlContent: '',
                anchorTomlExists: false,
                programsDir: [] as string[],
                srcDir: [] as string[],
                detectedFramework: '',
                detectionLogs: [] as string[]
            };

            // Get repository contents
            if (fs.existsSync(repoPath)) {
                debugInfo.repoContents = fs.readdirSync(repoPath);
            }

            // Check Cargo.toml
            const cargoTomlPath = path.join(repoPath, 'Cargo.toml');
            if (fs.existsSync(cargoTomlPath)) {
                debugInfo.cargoTomlExists = true;
                debugInfo.cargoTomlContent = fs.readFileSync(cargoTomlPath, 'utf-8');
            }

            // Check Anchor.toml
            const anchorTomlPath = path.join(repoPath, 'Anchor.toml');
            debugInfo.anchorTomlExists = fs.existsSync(anchorTomlPath);

            // Check programs directory
            const programsPath = path.join(repoPath, 'programs');
            if (fs.existsSync(programsPath)) {
                debugInfo.programsDir = fs.readdirSync(programsPath);
            }

            // Check src directory
            const srcPath = path.join(repoPath, 'src');
            if (fs.existsSync(srcPath)) {
                debugInfo.srcDir = fs.readdirSync(srcPath);
            }

            // Run framework detection
            debugInfo.detectedFramework = this.detectFramework(repoPath);

            // Cleanup
            await this.githubService.cleanupRepository(repoPath);

            return debugInfo;

        } catch (error) {
            this.logger.error(`Debug framework detection failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Analyze Rust source files for complexity factors
     */
    private analyzeRustFiles(
        repoPath: string,
        selectedFiles?: string[],
    ): RustAnalysisFactors {
        const rustFiles = this.findRustFiles(repoPath, selectedFiles);

        let totalLinesOfCode = 0;
        let numPrograms = 0;
        let numFunctions = 0;
        let numStateVariables = 0;
        let totalCyclomaticComplexity = 0;
        let maxCyclomaticComplexity = 0;
        let compositionDepth = 0;

        const functionVisibility = { public: 0, private: 0, internal: 0 };
        let viewFunctions = 0;
        let pureFunctions = 0;

        // Security metrics
        let integerOverflowRisks = 0;
        let accessControlIssues = 0;
        let inputValidationIssues = 0;
        let unsafeCodeBlocks = 0;
        let panicUsage = 0;
        let unwrapUsage = 0;
        let expectUsage = 0;
        let matchWithoutDefault = 0;
        let arrayBoundsChecks = 0;
        let memorySafetyIssues = 0;

        // Integration metrics
        let externalProgramCalls = 0;
        const uniqueExternalCalls = new Set<string>();
        const knownProtocolInteractions: string[] = [];
        const standardLibraryUsage = new Set<string>();
        const oracleUsage: OracleUsage[] = [];
        const accessControlPatterns = { ownable: 0, roleBased: 0, custom: 0 };
        let cpiUsage = 0;
        const crossProgramInvocation: CrossProgramInvocation[] = [];

        // Economic metrics
        let tokenTransfers = 0;
        let complexMathOperations = 0;
        let timeDependentLogic = 0;
        const defiPatterns: DeFiPattern[] = [];
        const economicRiskFactors: EconomicRiskFactor[] = [];

        // Anchor-specific features
        const anchorSpecificFeatures: AnchorSpecificFeatures = {
            accountValidation: 0,
            constraintUsage: 0,
            instructionHandlers: 0,
            programDerives: [],
            accountTypes: 0,
            seedsUsage: 0,
            bumpUsage: 0,
            signerChecks: 0,
            ownerChecks: 0,
            spaceAllocation: 0,
            rentExemption: 0,
        };

        for (const filePath of rustFiles) {
            const content = fs.readFileSync(filePath, 'utf-8');

            totalLinesOfCode += this.lineCounter(content);

            // Analyze each file
            const fileAnalysis = this.analyzeRustFile(content, filePath);

            // Aggregate results
            numPrograms += fileAnalysis.numPrograms;
            numFunctions += fileAnalysis.numFunctions;
            numStateVariables += fileAnalysis.numStateVariables;
            totalCyclomaticComplexity += fileAnalysis.totalCyclomaticComplexity;
            maxCyclomaticComplexity = Math.max(
                maxCyclomaticComplexity,
                fileAnalysis.maxCyclomaticComplexity,
            );
            compositionDepth = Math.max(
                compositionDepth,
                fileAnalysis.compositionDepth,
            );

            functionVisibility.public += fileAnalysis.functionVisibility.public;
            functionVisibility.private += fileAnalysis.functionVisibility.private;
            functionVisibility.internal += fileAnalysis.functionVisibility.internal;

            viewFunctions += fileAnalysis.viewFunctions;
            pureFunctions += fileAnalysis.pureFunctions;

            // Security metrics
            integerOverflowRisks += fileAnalysis.integerOverflowRisks;
            accessControlIssues += fileAnalysis.accessControlIssues;
            inputValidationIssues += fileAnalysis.inputValidationIssues;
            unsafeCodeBlocks += fileAnalysis.unsafeCodeBlocks;
            panicUsage += fileAnalysis.panicUsage;
            unwrapUsage += fileAnalysis.unwrapUsage;
            expectUsage += fileAnalysis.expectUsage;
            matchWithoutDefault += fileAnalysis.matchWithoutDefault;
            arrayBoundsChecks += fileAnalysis.arrayBoundsChecks;
            memorySafetyIssues += fileAnalysis.memorySafetyIssues;

            // Integration metrics
            externalProgramCalls += fileAnalysis.externalProgramCalls;
            fileAnalysis.uniqueExternalCalls.forEach((call) =>
                uniqueExternalCalls.add(call),
            );
            knownProtocolInteractions.push(...fileAnalysis.knownProtocolInteractions);
            fileAnalysis.standardLibraryUsage.forEach((lib) =>
                standardLibraryUsage.add(lib),
            );
            oracleUsage.push(...fileAnalysis.oracleUsage);
            accessControlPatterns.ownable +=
                fileAnalysis.accessControlPatterns.ownable;
            accessControlPatterns.roleBased +=
                fileAnalysis.accessControlPatterns.roleBased;
            accessControlPatterns.custom += fileAnalysis.accessControlPatterns.custom;
            cpiUsage += fileAnalysis.cpiUsage;
            crossProgramInvocation.push(...fileAnalysis.crossProgramInvocation);

            // Economic metrics
            tokenTransfers += fileAnalysis.tokenTransfers;
            complexMathOperations += fileAnalysis.complexMathOperations;
            timeDependentLogic += fileAnalysis.timeDependentLogic;
            defiPatterns.push(...fileAnalysis.defiPatterns);
            economicRiskFactors.push(...fileAnalysis.economicRiskFactors);

            // Anchor-specific features
            anchorSpecificFeatures.accountValidation +=
                fileAnalysis.anchorSpecificFeatures.accountValidation;
            anchorSpecificFeatures.constraintUsage +=
                fileAnalysis.anchorSpecificFeatures.constraintUsage;
            anchorSpecificFeatures.instructionHandlers +=
                fileAnalysis.anchorSpecificFeatures.instructionHandlers;
            anchorSpecificFeatures.programDerives.push(
                ...fileAnalysis.anchorSpecificFeatures.programDerives,
            );
            anchorSpecificFeatures.accountTypes +=
                fileAnalysis.anchorSpecificFeatures.accountTypes;
            anchorSpecificFeatures.seedsUsage +=
                fileAnalysis.anchorSpecificFeatures.seedsUsage;
            anchorSpecificFeatures.bumpUsage +=
                fileAnalysis.anchorSpecificFeatures.bumpUsage;
            anchorSpecificFeatures.signerChecks +=
                fileAnalysis.anchorSpecificFeatures.signerChecks;
            anchorSpecificFeatures.ownerChecks +=
                fileAnalysis.anchorSpecificFeatures.ownerChecks;
            anchorSpecificFeatures.spaceAllocation +=
                fileAnalysis.anchorSpecificFeatures.spaceAllocation;
            anchorSpecificFeatures.rentExemption +=
                fileAnalysis.anchorSpecificFeatures.rentExemption;
        }

        return {
            totalLinesOfCode,
            numPrograms,
            numFunctions,
            numStateVariables,
            avgCyclomaticComplexity:
                numFunctions > 0 ? totalCyclomaticComplexity / numFunctions : 0,
            maxCyclomaticComplexity,
            compositionDepth,
            functionVisibility,
            viewFunctions,
            pureFunctions,
            integerOverflowRisks,
            accessControlIssues,
            inputValidationIssues,
            unsafeCodeBlocks,
            panicUsage,
            unwrapUsage,
            expectUsage,
            matchWithoutDefault,
            arrayBoundsChecks,
            memorySafetyIssues,
            externalProgramCalls,
            uniqueExternalCalls: uniqueExternalCalls.size,
            knownProtocolInteractions: Array.from(new Set(knownProtocolInteractions)),
            standardLibraryUsage: Array.from(standardLibraryUsage),
            oracleUsage,
            accessControlPatterns,
            cpiUsage,
            crossProgramInvocation,
            tokenTransfers,
            complexMathOperations,
            timeDependentLogic,
            defiPatterns,
            economicRiskFactors,
            anchorSpecificFeatures,
        };
    }

    /**
     * Analyze a single Rust file
     */
    private analyzeRustFile(content: string, _filePath: string): any {
        const _lines = content.split('\n');

        // Basic metrics
        const numPrograms = (content.match(/#\[program\]/g) || []).length;
        const numFunctions = (content.match(/fn\s+\w+/g) || []).length;
        // Count state variables - struct fields that represent state
        const structBlocks = content.match(
            /#\[account[^\]]*\]\s*pub\s+(struct|enum)\s+\w+\s*\{[^}]*\}/gs
        ) || [];
        let numStateVariables = 0;
        for (const structBlock of structBlocks) {
            // Count fields in each struct (lines that start with 'pub ')
            const fields = structBlock.match(/pub\s+\w+:/g) || [];
            numStateVariables += fields.length;
        }
        // Fallback: not needed anymore
        // if (numStateVariables === 0) {
        //     numStateVariables = (content.match(/pub\s+(struct|enum)/g) || []).length;
        // }

        // Function visibility
        const publicFunctions = (content.match(/pub\s+fn/g) || []).length;
        const privateFunctions = (content.match(/(?<!pub\s)fn/g) || []).length;

        // Security analysis
        const unsafeBlocks = (content.match(/unsafe\s*{/g) || []).length;
        const panicUsage = (content.match(/panic!/g) || []).length;
        const unwrapUsage = (content.match(/\.unwrap\(\)/g) || []).length;
        const expectUsage = (content.match(/\.expect\(/g) || []).length;
        const matchWithoutDefault = (
            content.match(/match\s+\w+\s*{[^}]*}(?!\s*else)/g) || []
        ).length;

        // Anchor-specific analysis
        const accountValidation = (content.match(/AccountInfo/g) || []).length;
        const constraintUsage = (content.match(/#\[constraint\(/g) || []).length;

        // Count instruction handlers - functions that take Context parameter
        const instructionHandlers = (
            content.match(/pub\s+fn\s+\w+[^{]*ctx:\s*Context/g) || []
        ).length;
        const programDerives = (content.match(/#\[derive\(([^)]+)\)\]/g) || [])
            .map((match) =>
                match
                    .replace(/#\[derive\(|\)\]/g, '')
                    .split(',')
                    .map((s) => s.trim()),
            )
            .flat();
        const seedsUsage = (content.match(/seeds\s*=/g) || []).length;
        const bumpUsage = (content.match(/bump\s*=/g) || []).length;
        const signerChecks = (content.match(/signer/g) || []).length;
        const ownerChecks = (content.match(/owner/g) || []).length;

        // DeFi pattern detection
        const defiPatterns: DeFiPattern[] = [];
        if (content.includes('swap') || content.includes('add_liquidity')) {
            defiPatterns.push({
                type: 'amm',
                complexity: 'medium',
                riskLevel: 'medium',
            });
        }
        if (
            content.includes('borrow') ||
            content.includes('repay') ||
            content.includes('liquidate')
        ) {
            defiPatterns.push({
                type: 'lending',
                complexity: 'medium',
                riskLevel: 'medium',
            });
        }
        if (content.includes('vest') || content.includes('unlock')) {
            defiPatterns.push({
                type: 'vesting',
                complexity: 'medium',
                riskLevel: 'medium',
            });
        }
        if (content.includes('stake') || content.includes('unstake')) {
            defiPatterns.push({
                type: 'staking',
                complexity: 'medium',
                riskLevel: 'medium',
            });
        }

        // Oracle detection
        const oracleUsage: OracleUsage[] = [];
        if (content.includes('pyth') || content.includes('Pyth')) {
            oracleUsage.push({
                oracle: 'Pyth',
                functions: content.match(/pyth|Pyth/g) || [],
                riskLevel: 'medium',
            });
        }
        if (content.includes('switchboard') || content.includes('Switchboard')) {
            oracleUsage.push({
                oracle: 'Switchboard',
                functions: content.match(/switchboard|Switchboard/g) || [],
                riskLevel: 'medium',
            });
        }

        // Economic risk factors
        const economicRiskFactors: EconomicRiskFactor[] = [];
        const integerOverflowRisks = (content.match(/overflow|underflow/g) || [])
            .length;
        if (integerOverflowRisks > 0) {
            economicRiskFactors.push({
                type: 'Integer Overflow',
                severity: 'medium',
                count: integerOverflowRisks,
                weight: 1,
            });
        }

        const divisionByZero = (content.match(/\/\s*0|\/\s*zero/g) || []).length;
        if (divisionByZero > 0) {
            economicRiskFactors.push({
                type: 'Division by Zero',
                severity: 'medium',
                count: divisionByZero,
                weight: 1,
            });
        }

        const precisionLoss = (content.match(/precision|rounding/g) || []).length;
        if (precisionLoss > 0) {
            economicRiskFactors.push({
                type: 'Precision Loss',
                severity: 'medium',
                count: precisionLoss,
                weight: 1,
            });
        }

        // Calculate cyclomatic complexity properly (per function)
        const { totalComplexity, maxComplexity } = this.calculateCyclomaticComplexity(content, numFunctions);

        return {
            numPrograms,
            numFunctions,
            numStateVariables,
            totalCyclomaticComplexity: totalComplexity,
            maxCyclomaticComplexity: maxComplexity,
            compositionDepth: 1, // Simplified
            functionVisibility: {
                public: publicFunctions,
                private: privateFunctions,
                internal: 0,
            },
            viewFunctions: 0, // Simplified
            pureFunctions: numFunctions,
            integerOverflowRisks,
            accessControlIssues: 0, // Simplified
            inputValidationIssues: 0, // Simplified
            unsafeCodeBlocks: unsafeBlocks,
            panicUsage,
            unwrapUsage,
            expectUsage,
            matchWithoutDefault,
            arrayBoundsChecks: 0, // Simplified
            memorySafetyIssues: unsafeBlocks,
            externalProgramCalls: 0, // Simplified
            uniqueExternalCalls: new Set(),
            knownProtocolInteractions: [],
            standardLibraryUsage: new Set(['anchor_lang', 'anchor_spl']),
            oracleUsage,
            accessControlPatterns: { ownable: 0, roleBased: 0, custom: 1 },
            cpiUsage: (content.match(/token::|invoke|invoke_signed|CpiContext/g) || []).length,
            crossProgramInvocation: [],
            tokenTransfers: (content.match(/transfer|mint|burn/g) || []).length,
            complexMathOperations: (content.match(/math|calculate|compute/g) || [])
                .length,
            timeDependentLogic: (content.match(/Clock::get|unix_timestamp|timestamp|last_updated|created_at/gi) || []).length,
            defiPatterns,
            economicRiskFactors,
            anchorSpecificFeatures: {
                accountValidation,
                constraintUsage,
                instructionHandlers,
                programDerives,
                accountTypes: (content.match(/struct\s+\w+/g) || []).length,
                seedsUsage,
                bumpUsage,
                signerChecks,
                ownerChecks,
                spaceAllocation: (content.match(/space\s*=/g) || []).length,
                rentExemption: (content.match(/rent|exempt/g) || []).length,
            },
        };
    }

    /**
     * Find Rust files in the repository
     */
    private findRustFiles(repoPath: string, selectedFiles?: string[]): string[] {
        const rustFiles: string[] = [];

        const findFiles = (dir: string) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (
                    stat.isDirectory() &&
                    !item.startsWith('.') &&
                    item !== 'node_modules'
                ) {
                    findFiles(fullPath);
                } else if (stat.isFile() && item.endsWith('.rs')) {
                    if (
                        !selectedFiles ||
                        selectedFiles.some((selected) => fullPath.includes(selected))
                    ) {
                        rustFiles.push(fullPath);
                    }
                }
            }
        };

        findFiles(repoPath);
        return rustFiles;
    }

    private lineCounter(content: string): number {
        const lines = content.split('\n');
        let codeLines = 0;
        let inMultiLineComment = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // Skip empty lines
            if (line.length === 0) {
                continue;
            }

            // Handle multi-line comments
            if (inMultiLineComment) {
                // Check if this line ends the multi-line comment
                const commentEndIndex = line.indexOf('*/');
                if (commentEndIndex !== -1) {
                    inMultiLineComment = false;
                    // Check if there's code after the comment end
                    const remainingLine = line.substring(commentEndIndex + 2).trim();
                    if (remainingLine.length > 0 && !remainingLine.startsWith('//')) {
                        codeLines++;
                    }
                }
                continue;
            }

            // Check for start of multi-line comment
            const commentStartIndex = line.indexOf('/*');
            if (commentStartIndex !== -1) {
                // Check if there's code before the comment start
                const codeBeforeComment = line.substring(0, commentStartIndex).trim();

                // Check if the comment ends on the same line
                const commentEndIndex = line.indexOf('*/', commentStartIndex + 2);
                if (commentEndIndex !== -1) {
                    // Single-line multi-line comment /* ... */
                    const codeAfterComment = line.substring(commentEndIndex + 2).trim();
                    const hasCodeBefore = codeBeforeComment.length > 0;
                    const hasCodeAfter = codeAfterComment.length > 0 && !codeAfterComment.startsWith('//');

                    if (hasCodeBefore || hasCodeAfter) {
                        codeLines++;
                    }
                } else {
                    // Multi-line comment starts here
                    inMultiLineComment = true;
                    if (codeBeforeComment.length > 0) {
                        codeLines++;
                    }
                }
                continue;
            }

            // Check for single-line comments
            const singleCommentIndex = line.indexOf('//');
            if (singleCommentIndex !== -1) {
                // Check if there's code before the comment
                const codeBeforeComment = line.substring(0, singleCommentIndex).trim();
                if (codeBeforeComment.length > 0) {
                    codeLines++;
                }
                continue;
            }

            // If we get here, it's a regular code line
            codeLines++;
        }

        return codeLines;
    }

    /**
     * Detect the framework used (Anchor, Native Solana, etc.)
     */
    private detectFramework(repoPath: string): string {
        try {
            this.logger.log(`Detecting framework for repository at: ${repoPath}`);

            // Log directory contents for debugging
            if (fs.existsSync(repoPath)) {
                const repoContents = fs.readdirSync(repoPath);
                this.logger.log(`Repository contents: ${repoContents.join(', ')}`);
            } else {
                this.logger.error(`Repository path does not exist: ${repoPath}`);
                return 'unknown';
            }

            // Check Cargo.toml for dependencies
            const cargoTomlPath = path.join(repoPath, 'Cargo.toml');
            if (fs.existsSync(cargoTomlPath)) {
                this.logger.log(`Found Cargo.toml at: ${cargoTomlPath}`);
                const cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
                this.logger.log(`Cargo.toml contents preview: ${cargoToml.substring(0, 500)}...`);

                // Check for Anchor framework
                if (cargoToml.includes('anchor-lang') || cargoToml.includes('anchor-spl')) {
                    this.logger.log('Detected Anchor framework from Cargo.toml');
                    return 'anchor';
                }

                // Check for Metaplex framework
                if (cargoToml.includes('mpl-token-metadata') || cargoToml.includes('metaplex')) {
                    this.logger.log('Detected Metaplex framework from Cargo.toml');
                    return 'metaplex';
                }

                // Check for Native Solana
                if (cargoToml.includes('solana-program') || cargoToml.includes('solana-sdk')) {
                    this.logger.log('Detected Native Solana framework from Cargo.toml');
                    return 'native';
                }

                // Check for other Solana frameworks
                if (cargoToml.includes('spl-token') || cargoToml.includes('spl-associated-token-account')) {
                    this.logger.log('Detected Native Solana framework from SPL dependencies');
                    return 'native';
                }

                this.logger.log('No framework detected in Cargo.toml, checking other indicators...');
            } else {
                this.logger.log(`Cargo.toml not found at: ${cargoTomlPath}`);
            }

            // Check for Anchor.toml file (Anchor project indicator)
            const anchorTomlPath = path.join(repoPath, 'Anchor.toml');
            if (fs.existsSync(anchorTomlPath)) {
                this.logger.log('Detected Anchor framework from Anchor.toml file');
                return 'anchor';
            } else {
                this.logger.log(`Anchor.toml not found at: ${anchorTomlPath}`);
            }

            // Check for program structure in src/
            const srcPath = path.join(repoPath, 'src');
            if (fs.existsSync(srcPath)) {
                const srcFiles = fs.readdirSync(srcPath);

                // Look for lib.rs or main.rs files
                const hasLibRs = srcFiles.includes('lib.rs');
                const hasMainRs = srcFiles.includes('main.rs');

                if (hasLibRs || hasMainRs) {
                    // Read the main file to check for framework imports
                    const mainFile = hasLibRs ? 'lib.rs' : 'main.rs';
                    const mainFilePath = path.join(srcPath, mainFile);

                    if (fs.existsSync(mainFilePath)) {
                        const mainFileContent = fs.readFileSync(mainFilePath, 'utf-8');

                        // Check for Anchor imports and patterns
                        if (mainFileContent.includes('anchor_lang') ||
                            mainFileContent.includes('#[program]') ||
                            mainFileContent.includes('use anchor_lang::') ||
                            mainFileContent.includes('Context<') ||
                            mainFileContent.includes('derive(Accounts)') ||
                            mainFileContent.includes('declare_id!') ||
                            mainFileContent.includes('anchor_spl')) {
                            return 'anchor';
                        }

                        // Check for Metaplex patterns
                        if (mainFileContent.includes('mpl_token_metadata') ||
                            mainFileContent.includes('metaplex') ||
                            mainFileContent.includes('create_metadata_accounts')) {
                            return 'metaplex';
                        }

                        // Check for Native Solana imports and patterns
                        if (mainFileContent.includes('solana_program') ||
                            mainFileContent.includes('use solana_program::') ||
                            mainFileContent.includes('entrypoint!') ||
                            mainFileContent.includes('process_instruction') ||
                            mainFileContent.includes('invoke') ||
                            mainFileContent.includes('invoke_signed') ||
                            mainFileContent.includes('AccountInfo') ||
                            mainFileContent.includes('Pubkey')) {
                            return 'native';
                        }
                    }
                }
            }

            // Check for workspace Cargo.toml (for multi-program projects)
            const workspaceCargoPath = path.join(repoPath, 'programs');
            if (fs.existsSync(workspaceCargoPath)) {
                this.logger.log(`Found programs directory at: ${workspaceCargoPath}`);
                const programs = fs.readdirSync(workspaceCargoPath);
                this.logger.log(`Programs found: ${programs.join(', ')}`);

                for (const program of programs) {
                    const programCargoPath = path.join(workspaceCargoPath, program, 'Cargo.toml');
                    if (fs.existsSync(programCargoPath)) {
                        this.logger.log(`Checking program Cargo.toml at: ${programCargoPath}`);
                        const programCargo = fs.readFileSync(programCargoPath, 'utf-8');
                        this.logger.log(`Program Cargo.toml contents preview: ${programCargo.substring(0, 300)}...`);

                        if (programCargo.includes('anchor-lang')) {
                            this.logger.log('Detected Anchor framework from program Cargo.toml');
                            return 'anchor';
                        }
                        if (programCargo.includes('mpl-token-metadata')) {
                            this.logger.log('Detected Metaplex framework from program Cargo.toml');
                            return 'metaplex';
                        }
                        if (programCargo.includes('solana-program')) {
                            this.logger.log('Detected Native Solana framework from program Cargo.toml');
                            return 'native';
                        }
                    }
                }
            } else {
                this.logger.log(`Programs directory not found at: ${workspaceCargoPath}`);
            }

            // Also check for workspace structure where root Cargo.toml defines workspace
            const rootCargoPath = path.join(repoPath, 'Cargo.toml');
            if (fs.existsSync(rootCargoPath)) {
                const rootCargo = fs.readFileSync(rootCargoPath, 'utf-8');
                if (rootCargo.includes('[workspace]')) {
                    this.logger.log('Found workspace Cargo.toml, checking workspace members...');
                    // Parse workspace members and check their Cargo.toml files
                    const workspaceMatch = rootCargo.match(/members\s*=\s*\[(.*?)\]/s);
                    if (workspaceMatch) {
                        const membersStr = workspaceMatch[1];
                        const members = membersStr.match(/"([^"]+)"/g)?.map(m => m.replace(/"/g, '')) || [];
                        this.logger.log(`Workspace members: ${members.join(', ')}`);

                        for (const member of members) {
                            const memberCargoPath = path.join(repoPath, member, 'Cargo.toml');
                            if (fs.existsSync(memberCargoPath)) {
                                const memberCargo = fs.readFileSync(memberCargoPath, 'utf-8');
                                if (memberCargo.includes('anchor-lang')) {
                                    this.logger.log(`Detected Anchor framework from workspace member: ${member}`);
                                    return 'anchor';
                                }
                                if (memberCargo.includes('solana-program')) {
                                    this.logger.log(`Detected Native Solana framework from workspace member: ${member}`);
                                    return 'native';
                                }
                            }
                        }
                    }
                }
            }

            this.logger.log('No framework detected, returning unknown');
            return 'unknown';
        } catch (error) {
            this.logger.warn(`Failed to detect framework: ${error.message}`);
            return 'unknown';
        }
    }

    /**
     * Calculate cyclomatic complexity properly per function
     */
    private calculateCyclomaticComplexity(content: string, numFunctions: number): { totalComplexity: number, maxComplexity: number } {
        // If no functions, return minimal complexity
        if (numFunctions === 0) {
            return { totalComplexity: 1, maxComplexity: 1 };
        }

        // Split content into functions (simplified approach)
        // Look for function boundaries using 'pub fn' and 'fn' patterns
        const functionPattern = /(?:pub\s+)?fn\s+\w+[^{]*\{/g;
        const functions = [];
        let match;
        let lastIndex = 0;

        // Find function starts
        const functionStarts: number[] = [];
        while ((match = functionPattern.exec(content)) !== null) {
            functionStarts.push(match.index);
        }

        // If we can't parse functions properly, use a simplified approach
        if (functionStarts.length === 0) {
            // Count decision points in entire file and estimate per function
            const totalDecisionPoints = this.countDecisionPoints(content);
            const avgComplexityPerFunction = Math.max(1, Math.ceil(totalDecisionPoints / numFunctions));
            return {
                totalComplexity: avgComplexityPerFunction * numFunctions,
                maxComplexity: Math.min(avgComplexityPerFunction * 2, totalDecisionPoints)
            };
        }

        // Extract function bodies (simplified - just use reasonable estimates)
        let totalComplexity = 0;
        let maxComplexity = 1;

        for (let i = 0; i < functionStarts.length; i++) {
            const start = functionStarts[i];
            const end = i < functionStarts.length - 1 ? functionStarts[i + 1] : content.length;
            const functionBody = content.substring(start, end);

            const functionComplexity = Math.max(1, this.countDecisionPoints(functionBody));
            totalComplexity += functionComplexity;
            maxComplexity = Math.max(maxComplexity, functionComplexity);
        }

        // If we found fewer functions than expected, estimate the rest
        if (functionStarts.length < numFunctions) {
            const avgComplexity = Math.ceil(totalComplexity / functionStarts.length);
            const remainingFunctions = numFunctions - functionStarts.length;
            totalComplexity += remainingFunctions * avgComplexity;
        }

        return { totalComplexity, maxComplexity };
    }

    /**
     * Count decision points for cyclomatic complexity
     */
    private countDecisionPoints(code: string): number {
        let complexity = 1; // Base complexity

        // Count control flow statements
        const controlFlowPatterns = [
            /\bif\b/g,           // if statements
            /\belse\s+if\b/g,    // else if statements  
            /\bwhile\b/g,        // while loops
            /\bfor\b/g,          // for loops
            /\bmatch\b/g,        // match expressions
            /\&\&/g,             // logical AND
            /\|\|/g,             // logical OR
            /\?/g,               // ternary operator / Result unwrap
        ];

        for (const pattern of controlFlowPatterns) {
            const matches = code.match(pattern) || [];
            complexity += matches.length;
        }

        // Count match arms (each arm adds complexity)
        const matchBlocks = code.match(/match\s+[^{]*\{([^}]*)\}/g) || [];
        for (const matchBlock of matchBlocks) {
            const arms = matchBlock.match(/=>/g) || [];
            complexity += Math.max(0, arms.length - 1); // -1 because match itself is already counted
        }

        return complexity;
    }

    /**
     * Calculate complexity scores based on analysis factors
     */
    private calculateComplexityScores(
        factors: RustAnalysisFactors,
    ): ComplexityScores {
        // Structural complexity score (0-100)
        const structuralScore = Math.min(
            100,
            (factors.totalLinesOfCode / 1000) * 20 +
            (factors.numFunctions / 50) * 20 +
            (factors.avgCyclomaticComplexity / 5) * 30 +
            (factors.maxCyclomaticComplexity / 10) * 30,
        );

        // Security complexity score (0-100)
        const securityScore = Math.min(
            100,
            factors.unsafeCodeBlocks * 20 +
            factors.panicUsage * 5 +
            factors.unwrapUsage * 2 +
            factors.memorySafetyIssues * 15 +
            factors.accessControlIssues * 10,
        );

        // Systemic complexity score (0-100)
        const systemicScore = Math.min(
            100,
            (factors.externalProgramCalls / 10) * 30 +
            (factors.uniqueExternalCalls / 5) * 20 +
            factors.oracleUsage.length * 15 +
            (factors.cpiUsage / 5) * 20 +
            (factors.anchorSpecificFeatures.constraintUsage / 10) * 15,
        );

        // Economic complexity score (0-100)
        const economicScore = Math.min(
            100,
            (factors.tokenTransfers / 10) * 25 +
            (factors.complexMathOperations / 20) * 25 +
            factors.defiPatterns.length * 15 +
            factors.economicRiskFactors.reduce(
                (sum, risk) => sum + risk.count * risk.weight,
                0,
            ) *
            2 +
            (factors.timeDependentLogic > 0 ? 20 : 0),
        );

        return {
            structural: {
                score: Math.round(structuralScore),
                details: {
                    totalLinesOfCode: factors.totalLinesOfCode,
                    numContracts: factors.numPrograms,
                    numFunctions: factors.numFunctions,
                    numStateVariables: factors.numStateVariables,
                    avgCyclomaticComplexity: factors.avgCyclomaticComplexity,
                    maxCyclomaticComplexity: factors.maxCyclomaticComplexity,
                    inheritanceDepth: factors.compositionDepth,
                },
            },
            security: {
                score: Math.round(securityScore),
                details: {
                    lowLevelOperations: {
                        assemblyBlocks: factors.unsafeCodeBlocks,
                        delegateCalls: 0, // Not applicable to Rust
                        rawCalls: 0, // Not applicable to Rust
                    },
                    securityCriticalFeatures: {
                        payableFunctions: 0, // Not applicable to Solana
                        txOriginUsage: 0, // Not applicable to Solana
                        selfDestructCalls: 0, // Not applicable to Solana
                        isProxyContract: false, // Simplified
                    },
                    riskFactors: factors.economicRiskFactors,
                },
            },
            systemic: {
                score: Math.round(systemicScore),
                details: {
                    externalDependencies: {
                        externalContractCalls: factors.externalProgramCalls,
                        uniqueFunctionCallsExternal: factors.uniqueExternalCalls,
                        knownProtocolInteractions: factors.knownProtocolInteractions,
                    },
                    standardInteractions: {
                        erc20Interactions:
                            factors.standardLibraryUsage.includes('anchor_spl'),
                        erc721Interactions: false, // Simplified
                        erc1155Interactions: false, // Simplified
                    },
                    oracleUsage: factors.oracleUsage,
                    accessControlPattern: {
                        type:
                            factors.accessControlPatterns.custom > 0 ? 'custom' : 'standard',
                        complexity:
                            factors.accessControlPatterns.custom > 2 ? 'high' : 'low',
                    },
                },
            },
            economic: {
                score: Math.round(economicScore),
                details: {
                    financialPrimitives: {
                        isAMM: factors.defiPatterns.some((p) => p.type === 'amm'),
                        isLendingProtocol: factors.defiPatterns.some(
                            (p) => p.type === 'lending',
                        ),
                        isVestingContract: factors.defiPatterns.some(
                            (p) => p.type === 'vesting',
                        ),
                        defiPatterns: factors.defiPatterns,
                    },
                    tokenomics: {
                        tokenTransfers: factors.tokenTransfers,
                        complexMathOperations: factors.complexMathOperations,
                        timeDependentLogic: factors.timeDependentLogic > 0,
                    },
                    economicRiskFactors: factors.economicRiskFactors,
                },
            },
        };
    }

    /**
     * Export reports to CSV format with factors as rows and reports as columns
     */
    async exportReportsToCSV(
        reportIds?: string[],
        factors?: string[],
    ): Promise<{ csv: string; filename: string }> {
        this.logger.log(`Exporting reports to CSV - IDs: ${reportIds?.length || 'all'}, Factors: ${factors?.length || 'all'}`);

        try {
            // Step 1: Get reports from database
            let reports: any[];

            if (reportIds && reportIds.length > 0) {
                reports = await this.staticAnalysisModel.find({
                    _id: { $in: reportIds }
                }).exec();
            } else {
                reports = await this.staticAnalysisModel.find().exec();
            }

            if (reports.length === 0) {
                throw new Error('No reports found for the specified criteria');
            }

            // Step 2: Get available factors metadata
            const availableFactors = await this.getAvailableFactors();

            // Step 3: Determine which factors to include
            const factorsToInclude = factors && factors.length > 0
                ? factors
                : this.getDefaultFactors();

            // Step 4: Generate CSV content with new layout (factors as rows, reports as columns)
            const csvContent = this.generateFactorRowsCSV(reports, factorsToInclude, availableFactors);

            // Step 5: Generate filename
            const timestamp = new Date().toISOString().split('T')[0];
            const reportCount = reports.length;
            const factorCount = factorsToInclude.length;
            const filename = `factors-analysis-${timestamp}-${factorCount}factors-${reportCount}reports.csv`;

            this.logger.log(`CSV export completed: ${factorsToInclude.length} factors across ${reports.length} reports`);

            return {
                csv: csvContent,
                filename,
            };

        } catch (error) {
            this.logger.error(`CSV export failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all available factors with metadata - aligned with actual report structure
     */
    async getAvailableFactors(): Promise<any> {
        return {
            // Basic Report Info
            basic: {
                category: 'Basic Information',
                description: 'Basic report metadata and identifiers',
                factors: {
                    _id: { name: 'Report ID', type: 'string', description: 'Unique identifier for the analysis report' },
                    repository: { name: 'Repository', type: 'string', description: 'Name of the analyzed repository' },
                    repositoryUrl: { name: 'Repository URL', type: 'string', description: 'URL of the analyzed repository' },
                    language: { name: 'Language', type: 'string', description: 'Programming language (e.g., rust)' },
                    framework: { name: 'Framework', type: 'string', description: 'Framework used (e.g., anchor, unknown)' },
                    createdAt: { name: 'Created At', type: 'date', description: 'When the analysis was performed' },
                    updatedAt: { name: 'Updated At', type: 'date', description: 'When the report was last updated' },
                }
            },

            // Complexity Scores
            scores: {
                category: 'Complexity Scores',
                description: 'Overall complexity scores for each category',
                factors: {
                    'scores.structural.score': { name: 'Structural Score', type: 'number', description: 'Overall structural complexity score (0-100)' },
                    'scores.security.score': { name: 'Security Score', type: 'number', description: 'Overall security complexity score (0-100)' },
                    'scores.systemic.score': { name: 'Systemic Score', type: 'number', description: 'Overall systemic & integration complexity score (0-100)' },
                    'scores.economic.score': { name: 'Economic Score', type: 'number', description: 'Overall economic & functional complexity score (0-100)' },

                    // Structural score details
                    'scores.structural.details.totalLinesOfCode': { name: 'Structural - Total Lines Of Code', type: 'number', description: 'Lines of code from structural analysis' },
                    'scores.structural.details.numContracts': { name: 'Structural - Number Of Contracts', type: 'number', description: 'Number of contracts from structural analysis' },
                    'scores.structural.details.numFunctions': { name: 'Structural - Number Of Functions', type: 'number', description: 'Number of functions from structural analysis' },
                    'scores.structural.details.numStateVariables': { name: 'Structural - State Variables', type: 'number', description: 'Number of state variables from structural analysis' },
                    'scores.structural.details.avgCyclomaticComplexity': { name: 'Structural - Avg Cyclomatic Complexity', type: 'number', description: 'Average cyclomatic complexity from structural analysis' },
                    'scores.structural.details.maxCyclomaticComplexity': { name: 'Structural - Max Cyclomatic Complexity', type: 'number', description: 'Maximum cyclomatic complexity from structural analysis' },
                    'scores.structural.details.inheritanceDepth': { name: 'Structural - Inheritance Depth', type: 'number', description: 'Inheritance depth from structural analysis' },

                    // Security score details
                    'scores.security.details.lowLevelOperations.assemblyBlocks': { name: 'Security - Assembly Blocks', type: 'number', description: 'Number of assembly blocks' },
                    'scores.security.details.lowLevelOperations.delegateCalls': { name: 'Security - Delegate Calls', type: 'number', description: 'Number of delegate calls' },
                    'scores.security.details.lowLevelOperations.rawCalls': { name: 'Security - Raw Calls', type: 'number', description: 'Number of raw calls' },
                    'scores.security.details.securityCriticalFeatures.payableFunctions': { name: 'Security - Payable Functions', type: 'number', description: 'Number of payable functions' },
                    'scores.security.details.securityCriticalFeatures.txOriginUsage': { name: 'Security - TX Origin Usage', type: 'number', description: 'Usage of tx.origin' },
                    'scores.security.details.securityCriticalFeatures.selfDestructCalls': { name: 'Security - Self Destruct Calls', type: 'number', description: 'Number of self destruct calls' },
                    'scores.security.details.securityCriticalFeatures.isProxyContract': { name: 'Security - Is Proxy Contract', type: 'boolean', description: 'Whether contract is a proxy' },

                    // Systemic score details
                    'scores.systemic.details.externalDependencies.externalContractCalls': { name: 'Systemic - External Contract Calls', type: 'number', description: 'Number of external contract calls' },
                    'scores.systemic.details.externalDependencies.uniqueFunctionCallsExternal': { name: 'Systemic - Unique External Function Calls', type: 'number', description: 'Number of unique external function calls' },
                    'scores.systemic.details.externalDependencies.knownProtocolInteractions': { name: 'Systemic - Known Protocol Interactions', type: 'array', description: 'Known protocol interactions' },
                    'scores.systemic.details.standardInteractions.erc20Interactions': { name: 'Systemic - ERC20 Interactions', type: 'boolean', description: 'Whether contract interacts with ERC20 tokens' },
                    'scores.systemic.details.standardInteractions.erc721Interactions': { name: 'Systemic - ERC721 Interactions', type: 'boolean', description: 'Whether contract interacts with ERC721 tokens' },
                    'scores.systemic.details.standardInteractions.erc1155Interactions': { name: 'Systemic - ERC1155 Interactions', type: 'boolean', description: 'Whether contract interacts with ERC1155 tokens' },
                    'scores.systemic.details.oracleUsage': { name: 'Systemic - Oracle Usage', type: 'array', description: 'Oracle usage details' },
                    'scores.systemic.details.accessControlPattern.type': { name: 'Systemic - Access Control Type', type: 'string', description: 'Type of access control pattern' },
                    'scores.systemic.details.accessControlPattern.complexity': { name: 'Systemic - Access Control Complexity', type: 'string', description: 'Complexity of access control pattern' },

                    // Economic score details
                    'scores.economic.details.financialPrimitives.isAMM': { name: 'Economic - Is AMM', type: 'boolean', description: 'Whether contract is an AMM' },
                    'scores.economic.details.financialPrimitives.isLendingProtocol': { name: 'Economic - Is Lending Protocol', type: 'boolean', description: 'Whether contract is a lending protocol' },
                    'scores.economic.details.financialPrimitives.isVestingContract': { name: 'Economic - Is Vesting Contract', type: 'boolean', description: 'Whether contract is a vesting contract' },
                    'scores.economic.details.financialPrimitives.defiPatterns': { name: 'Economic - DeFi Patterns', type: 'array', description: 'Detected DeFi patterns' },
                    'scores.economic.details.tokenomics.tokenTransfers': { name: 'Economic - Token Transfers', type: 'number', description: 'Number of token transfers' },
                    'scores.economic.details.tokenomics.complexMathOperations': { name: 'Economic - Complex Math Operations', type: 'number', description: 'Number of complex math operations' },
                    'scores.economic.details.tokenomics.timeDependentLogic': { name: 'Economic - Time Dependent Logic', type: 'boolean', description: 'Whether contract has time-dependent logic' },
                    'scores.economic.details.economicRiskFactors': { name: 'Economic - Risk Factors', type: 'array', description: 'Economic risk factors' },
                }
            },

            // Analysis Factors - Raw Metrics
            analysisFactors: {
                category: 'Analysis Factors',
                description: 'Raw analysis metrics extracted from code',
                factors: {
                    // Core structural metrics
                    'analysisFactors.totalLinesOfCode': { name: 'Total Lines of Code', type: 'number', description: 'Total number of code lines (excluding comments and empty lines)' },
                    'analysisFactors.numPrograms': { name: 'Number of Programs', type: 'number', description: 'Number of Solana programs defined' },
                    'analysisFactors.numFunctions': { name: 'Number of Functions', type: 'number', description: 'Total number of functions defined' },
                    'analysisFactors.numStateVariables': { name: 'State Variables', type: 'number', description: 'Number of state variables in account structs' },
                    'analysisFactors.avgCyclomaticComplexity': { name: 'Avg Cyclomatic Complexity', type: 'number', description: 'Average cyclomatic complexity per function' },
                    'analysisFactors.maxCyclomaticComplexity': { name: 'Max Cyclomatic Complexity', type: 'number', description: 'Maximum cyclomatic complexity in any function' },
                    'analysisFactors.compositionDepth': { name: 'Composition Depth', type: 'number', description: 'Maximum nesting depth in code blocks' },

                    // Function visibility
                    'analysisFactors.functionVisibility.public': { name: 'Public Functions', type: 'number', description: 'Number of public functions' },
                    'analysisFactors.functionVisibility.private': { name: 'Private Functions', type: 'number', description: 'Number of private functions' },
                    'analysisFactors.functionVisibility.internal': { name: 'Internal Functions', type: 'number', description: 'Number of internal functions' },
                    'analysisFactors.viewFunctions': { name: 'View Functions', type: 'number', description: 'Number of view functions' },
                    'analysisFactors.pureFunctions': { name: 'Pure Functions', type: 'number', description: 'Number of pure functions' },

                    // Security metrics
                    'analysisFactors.integerOverflowRisks': { name: 'Integer Overflow Risks', type: 'number', description: 'Number of potential integer overflow risks' },
                    'analysisFactors.accessControlIssues': { name: 'Access Control Issues', type: 'number', description: 'Number of access control issues' },
                    'analysisFactors.inputValidationIssues': { name: 'Input Validation Issues', type: 'number', description: 'Number of input validation issues' },
                    'analysisFactors.unsafeCodeBlocks': { name: 'Unsafe Code Blocks', type: 'number', description: 'Number of unsafe Rust code blocks' },
                    'analysisFactors.panicUsage': { name: 'Panic Usage', type: 'number', description: 'Usage of panic! macro' },
                    'analysisFactors.unwrapUsage': { name: 'Unwrap Usage', type: 'number', description: 'Usage of .unwrap() method' },
                    'analysisFactors.expectUsage': { name: 'Expect Usage', type: 'number', description: 'Usage of .expect() method' },
                    'analysisFactors.matchWithoutDefault': { name: 'Match Without Default', type: 'number', description: 'Number of match expressions without default arm' },
                    'analysisFactors.arrayBoundsChecks': { name: 'Array Bounds Checks', type: 'number', description: 'Number of array bounds checks' },
                    'analysisFactors.memorySafetyIssues': { name: 'Memory Safety Issues', type: 'number', description: 'Number of memory safety issues' },

                    // Integration metrics
                    'analysisFactors.externalProgramCalls': { name: 'External Program Calls', type: 'number', description: 'Number of calls to external Solana programs' },
                    'analysisFactors.uniqueExternalCalls': { name: 'Unique External Calls', type: 'number', description: 'Number of distinct external programs called' },
                    'analysisFactors.knownProtocolInteractions': { name: 'Known Protocol Interactions', type: 'array', description: 'List of known protocol interactions' },
                    'analysisFactors.standardLibraryUsage': { name: 'Standard Library Usage', type: 'array', description: 'List of standard libraries used' },
                    'analysisFactors.oracleUsage': { name: 'Oracle Usage', type: 'array', description: 'List of oracle integrations' },
                    'analysisFactors.cpiUsage': { name: 'CPI Usage', type: 'number', description: 'Cross-Program Invocation usage count' },
                    'analysisFactors.crossProgramInvocation': { name: 'Cross Program Invocations', type: 'array', description: 'Detailed CPI call information' },

                    // Access control patterns
                    'analysisFactors.accessControlPatterns.ownable': { name: 'Ownable Pattern', type: 'number', description: 'Usage of ownable access control pattern' },
                    'analysisFactors.accessControlPatterns.roleBased': { name: 'Role Based Pattern', type: 'number', description: 'Usage of role-based access control pattern' },
                    'analysisFactors.accessControlPatterns.custom': { name: 'Custom Access Control', type: 'number', description: 'Usage of custom access control patterns' },

                    // Economic metrics
                    'analysisFactors.tokenTransfers': { name: 'Token Transfers', type: 'number', description: 'Number of token transfer operations' },
                    'analysisFactors.complexMathOperations': { name: 'Complex Math Operations', type: 'number', description: 'Number of complex mathematical operations' },
                    'analysisFactors.timeDependentLogic': { name: 'Time-Dependent Logic', type: 'number', description: 'Number of time-dependent logic instances' },
                    'analysisFactors.defiPatterns': { name: 'DeFi Patterns', type: 'array', description: 'List of detected DeFi patterns' },
                    'analysisFactors.economicRiskFactors': { name: 'Economic Risk Factors', type: 'array', description: 'List of economic risk factors' },

                    // Anchor-specific features
                    'analysisFactors.anchorSpecificFeatures.accountValidation': { name: 'Account Validation', type: 'number', description: 'Number of account validation patterns' },
                    'analysisFactors.anchorSpecificFeatures.constraintUsage': { name: 'Constraint Usage', type: 'number', description: 'Number of Anchor constraints used' },
                    'analysisFactors.anchorSpecificFeatures.instructionHandlers': { name: 'Instruction Handlers', type: 'number', description: 'Number of instruction handler functions' },
                    'analysisFactors.anchorSpecificFeatures.programDerives': { name: 'Program Derives', type: 'array', description: 'List of derive macros used' },
                    'analysisFactors.anchorSpecificFeatures.accountTypes': { name: 'Account Types', type: 'number', description: 'Number of different account types used' },
                    'analysisFactors.anchorSpecificFeatures.seedsUsage': { name: 'Seeds Usage', type: 'number', description: 'Usage of PDA seeds' },
                    'analysisFactors.anchorSpecificFeatures.bumpUsage': { name: 'Bump Usage', type: 'number', description: 'Usage of bump seeds' },
                    'analysisFactors.anchorSpecificFeatures.signerChecks': { name: 'Signer Checks', type: 'number', description: 'Number of signer validation checks' },
                    'analysisFactors.anchorSpecificFeatures.ownerChecks': { name: 'Owner Checks', type: 'number', description: 'Number of owner validation checks' },
                    'analysisFactors.anchorSpecificFeatures.spaceAllocation': { name: 'Space Allocation', type: 'number', description: 'Account space allocation instances' },
                    'analysisFactors.anchorSpecificFeatures.rentExemption': { name: 'Rent Exemption', type: 'number', description: 'Rent exemption handling instances' },
                }
            },

            // Performance Metrics
            performance: {
                category: 'Performance Metrics',
                description: 'Analysis performance and resource usage',
                factors: {
                    'performance.analysisTime': { name: 'Analysis Time (ms)', type: 'number', description: 'Time taken to complete the analysis' },
                    'performance.memoryUsage': { name: 'Memory Usage (bytes)', type: 'number', description: 'Memory consumed during analysis' },
                }
            },
        };
    }

    /**
     * Get default factors for CSV export when none specified
     */
    private getDefaultFactors(): string[] {
        return [
            // Basic Info
            'repository',
            'framework',

            // Complexity Scores (corrected to match actual structure)
            'scores.structural.score',
            'scores.security.score',
            'scores.systemic.score',
            'scores.economic.score',

            // Key Structural Metrics
            'analysisFactors.totalLinesOfCode',
            'analysisFactors.numFunctions',
            'analysisFactors.numPrograms',
            'analysisFactors.avgCyclomaticComplexity',
            'analysisFactors.maxCyclomaticComplexity',

            // Key Security Metrics
            'analysisFactors.unsafeCodeBlocks',
            'analysisFactors.panicUsage',
            'analysisFactors.unwrapUsage',
            'analysisFactors.accessControlIssues',

            // Key Integration Metrics
            'analysisFactors.cpiUsage',
            'analysisFactors.externalProgramCalls',
            'analysisFactors.oracleUsage',

            // Key Economic Metrics
            'analysisFactors.tokenTransfers',
            'analysisFactors.complexMathOperations',
            'analysisFactors.timeDependentLogic',
            'analysisFactors.defiPatterns',

            // Anchor Features
            'analysisFactors.anchorSpecificFeatures.instructionHandlers',
            'analysisFactors.anchorSpecificFeatures.ownerChecks',

            // Performance
            'performance.analysisTime'
        ];
    }

    /**
     * Generate CSV with factors as rows and reports as columns
     */
    private generateFactorRowsCSV(
        reports: any[],
        factorsToInclude: string[],
        availableFactors: any,
    ): string {
        this.logger.log(`Generating factor-rows CSV for ${factorsToInclude.length} factors across ${reports.length} reports`);

        // Step 1: Create header row
        const headerRow = ['Factor', 'Category', ...reports.map(report => {
            const reportObj = report.toObject ? report.toObject() : report;
            return reportObj.repository || `Report-${reportObj._id?.toString().slice(-6)}`;
        })];

        // Step 2: Create rows for each factor
        const csvRows: string[] = [];
        csvRows.push(headerRow.join(','));

        // Step 3: Process each factor
        for (const factorPath of factorsToInclude) {
            const row: string[] = [];

            // Column 1: Factor name (friendly)
            const factorInfo = this.getFactorInfo(factorPath, availableFactors);
            row.push(this.escapeCSVValue(factorInfo.name));

            // Column 2: Category
            row.push(this.escapeCSVValue(factorInfo.category));

            // Columns 3+: Values for each report
            for (const report of reports) {
                const reportObj = report.toObject ? report.toObject() : report;
                const value = this.getFactorValue(reportObj, factorPath);
                row.push(this.escapeCSVValue(value));
            }

            csvRows.push(row.join(','));
        }

        this.logger.log(`Generated factor-rows CSV with ${factorsToInclude.length} factor rows and ${reports.length} report columns`);
        return csvRows.join('\n');
    }

    /**
     * Get factor information (name and category) from metadata
     */
    private getFactorInfo(factorPath: string, availableFactors: any): { name: string; category: string } {
        // Search through all categories to find this factor
        for (const [categoryKey, categoryData] of Object.entries(availableFactors)) {
            const category = categoryData as any;
            if (category.factors && category.factors[factorPath]) {
                return {
                    name: category.factors[factorPath].name || this.createFriendlyName(factorPath),
                    category: category.category || categoryKey
                };
            }
        }

        // Fallback if factor not found in metadata
        return {
            name: this.createFriendlyName(factorPath),
            category: this.inferCategory(factorPath)
        };
    }

    /**
     * Get factor value from report object
     */
    private getFactorValue(reportObj: any, factorPath: string): any {
        // Handle special array summary fields
        if (factorPath.includes('_count') || factorPath.includes('_types') || factorPath.includes('_list') || factorPath.includes('_severities')) {
            return this.extractArraySummary(reportObj, factorPath);
        }

        // Handle nested paths with dot notation
        return this.getNestedValue(reportObj, factorPath);
    }

    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : '';
        }, obj);
    }

    /**
     * Extract clean array summaries for CSV
     */
    private extractArraySummary(reportObj: any, factor: string): any {
        // Oracle Usage
        if (factor === 'oracleUsage_count') {
            const oracles = this.getNestedValue(reportObj, 'analysisFactors.oracleUsage') || [];
            return Array.isArray(oracles) ? oracles.length : 0;
        }
        if (factor === 'oracleUsage_types') {
            const oracles = this.getNestedValue(reportObj, 'analysisFactors.oracleUsage') || [];
            if (!Array.isArray(oracles) || oracles.length === 0) return '';
            const types = oracles.map((o: any) => o.oracle || o.type || o.name).filter(Boolean);
            return types.join('; ');
        }

        // DeFi Patterns
        if (factor === 'defiPatterns_count') {
            const patterns = this.getNestedValue(reportObj, 'analysisFactors.defiPatterns') || [];
            return Array.isArray(patterns) ? patterns.length : 0;
        }
        if (factor === 'defiPatterns_types') {
            const patterns = this.getNestedValue(reportObj, 'analysisFactors.defiPatterns') || [];
            if (!Array.isArray(patterns) || patterns.length === 0) return '';
            const types = patterns.map((p: any) => p.type).filter(Boolean);
            return types.join('; ');
        }

        // Economic Risk Factors
        if (factor === 'economicRiskFactors_count') {
            const risks = this.getNestedValue(reportObj, 'analysisFactors.economicRiskFactors') || [];
            return Array.isArray(risks) ? risks.length : 0;
        }
        if (factor === 'economicRiskFactors_severities') {
            const risks = this.getNestedValue(reportObj, 'analysisFactors.economicRiskFactors') || [];
            if (!Array.isArray(risks) || risks.length === 0) return '';
            const severities = risks.map((r: any) => r.severity).filter(Boolean);
            return severities.join('; ');
        }

        // Known Protocol Interactions
        if (factor === 'knownProtocolInteractions_count') {
            const protocols = this.getNestedValue(reportObj, 'analysisFactors.knownProtocolInteractions') || [];
            return Array.isArray(protocols) ? protocols.length : 0;
        }
        if (factor === 'knownProtocolInteractions_list') {
            const protocols = this.getNestedValue(reportObj, 'analysisFactors.knownProtocolInteractions') || [];
            if (!Array.isArray(protocols) || protocols.length === 0) return '';
            return protocols.join('; ');
        }

        return '';
    }

    /**
     * Create friendly name from factor path
     */
    private createFriendlyName(factorPath: string): string {
        return factorPath
            .replace(/analysisFactors\.|scores\./g, '') // Remove prefixes
            .replace(/[._]/g, ' ') // Replace dots and underscores with spaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Infer category from factor path
     */
    private inferCategory(factorPath: string): string {
        if (factorPath.startsWith('scores.structural') || factorPath.includes('LinesOfCode') || factorPath.includes('Functions') || factorPath.includes('Complexity')) {
            return 'Structural';
        }
        if (factorPath.startsWith('scores.semantic') || factorPath.includes('unsafe') || factorPath.includes('panic') || factorPath.includes('Security')) {
            return 'Security';
        }
        if (factorPath.startsWith('scores.systemic') || factorPath.includes('cpi') || factorPath.includes('external') || factorPath.includes('oracle')) {
            return 'Integration';
        }
        if (factorPath.startsWith('scores.economic') || factorPath.includes('token') || factorPath.includes('defi') || factorPath.includes('economic')) {
            return 'Economic';
        }
        if (factorPath.includes('anchor')) {
            return 'Anchor';
        }
        if (factorPath.includes('performance')) {
            return 'Performance';
        }
        return 'Other';
    }

    /**
     * Escape CSV values properly
     */
    private escapeCSVValue(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }

        let stringValue = String(value);

        // Handle arrays by joining with semicolon
        if (Array.isArray(value)) {
            stringValue = value.join('; ');
        }

        // Handle objects by converting to JSON
        if (typeof value === 'object' && !Array.isArray(value)) {
            stringValue = JSON.stringify(value);
        }

        // Handle booleans
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }

        // Handle dates
        if (value instanceof Date) {
            return value.toISOString();
        }

        // Escape quotes and wrap in quotes if needed
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    }

    /**
     * Cleanup extracted directory after analysis
     */
    private async cleanupExtractedDirectory(extractedPath: string): Promise<void> {
        try {
            if (fs.existsSync(extractedPath)) {
                fs.rmSync(extractedPath, { recursive: true, force: true });
                this.logger.log(`Cleaned up extracted directory: ${extractedPath}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to cleanup extracted directory: ${error.message}`);
            throw error;
        }
    }
}
