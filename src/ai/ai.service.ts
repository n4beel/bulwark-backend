import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RepositoryMetadata } from '../github/github.service';

export interface AuditEstimate {
    duration: {
        min: number;
        max: number;
        unit: 'days';
        reasoning: string;
    };
    resources: {
        seniorAuditors: number;
        juniorAuditors: number;
        reasoning: string;
    };
    cost: {
        min: number;
        max: number;
        currency: 'USD';
        reasoning: string;
    };
    riskFactors: string[];
    specialConsiderations: string[];
}

export interface AIEstimateResponse {
    duration: {
        min: number;
        max: number;
        unit: string;
        reasoning: string;
    };
    resources: {
        seniorAuditors: number;
        juniorAuditors: number;
        reasoning: string;
    };
    cost: {
        min: number;
        max: number;
        currency: string;
        reasoning: string;
    };
    riskFactors: string[];
    specialConsiderations: string[];
}

export interface EnhancedAnalysis {
    basicAnalysis: RepositoryMetadata['analysis'];
    contractDetails: {
        name: string;
        path: string;
        estimatedPurpose: string;
        complexity: 'low' | 'medium' | 'high';
        integrationPoints: string[];
    }[];
    dependencyAnalysis: {
        name: string;
        version: string;
        securityImplications: string;
        riskLevel: 'low' | 'medium' | 'high';
    }[];
    architecturePatterns: string[];
    testCoverageAnalysis: {
        coverage: 'poor' | 'fair' | 'good' | 'excellent';
        reasoning: string;
        missingTests: string[];
    };
    integrationPoints: {
        externalProtocols: string[];
        crossContractInteractions: string[];
        oracleUsage: string[];
    };
}

@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);
    private openai: OpenAI;
    private assistantId: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        this.assistantId = this.configService.get<string>('OPENAI_ASSISTANT_ID') || '';

        if (!apiKey) {
            this.logger.warn('OpenAI API key not configured. AI estimates will not be available.');
        } else {
            this.openai = new OpenAI({
                apiKey: apiKey,
            });
        }
    }

    /**
     * Generate audit estimates using AI Assistant
     */
    async generateAuditEstimate(analysis: RepositoryMetadata['analysis']): Promise<AuditEstimate> {
        if (!this.openai) {
            throw new Error('OpenAI not configured. Please set OPENAI_API_KEY environment variable.');
        }

        if (!this.assistantId) {
            throw new Error('OpenAI Assistant not configured. Please set OPENAI_ASSISTANT_ID environment variable.');
        }

        try {
            this.logger.log('Generating AI audit estimate using assistant...');

            // Create enhanced analysis with more context
            const enhancedAnalysis = await this.createEnhancedAnalysis(analysis);

            // Use assistant for estimation
            const response = await this.useAssistant(enhancedAnalysis);
            const parsedResponse = this.parseAIResponse(response);

            this.logger.log('AI audit estimate generated successfully using assistant');
            return parsedResponse;
        } catch (error) {
            this.logger.error(`Failed to generate AI audit estimate: ${error.message}`);
            throw new Error(`AI estimation failed: ${error.message}`);
        }
    }

    /**
     * Create enhanced analysis with more context
     */
    private async createEnhancedAnalysis(analysis: RepositoryMetadata['analysis']): Promise<EnhancedAnalysis> {
        // Analyze contract purposes based on file names and paths
        const contractDetails = analysis.contractFiles.map(file => {
            const fileName = file.split('/').pop();
            const name = fileName ? fileName.replace('.sol', '').replace('.rs', '') : 'Unknown';
            const path = file;

            // Estimate purpose based on naming conventions
            let estimatedPurpose = 'Unknown';
            let complexity: 'low' | 'medium' | 'high' = 'medium';
            let integrationPoints: string[] = [];

            if (name.toLowerCase().includes('token') || name.toLowerCase().includes('erc')) {
                estimatedPurpose = 'Token contract (ERC20/ERC721)';
                complexity = 'low';
            } else if (name.toLowerCase().includes('vesting')) {
                estimatedPurpose = 'Token vesting mechanism';
                complexity = 'medium';
                integrationPoints = ['Token contract'];
            } else if (name.toLowerCase().includes('staking') || name.toLowerCase().includes('farm')) {
                estimatedPurpose = 'Staking/farming contract';
                complexity = 'high';
                integrationPoints = ['Token contract', 'Rewards contract'];
            } else if (name.toLowerCase().includes('governance') || name.toLowerCase().includes('dao')) {
                estimatedPurpose = 'Governance contract';
                complexity = 'high';
                integrationPoints = ['Token contract', 'Timelock'];
            } else if (name.toLowerCase().includes('oracle')) {
                estimatedPurpose = 'Oracle integration';
                complexity = 'medium';
                integrationPoints = ['External oracle'];
            } else if (name.toLowerCase().includes('pool') || name.toLowerCase().includes('amm')) {
                estimatedPurpose = 'Liquidity pool/AMM';
                complexity = 'high';
                integrationPoints = ['Token contracts', 'Router contract'];
            } else if (name.toLowerCase().includes('router') || name.toLowerCase().includes('swap')) {
                estimatedPurpose = 'Router/swap contract';
                complexity = 'high';
                integrationPoints = ['Pool contracts', 'Token contracts'];
            } else if (name.toLowerCase().includes('rewards') || name.toLowerCase().includes('incentive')) {
                estimatedPurpose = 'Rewards/incentive contract';
                complexity = 'medium';
                integrationPoints = ['Token contract', 'Staking contract'];
            } else if (name.toLowerCase().includes('security') || name.toLowerCase().includes('guard')) {
                estimatedPurpose = 'Security/access control';
                complexity = 'medium';
                integrationPoints = ['All contracts'];
            }

            return {
                name,
                path,
                estimatedPurpose,
                complexity,
                integrationPoints
            };
        });

        // Analyze dependencies
        const dependencyAnalysis = analysis.dependencies.map(dep => {
            let securityImplications = 'Standard dependency';
            let riskLevel: 'low' | 'medium' | 'high' = 'low';

            if (dep.includes('openzeppelin')) {
                securityImplications = 'Well-audited, industry-standard library';
                riskLevel = 'low';
            } else if (dep.includes('uniswap') || dep.includes('sushiswap')) {
                securityImplications = 'DeFi protocol integration - high complexity';
                riskLevel = 'high';
            } else if (dep.includes('chainlink')) {
                securityImplications = 'Oracle integration - external dependency';
                riskLevel = 'medium';
            } else if (dep.includes('aave') || dep.includes('compound')) {
                securityImplications = 'Lending protocol integration - complex interactions';
                riskLevel = 'high';
            } else if (dep.includes('hardhat') || dep.includes('truffle') || dep.includes('foundry')) {
                securityImplications = 'Development framework - low risk';
                riskLevel = 'low';
            }

            return {
                name: dep,
                version: 'latest', // We could extract actual versions if needed
                securityImplications,
                riskLevel
            };
        });

        // Identify architecture patterns
        const architecturePatterns: string[] = [];
        if (contractDetails.some(c => c.estimatedPurpose.includes('Governance'))) {
            architecturePatterns.push('Governance Pattern');
        }
        if (contractDetails.some(c => c.estimatedPurpose.includes('Staking'))) {
            architecturePatterns.push('Staking Pattern');
        }
        if (contractDetails.some(c => c.estimatedPurpose.includes('Pool'))) {
            architecturePatterns.push('AMM Pattern');
        }
        if (contractDetails.some(c => c.estimatedPurpose.includes('Oracle'))) {
            architecturePatterns.push('Oracle Pattern');
        }
        if (contractDetails.some(c => c.estimatedPurpose.includes('Vesting'))) {
            architecturePatterns.push('Vesting Pattern');
        }

        // Analyze test coverage
        const testCoverageAnalysis = {
            coverage: (analysis.testFiles > analysis.solidityFiles * 2 ? 'excellent' :
                analysis.testFiles > analysis.solidityFiles ? 'good' :
                    analysis.testFiles > analysis.solidityFiles * 0.5 ? 'fair' : 'poor') as 'poor' | 'fair' | 'good' | 'excellent',
            reasoning: `Found ${analysis.testFiles} test files for ${analysis.solidityFiles} contract files`,
            missingTests: contractDetails
                .filter(c => !analysis.contractFiles.some(f => f.includes(c.name.toLowerCase())))
                .map(c => `${c.name} contract`)
        };

        // Identify integration points
        const integrationPoints = {
            externalProtocols: dependencyAnalysis
                .filter(d => d.riskLevel === 'high')
                .map(d => d.name),
            crossContractInteractions: contractDetails
                .filter(c => c.integrationPoints.length > 0)
                .map(c => `${c.name} -> ${c.integrationPoints.join(', ')}`),
            oracleUsage: contractDetails
                .filter(c => c.estimatedPurpose.includes('Oracle'))
                .map(c => c.name)
        };

        return {
            basicAnalysis: analysis,
            contractDetails,
            dependencyAnalysis,
            architecturePatterns,
            testCoverageAnalysis,
            integrationPoints
        };
    }

    /**
     * Use OpenAI Assistant for estimation
     */
    private async useAssistant(enhancedAnalysis: EnhancedAnalysis): Promise<string> {
        try {
            // Create a thread
            const thread = await this.openai.beta.threads.create();

            // Create the enhanced prompt
            const prompt = this.buildEnhancedPrompt(enhancedAnalysis);

            // Add message to thread
            await this.openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: prompt
            });

            // Run the assistant
            const run = await this.openai.beta.threads.runs.create(thread.id, {
                assistant_id: this.assistantId
            });

            // Wait for completion
            let runStatus = await this.openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });

            let attempts = 0;
            while ((runStatus.status === 'in_progress' || runStatus.status === 'queued') && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                runStatus = await this.openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
                attempts++;
            }

            if (runStatus.status === 'failed') {
                throw new Error('Assistant run failed');
            }

            if (runStatus.status !== 'completed') {
                throw new Error(`Assistant run did not complete. Status: ${runStatus.status}`);
            }

            // Get the response
            const messages = await this.openai.beta.threads.messages.list(thread.id);
            const lastMessage = messages.data[0]; // Most recent message

            if (lastMessage && lastMessage.content[0].type === 'text') {
                return lastMessage.content[0].text.value;
            } else {
                throw new Error('No text response received from assistant');
            }

        } catch (error) {
            this.logger.error(`Assistant error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build enhanced prompt with detailed context
     */
    private buildEnhancedPrompt(enhancedAnalysis: EnhancedAnalysis): string {
        const { basicAnalysis, contractDetails, dependencyAnalysis, architecturePatterns, testCoverageAnalysis, integrationPoints } = enhancedAnalysis;

        return `Analyze the following comprehensive repository data and provide expert audit estimates:

REPOSITORY OVERVIEW:
- Total Lines of Code: ${basicAnalysis.totalLines.toLocaleString()}
- Contract Files: ${basicAnalysis.solidityFiles}
- Framework: ${basicAnalysis.framework}
- Complexity Level: ${basicAnalysis.complexity.toUpperCase()}

CONTRACT DETAILS:
${contractDetails.map(c => `- ${c.name} (${c.path}): ${c.estimatedPurpose} [Complexity: ${c.complexity.toUpperCase()}]`).join('\n')}

DEPENDENCIES ANALYSIS:
${dependencyAnalysis.map(d => `- ${d.name}: ${d.securityImplications} [Risk: ${d.riskLevel.toUpperCase()}]`).join('\n')}

ARCHITECTURE PATTERNS:
${architecturePatterns.length > 0 ? architecturePatterns.join(', ') : 'No specific patterns identified'}

TEST COVERAGE:
- Coverage Level: ${testCoverageAnalysis.coverage.toUpperCase()}
- Reasoning: ${testCoverageAnalysis.reasoning}
- Missing Tests: ${testCoverageAnalysis.missingTests.length > 0 ? testCoverageAnalysis.missingTests.join(', ') : 'None identified'}

INTEGRATION POINTS:
- External Protocols: ${integrationPoints.externalProtocols.length > 0 ? integrationPoints.externalProtocols.join(', ') : 'None'}
- Cross-Contract Interactions: ${integrationPoints.crossContractInteractions.length > 0 ? integrationPoints.crossContractInteractions.join('; ') : 'None'}
- Oracle Usage: ${integrationPoints.oracleUsage.length > 0 ? integrationPoints.oracleUsage.join(', ') : 'None'}

Please provide comprehensive audit estimates in the following JSON format ONLY (no additional text):

{
  "duration": {
    "min": <minimum_days>,
    "max": <maximum_days>,
    "unit": "days",
    "reasoning": "<detailed explanation considering contract complexity, dependencies, and integration points>"
  },
  "resources": {
    "seniorAuditors": <number_of_senior_auditors>,
    "juniorAuditors": <number_of_junior_auditors>,
    "reasoning": "<detailed explanation of team composition based on project complexity>"
  },
  "cost": {
    "min": <minimum_cost_in_usd>,
    "max": <maximum_cost_in_usd>,
    "currency": "USD",
    "reasoning": "<detailed cost breakdown considering market rates, complexity, and scope>"
  },
  "riskFactors": [
    "<specific risk factor 1 based on analysis>",
    "<specific risk factor 2 based on analysis>",
    "<specific risk factor 3 based on analysis>",
    "<specific risk factor 4 based on analysis>"
  ],
  "specialConsiderations": [
    "<special consideration 1 based on architecture>",
    "<special consideration 2 based on dependencies>",
    "<special consideration 3 based on integration points>",
    "<special consideration 4 based on test coverage>"
  ]
}

Consider the specific contract purposes, dependency risks, architecture patterns, and integration complexity in your analysis. Provide realistic, market-appropriate estimates based on 2024 industry standards.`;
    }

    /**
     * Parse AI response into structured format
     */
    private parseAIResponse(response: string): AuditEstimate {
        try {
            // Clean the response to extract JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in AI response');
            }

            const parsed: AIEstimateResponse = JSON.parse(jsonMatch[0]);

            // Validate and transform the response
            return {
                duration: {
                    min: Math.max(1, Math.round(parsed.duration.min)),
                    max: Math.max(parsed.duration.min, Math.round(parsed.duration.max)),
                    unit: 'days' as const,
                    reasoning: parsed.duration.reasoning || 'AI-generated estimate based on enhanced repository analysis'
                },
                resources: {
                    seniorAuditors: Math.max(0, Math.round(parsed.resources.seniorAuditors)),
                    juniorAuditors: Math.max(0, Math.round(parsed.resources.juniorAuditors)),
                    reasoning: parsed.resources.reasoning || 'AI-generated resource allocation based on project complexity'
                },
                cost: {
                    min: Math.max(1000, Math.round(parsed.cost.min)),
                    max: Math.max(parsed.cost.min, Math.round(parsed.cost.max)),
                    currency: 'USD' as const,
                    reasoning: parsed.cost.reasoning || 'AI-generated cost estimate based on market rates and complexity'
                },
                riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
                specialConsiderations: Array.isArray(parsed.specialConsiderations) ? parsed.specialConsiderations : []
            };
        } catch (error) {
            this.logger.error(`Failed to parse AI response: ${error.message}`);
            this.logger.error(`Raw response: ${response}`);
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
    }

    /**
     * Check if AI service is available
     */
    isAvailable(): boolean {
        return !!this.openai && !!this.assistantId;
    }
}
