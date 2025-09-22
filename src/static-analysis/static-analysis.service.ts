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
            const lines = content.split('\n');
            totalLinesOfCode += lines.length;

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
        const structBlocks = content.match(/#\[account\]\s*pub\s+struct\s+\w+\s*\{[^}]*\}/g) || [];
        let numStateVariables = 0;
        for (const structBlock of structBlocks) {
            // Count fields in each struct (lines that start with 'pub ')
            const fields = structBlock.match(/pub\s+\w+:/g) || [];
            numStateVariables += fields.length;
        }
        // Fallback: if no #[account] structs found, count all struct definitions
        if (numStateVariables === 0) {
            numStateVariables = (content.match(/pub\s+(struct|enum)/g) || []).length;
        }

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
