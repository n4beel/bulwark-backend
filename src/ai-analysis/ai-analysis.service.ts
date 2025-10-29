import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocumentationMetrics {
    codeCommentsScore: number;
    functionDocumentationScore: number;
    readmeQualityScore: number;
    securityDocumentationScore: number;
    overallClarityScore: number;
    findings: string[];
    confidence: number;
}

export interface TestingMetrics {
    unitTestCoverage: number;
    integrationTestCoverage: number;
    testQualityScore: number;
    edgeCaseTestingScore: number;
    securityTestScore: number;
    overallTestingScore: number;
    findings: string[];
    confidence: number;
}

export interface FinancialLogicMetrics {
    mathematicalComplexityScore: number;
    algorithmSophisticationScore: number;
    interestRateComplexityScore: number;
    ammPricingComplexityScore: number;
    rewardDistributionComplexityScore: number;
    riskManagementComplexityScore: number;
    overallFinancialComplexityScore: number;
    findings: string[];
    confidence: number;
}

export interface AttackVectorMetrics {
    flashLoanAttackRisk: number;
    sandwichAttackRisk: number;
    arbitrageOpportunities: number;
    economicExploitRisk: number;
    overallAttackVectorScore: number;
    findings: string[];
    confidence: number;
}

export interface ValueAtRiskMetrics {
    assetVolumeComplexity: number;
    liquidityRiskScore: number;
    marketCapImplications: number;
    economicStakesScore: number;
    overallValueAtRiskScore: number;
    findings: string[];
    confidence: number;
}

export interface GameTheoryMetrics {
    incentiveAlignmentScore: number;
    economicSecurityDependencies: number;
    maliciousActorResistance: number;
    protocolGovernanceComplexity: number;
    overallGameTheoryScore: number;
    findings: string[];
    confidence: number;
}

export interface RiskHotspot {
    file: string;
    lines: string;
    risk_score: number;
    components: string[];
}

export interface CodeMetrics {
    highRiskHotspots: RiskHotspot[];
    mediumRiskHotspots: RiskHotspot[];
    recommendations: string[];
    overallRiskScore: number;
    findings: string[];
    confidence: number;
}

export interface AiAnalysisResults {
    codeAnalysis: CodeMetrics;
    documentationClarity: DocumentationMetrics;
    testingCoverage: TestingMetrics;
    financialLogicIntricacy: FinancialLogicMetrics;
    profitAttackVectors: AttackVectorMetrics;
    valueAtRisk: ValueAtRiskMetrics;
}

@Injectable()
export class AiAnalysisService {
    private readonly logger = new Logger(AiAnalysisService.name);

    constructor(private readonly aiService: AIService) { }

    private getOpenAIClient() {
        const openai = (this.aiService as any).openai;
        if (!openai) {
            throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
        }
        return openai;
    }

    async analyzeFactors(
        extractedPath: string,
        rustAnalysisResults: any,
        selectedFiles?: string[]
    ): Promise<AiAnalysisResults> {
        this.logger.log('Starting comprehensive AI analysis...');

        try {
            // Prepare comprehensive context
            const context = await this.prepareComprehensiveContext(extractedPath, rustAnalysisResults, selectedFiles);

            this.logger.log(`Prepared context: ${context.codeFiles.length} files, ${context.totalLines} lines of code`);

            // Execute analyses in batches to avoid rate limits
            // Batch 1: Core factors (most important)
            const [codeAnalysisResult, documentationResult, testingResult, financialLogicResult, attackVectorsResult, valueAtRiskResult] = await Promise.allSettled([
                this.analyzeCode(context),
                this.analyzeDocumentationClarity(context),
                this.analyzeTestingCoverage(context),
                this.analyzeFinancialLogicIntricacy(context),
                this.analyzeProfitAttackVectors(context),
                this.analyzeValueAtRisk(context)
            ]);

            const results: AiAnalysisResults = {
                codeAnalysis: this.extractResult(codeAnalysisResult, 'CodeMetrics'),
                documentationClarity: this.extractResult(documentationResult, 'DocumentationMetrics'),
                testingCoverage: this.extractResult(testingResult, 'TestingMetrics'),
                financialLogicIntricacy: this.extractResult(financialLogicResult, 'FinancialLogicMetrics'),
                profitAttackVectors: this.extractResult(attackVectorsResult, 'AttackVectorMetrics'),
                valueAtRisk: this.extractResult(valueAtRiskResult, 'ValueAtRiskMetrics'),
            };

            this.logger.log('AI analysis completed successfully');
            return results;

        } catch (error) {
            this.logger.error(`AI analysis failed: ${error.message}`);
            throw error;
        }
    }

    private async prepareComprehensiveContext(
        extractedPath: string,
        rustAnalysisResults: any,
        selectedFiles?: string[]
    ): Promise<any> {
        const files = selectedFiles || await this.getAllRustFiles(extractedPath);
        const codeFiles: any[] = [];
        let totalLines = 0;

        // Process files with comprehensive metadata
        for (const file of files.slice(0, 15)) { // Limit to 15 most important files to reduce token usage
            try {
                const filePath = path.join(extractedPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n').length;
                totalLines += lines;

                codeFiles.push({
                    path: file,
                    content: content,
                    lines: lines,
                    size: content.length,
                    isMain: file.includes('main.rs') || file.includes('lib.rs'),
                    isTest: file.includes('test') || file.includes('spec'),
                    isInstruction: file.includes('instruction') || file.includes('handler'),
                });
            } catch (error) {
                this.logger.warn(`Failed to read file ${file}: ${error.message}`);
            }
        }

        // Sort files by importance (main files first, then by size)
        codeFiles.sort((a, b) => {
            if (a.isMain && !b.isMain) return -1;
            if (!a.isMain && b.isMain) return 1;
            return b.size - a.size;
        });

        return {
            codeFiles,
            totalLines,
            rustAnalysisResults,
            extractedPath,
            fileCount: files.length,
        };
    }

    private async analyzeCode(context: any): Promise<CodeMetrics> {
        const prompt = this.buildCodePrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getCodeSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 2000,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'CodeMetrics');
    }

    private async analyzeDocumentationClarity(context: any): Promise<DocumentationMetrics> {
        const prompt = this.buildDocumentationPrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getDocumentationSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'DocumentationMetrics');
    }

    private async analyzeTestingCoverage(context: any): Promise<TestingMetrics> {
        const prompt = this.buildTestingPrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getTestingSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'TestingMetrics');
    }

    private async analyzeFinancialLogicIntricacy(context: any): Promise<FinancialLogicMetrics> {
        const prompt = this.buildFinancialLogicPrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getFinancialLogicSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'FinancialLogicMetrics');
    }

    private async analyzeProfitAttackVectors(context: any): Promise<AttackVectorMetrics> {
        const prompt = this.buildAttackVectorsPrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getAttackVectorsSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'AttackVectorMetrics');
    }

    private async analyzeValueAtRisk(context: any): Promise<ValueAtRiskMetrics> {
        const prompt = this.buildValueAtRiskPrompt(context);
        const openai = this.getOpenAIClient();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: this.getValueAtRiskSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;
        return this.parseAndValidateResponse(content, 'ValueAtRiskMetrics');
    }

    // System Prompts for each factor
    private getDocumentationSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for documentation quality.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "codeCommentsScore": number (0-100),
  "functionDocumentationScore": number (0-100),
  "readmeQualityScore": number (0-100),
  "securityDocumentationScore": number (0-100),
  "overallClarityScore": number (0-100),
  "findings": string[],
  "confidence": number (0-100)
}

Scoring Guidelines:
- 90-100: Excellent documentation with comprehensive comments, clear function docs, detailed README
- 70-89: Good documentation with minor gaps
- 50-69: Adequate documentation with some issues
- 30-49: Poor documentation with significant gaps
- 0-29: Very poor or missing documentation

Always provide specific findings that justify your scores.`;
    }

    private getTestingSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for testing coverage and quality.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "unitTestCoverage": number (0-100),
  "integrationTestCoverage": number (0-100),
  "testQualityScore": number (0-100),
  "edgeCaseTestingScore": number (0-100),
  "securityTestScore": number (0-100),
  "overallTestingScore": number (0-100),
  "findings": string[],
  "confidence": number (0-100)
}

Scoring Guidelines:
- 90-100: Comprehensive test suite with unit tests, integration tests, edge cases, and security tests
- 70-89: Good test coverage with minor gaps
- 50-69: Adequate testing with some coverage gaps
- 30-49: Poor testing with significant gaps
- 0-29: Very poor or missing tests

Always provide specific findings that justify your scores.`;
    }

    private getFinancialLogicSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for financial logic complexity.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "mathematicalComplexityScore": number (0-100),
  "algorithmSophisticationScore": number (0-100),
  "interestRateComplexityScore": number (0-100),
  "ammPricingComplexityScore": number (0-100),
  "rewardDistributionComplexityScore": number (0-100),
  "riskManagementComplexityScore": number (0-100),
  "overallFinancialComplexityScore": number (0-100),
  "findings": string[],
  "confidence": number (0-100)
}

Scoring Guidelines:
- 90-100: Highly sophisticated financial algorithms with complex mathematical operations
- 70-89: Advanced financial logic with moderate complexity
- 50-69: Standard financial operations with some complexity
- 30-49: Basic financial logic with limited complexity
- 0-29: Simple or minimal financial operations

Always provide specific findings that justify your scores.`;
    }

    private getAttackVectorsSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for potential profit attack vectors.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "flashLoanAttackRisk": number (0-100),
  "sandwichAttackRisk": number (0-100),
  "arbitrageOpportunities": number (0-100),
  "economicExploitRisk": number (0-100),
  "overallAttackVectorScore": number (0-100),
  "findings": string[],
  "confidence": number (0-100)
}

Scoring Guidelines:
- 90-100: High risk of multiple attack vectors with significant profit potential
- 70-89: Moderate risk with some exploitable opportunities
- 50-69: Some attack vectors present but limited impact
- 30-49: Low risk with minimal exploitable opportunities
- 0-29: Very low risk with no significant attack vectors

Always provide specific findings that justify your scores.`;
    }

    private getValueAtRiskSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for value at risk and asset volume implications.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "assetVolumeComplexity": number (0-100),
  "liquidityRiskScore": number (0-100),
  "marketCapImplications": number (0-100),
  "economicStakesScore": number (0-100),
  "overallValueAtRiskScore": number (0-100),
  "findings": string[],
  "confidence": number (0-100)
}

Scoring Guidelines:
- 90-100: High-value protocol with complex asset management and significant economic stakes
- 70-89: Moderate value with some complexity in asset handling
- 50-69: Standard value with basic asset management
- 30-49: Low value with simple asset operations
- 0-29: Minimal value with very basic operations

Always provide specific findings that justify your scores.`;
    }

    private getCodeSystemPrompt(): string {
        return `You are an expert smart contract security auditor analyzing Rust code for risk hotspots and security vulnerabilities.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text.

Your response must match this exact schema:
{
  "highRiskHotspots": [
    {
      "file": string (relative file path),
      "lines": string (line range like "210-348"),
      "risk_score": number (0-1, where 1 is highest risk),
      "components": string[] (array of risk components like ["pda_derivation", "lamport_math"])
    }
  ],
  "mediumRiskHotspots": [
    {
      "file": string (relative file path),
      "lines": string (line range like "55-144"),
      "risk_score": number (0-1, where 1 is highest risk),
      "components": string[] (array of risk components like ["cpi_signer", "oracle_read"])
    }
  ],
  "recommendations": string[] (array of specific improvement recommendations),
  "overallRiskScore": number (0-100, overall risk assessment),
  "findings": string[] (array of general findings),
  "confidence": number (0-100, confidence in the analysis)
}

Risk Assessment Guidelines:
- HIGH RISK (0.7-1.0): Critical vulnerabilities, complex financial logic, unsafe operations, missing checks
- MEDIUM RISK (0.4-0.69): Potential issues, moderate complexity, some missing validations
- LOW RISK (0.0-0.39): Minor issues, well-implemented code, good practices

Focus on identifying:
1. Complex financial calculations and mathematical operations
2. PDA derivation and account validation logic
3. CPI calls and external integrations
4. Oracle usage and price feed dependencies
5. Unsafe operations and potential overflow/underflow
6. Missing access controls and authorization checks
7. Reentrancy and state manipulation risks
8. Economic attack vectors and MEV opportunities

Always provide specific file paths, line ranges, and detailed component descriptions.`;
    }

    // Prompt builders with comprehensive context
    private buildCodePrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 12000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze this Rust smart contract for risk hotspots and security vulnerabilities:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- Main Files: ${context.codeFiles.filter(f => f.isMain).length}
- Test Files: ${context.codeFiles.filter(f => f.isTest).length}
- Complex Functions: ${context.rustAnalysisResults?.complexFunctions || 'Unknown'}
- CPI Calls: ${context.rustAnalysisResults?.cpiCalls || 'Unknown'}
- Unsafe Operations: ${context.rustAnalysisResults?.unsafeOperations || 'Unknown'}

ANALYSIS REQUIREMENTS:
1. Identify HIGH RISK hotspots (0.7-1.0 risk score):
   - Critical vulnerabilities and security flaws
   - Complex financial calculations with potential for errors
   - Unsafe operations and potential overflow/underflow
   - Missing access controls and authorization checks
   - PDA derivation logic with potential vulnerabilities
   - CPI calls with insufficient validation

2. Identify MEDIUM RISK hotspots (0.4-0.69 risk score):
   - Potential issues that need attention
   - Moderate complexity areas that could be simplified
   - Some missing validations or error handling
   - Areas with unclear logic or potential edge cases

3. Provide specific recommendations for improvement:
   - Code refactoring suggestions
   - Security improvements
   - Best practice implementations
   - Architecture improvements

4. Focus on these specific areas:
   - Mathematical operations and financial calculations
   - Account validation and PDA derivation
   - External integrations and CPI calls
   - Oracle usage and price feed dependencies
   - State management and reentrancy risks
   - Economic attack vectors and MEV opportunities

For each hotspot, provide:
- Exact file path (relative to project root)
- Specific line range where the risk is located
- Risk score (0-1 scale)
- Components involved (e.g., ["pda_derivation", "lamport_math", "cpi_signer"])
- Clear justification for the risk assessment

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    private buildDocumentationPrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 8000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze the documentation quality of this Rust smart contract:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- Main Files: ${context.codeFiles.filter(f => f.isMain).length}
- Test Files: ${context.codeFiles.filter(f => f.isTest).length}

ANALYSIS REQUIREMENTS:
1. Evaluate code comment quality and coverage throughout the codebase
2. Assess function documentation completeness, especially for public functions
3. Check for README, specification, or documentation files
4. Look for security documentation, audit reports, or security considerations
5. Consider the complexity context from Rust analysis when evaluating documentation needs
6. Pay special attention to complex financial logic that requires detailed documentation

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    private buildTestingPrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 8000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze the testing coverage and quality of this Rust smart contract:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- Test Files: ${context.codeFiles.filter(f => f.isTest).length}
- Main Files: ${context.codeFiles.filter(f => f.isMain).length}

ANALYSIS REQUIREMENTS:
1. Evaluate unit test coverage and quality
2. Assess integration test presence and comprehensiveness
3. Check for edge case testing, especially for financial operations
4. Look for security-focused tests and vulnerability testing
5. Consider the complexity context from Rust analysis when evaluating testing needs
6. Pay special attention to testing of complex mathematical operations and financial logic

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    private buildFinancialLogicPrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 10000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze the financial logic intricacy of this Rust smart contract:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- Complex Functions: ${context.rustAnalysisResults?.complexFunctions || 'Unknown'}

ANALYSIS REQUIREMENTS:
1. Evaluate mathematical complexity of calculations and algorithms
2. Assess sophistication of financial algorithms (AMM curves, interest calculations, etc.)
3. Analyze interest rate calculation complexity and mechanisms
4. Examine AMM pricing curve sophistication and mathematical operations
5. Review reward distribution logic complexity and fairness mechanisms
6. Assess risk management algorithms and their mathematical foundations
7. Consider the context from Rust analysis showing arithmetic operations and mathematical complexity

Focus on identifying sophisticated financial mechanisms that require careful audit attention.

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    private buildAttackVectorsPrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 10000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze potential profit attack vectors in this Rust smart contract:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- CPI Calls: ${context.rustAnalysisResults?.cpiCalls || 'Unknown'}
- External Integrations: ${context.rustAnalysisResults?.externalIntegrations || 'Unknown'}

ANALYSIS REQUIREMENTS:
1. Identify flash loan attack opportunities and MEV vulnerabilities
2. Assess sandwich attack risks in trading/swap mechanisms
3. Look for arbitrage opportunities between different price sources
4. Evaluate economic exploit risks where attackers can profit from protocol design
5. Consider the context from Rust analysis showing external integrations and CPI calls
6. Focus on scenarios where attackers can profit without exploiting code bugs

Look for economic vulnerabilities that could be exploited for profit.

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    private buildValueAtRiskPrompt(context: any): string {
        const codeContent = this.truncateCodeContent(context.codeFiles, 8000);
        const rustContext = this.formatRustAnalysisContext(context.rustAnalysisResults);

        return `Analyze the value at risk and asset volume implications of this Rust smart contract:

CODE CONTEXT:
${codeContent}

RUST ANALYSIS CONTEXT:
${rustContext}

PROJECT METADATA:
- Total Files: ${context.fileCount}
- Total Lines: ${context.totalLines}
- Asset Types: ${context.rustAnalysisResults?.assetTypes || 'Unknown'}

ANALYSIS REQUIREMENTS:
1. Evaluate asset volume complexity and multi-asset handling
2. Assess liquidity risk and market impact potential
3. Analyze market cap implications and economic scale
4. Review economic stakes and value at risk in the protocol
5. Consider the context from Rust analysis showing asset handling complexity
6. Focus on protocols that could handle significant value or have market impact

Assess the economic scale and potential impact of this protocol.

Provide your analysis as JSON following the exact schema specified in the system prompt.`;
    }

    // Utility methods
    private truncateCodeContent(codeFiles: any[], maxTokens: number): string {
        const maxChars = maxTokens * 3; // More conservative estimation: 1 token ≈ 3 characters
        let content = '';

        for (const file of codeFiles) {
            const fileContent = `=== FILE: ${file.path} (${file.lines} lines) ===\n${file.content}\n\n`;

            if (content.length + fileContent.length > maxChars) {
                content += `\n... [Additional files truncated for token limits] ...\n`;
                break;
            }

            content += fileContent;
        }

        return content;
    }

    private formatRustAnalysisContext(rustResults: any): string {
        if (!rustResults) return 'No Rust analysis results available.';

        return `
RUST ANALYSIS SUMMARY:
- Total Lines of Code: ${rustResults.totalLinesOfCode || 'Unknown'}
- Total Functions: ${rustResults.numFunctions || 'Unknown'}
- Complex Functions: ${rustResults.complexFunctions || 'Unknown'}
- Arithmetic Operations: ${rustResults.arithmeticOperations || 'Unknown'}
- CPI Calls: ${rustResults.cpiCalls || 'Unknown'}
- External Integrations: ${rustResults.externalIntegrations || 'Unknown'}
- Oracle Usage: ${rustResults.oracleUsage || 'Unknown'}
- Asset Types: ${rustResults.assetTypes || 'Unknown'}
- Privileged Roles: ${rustResults.privilegedRoles || 'Unknown'}
- Dependencies: ${rustResults.dependencies || 'Unknown'}
- Error Handling: ${rustResults.errorHandling || 'Unknown'}
- Unsafe Operations: ${rustResults.unsafeOperations || 'Unknown'}
`;
    }

    private parseAndValidateResponse(content: string, expectedType: string): any {
        try {
            // Clean the response (remove any markdown formatting)
            const cleanedContent = content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const parsed = JSON.parse(cleanedContent);

            // Validate required fields
            this.validateResponseSchema(parsed, expectedType);

            return parsed;
        } catch (error) {
            this.logger.error(`Failed to parse AI response for ${expectedType}: ${error.message}`);
            this.logger.error(`Raw response: ${content}`);

            // Return default response
            return this.getDefaultResponse(expectedType);
        }
    }

    private validateResponseSchema(response: any, type: string): void {
        const schemas = {
            CodeMetrics: ['highRiskHotspots', 'mediumRiskHotspots', 'recommendations', 'overallRiskScore', 'findings', 'confidence'],
            DocumentationMetrics: ['codeCommentsScore', 'functionDocumentationScore', 'readmeQualityScore', 'securityDocumentationScore', 'overallClarityScore', 'findings', 'confidence'],
            TestingMetrics: ['unitTestCoverage', 'integrationTestCoverage', 'testQualityScore', 'edgeCaseTestingScore', 'securityTestScore', 'overallTestingScore', 'findings', 'confidence'],
            FinancialLogicMetrics: ['mathematicalComplexityScore', 'algorithmSophisticationScore', 'interestRateComplexityScore', 'ammPricingComplexityScore', 'rewardDistributionComplexityScore', 'riskManagementComplexityScore', 'overallFinancialComplexityScore', 'findings', 'confidence'],
            AttackVectorMetrics: ['flashLoanAttackRisk', 'sandwichAttackRisk', 'arbitrageOpportunities', 'economicExploitRisk', 'overallAttackVectorScore', 'findings', 'confidence'],
            ValueAtRiskMetrics: ['assetVolumeComplexity', 'liquidityRiskScore', 'marketCapImplications', 'economicStakesScore', 'overallValueAtRiskScore', 'findings', 'confidence'],
            GameTheoryMetrics: ['incentiveAlignmentScore', 'economicSecurityDependencies', 'maliciousActorResistance', 'protocolGovernanceComplexity', 'overallGameTheoryScore', 'findings', 'confidence'],
        };

        const requiredFields = schemas[type];
        if (!requiredFields) {
            throw new Error(`Unknown response type: ${type}`);
        }

        for (const field of requiredFields) {
            if (!(field in response)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    private getDefaultResponse(type: string): any {
        const defaults = {
            CodeMetrics: {
                highRiskHotspots: [],
                mediumRiskHotspots: [],
                recommendations: ['AI analysis failed - unable to provide recommendations'],
                overallRiskScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
            DocumentationMetrics: {
                codeCommentsScore: 50,
                functionDocumentationScore: 50,
                readmeQualityScore: 50,
                securityDocumentationScore: 50,
                overallClarityScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
            TestingMetrics: {
                unitTestCoverage: 50,
                integrationTestCoverage: 50,
                testQualityScore: 50,
                edgeCaseTestingScore: 50,
                securityTestScore: 50,
                overallTestingScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
            FinancialLogicMetrics: {
                mathematicalComplexityScore: 50,
                algorithmSophisticationScore: 50,
                interestRateComplexityScore: 50,
                ammPricingComplexityScore: 50,
                rewardDistributionComplexityScore: 50,
                riskManagementComplexityScore: 50,
                overallFinancialComplexityScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
            AttackVectorMetrics: {
                flashLoanAttackRisk: 50,
                sandwichAttackRisk: 50,
                arbitrageOpportunities: 50,
                economicExploitRisk: 50,
                overallAttackVectorScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
            ValueAtRiskMetrics: {
                assetVolumeComplexity: 50,
                liquidityRiskScore: 50,
                marketCapImplications: 50,
                economicStakesScore: 50,
                overallValueAtRiskScore: 50,
                findings: ['AI analysis failed - using default scores'],
                confidence: 0
            },
        };

        return defaults[type] || {};
    }

    private extractResult(result: PromiseSettledResult<any>, type: string): any {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            this.logger.error(`AI analysis failed for ${type}: ${result.reason}`);
            return this.getDefaultResponse(type);
        }
    }

    private async getAllRustFiles(extractedPath: string): Promise<string[]> {
        const files: string[] = [];

        const scanDirectory = async (dir: string, relativePath: string = ''): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativeFilePath = path.join(relativePath, entry.name);

                if (entry.isDirectory()) {
                    // Skip common non-source directories
                    if (!['target', 'node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                        await scanDirectory(fullPath, relativeFilePath);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.rs')) {
                    files.push(relativeFilePath);
                }
            }
        };

        await scanDirectory(extractedPath);
        return files;
    }
}
