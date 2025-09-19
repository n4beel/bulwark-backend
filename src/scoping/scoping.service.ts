import { Injectable, Logger } from '@nestjs/common';
import { GitHubService, RepositoryMetadata } from '../github/github.service';
import { AIService, AuditEstimate } from '../ai/ai.service';

export interface PreAuditReport {
  projectName: string;
  repositoryInfo: {
    name: string;
    fullName: string;
    description: string;
    language: string;
    size: number;
    private: boolean;
  };
  analysis: {
    totalLines: number;
    solidityFiles: number;
    contractFiles: string[];
    dependencies: string[];
    framework: string;
    testFiles: number;
    complexity: 'low' | 'medium' | 'high';
  };
  auditEstimate: AuditEstimate;
  generatedAt: Date;
}

@Injectable()
export class ScopingService {
  private readonly logger = new Logger(ScopingService.name);

  constructor(
    private readonly githubService: GitHubService,
    private readonly aiService: AIService,
  ) {}

  /**
   * Generate a pre-audit report for a repository
   */
  async generatePreAuditReport(
    owner: string,
    repo: string,
    accessToken: string,
    selectedFiles?: string[],
  ): Promise<PreAuditReport> {
    this.logger.log(`Generating pre-audit report for ${owner}/${repo}`);

    try {
      // Step 1: Get repository information from GitHub API
      const repoInfo = await this.githubService.getRepositoryInfo(
        owner,
        repo,
        accessToken,
      );

      // Step 2: Clone and analyze the repository
      const repoUrl = repoInfo.clone_url;
      const repoName = `${owner}-${repo}`;
      const repoPath = await this.githubService.cloneRepository(
        repoUrl,
        repoName,
        accessToken,
      );

      // Step 3: Analyze the repository (with selected files if provided)
      const analysis = await this.githubService.analyzeRepository(
        repoPath,
        selectedFiles,
      );

      // Step 4: Generate audit estimates using AI
      let auditEstimate: AuditEstimate;
      try {
        auditEstimate = await this.aiService.generateAuditEstimate(analysis);
      } catch (error) {
        this.logger.warn(
          `AI estimation failed, falling back to internal calculation: ${error.message}`,
        );
        auditEstimate = this.calculateAuditEstimate(analysis);
      }

      // Step 5: Clean up temporary repository
      await this.githubService.cleanupRepository(repoPath);

      const report: PreAuditReport = {
        projectName: repoInfo.name,
        repositoryInfo: {
          name: repoInfo.name,
          fullName: repoInfo.full_name,
          description: repoInfo.description || '',
          language: repoInfo.language || 'Unknown',
          size: repoInfo.size,
          private: repoInfo.private,
        },
        analysis,
        auditEstimate,
        generatedAt: new Date(),
      };

      this.logger.log(
        `Pre-audit report generated successfully for ${owner}/${repo}`,
      );
      return report;
    } catch (error) {
      this.logger.error(
        `Failed to generate pre-audit report: ${error.message}`,
      );
      throw new Error(`Failed to generate pre-audit report: ${error.message}`);
    }
  }

  /**
   * Calculate audit estimates based on repository analysis (fallback method)
   */
  private calculateAuditEstimate(
    analysis: RepositoryMetadata['analysis'],
  ): AuditEstimate {
    const { totalLines, solidityFiles, complexity, dependencies } = analysis;

    let baseDuration = 0;
    let baseCost = 0;
    let seniorAuditors = 1;
    let juniorAuditors = 0;

    // Base calculation based on complexity
    switch (complexity) {
      case 'low':
        baseDuration = 5;
        baseCost = 8000;
        break;
      case 'medium':
        baseDuration = 15;
        baseCost = 25000;
        juniorAuditors = 1;
        break;
      case 'high':
        baseDuration = 30;
        baseCost = 50000;
        seniorAuditors = 2;
        juniorAuditors = 1;
        break;
    }

    // Adjust based on number of contracts
    if (solidityFiles > 20) {
      baseDuration += 10;
      baseCost += 15000;
      if (complexity === 'high') {
        seniorAuditors += 1;
      }
    } else if (solidityFiles > 10) {
      baseDuration += 5;
      baseCost += 8000;
    }

    // Adjust based on dependencies (more dependencies = more integration points to audit)
    const dependencyMultiplier = Math.min(1 + dependencies.length * 0.1, 1.5);
    baseDuration = Math.round(baseDuration * dependencyMultiplier);
    baseCost = Math.round(baseCost * dependencyMultiplier);

    // Add variance for estimates
    const durationVariance = Math.round(baseDuration * 0.2);
    const costVariance = Math.round(baseCost * 0.25);

    return {
      duration: {
        min: Math.max(3, baseDuration - durationVariance),
        max: baseDuration + durationVariance,
        unit: 'days' as const,
        reasoning:
          'Internal calculation based on repository complexity and size',
      },
      resources: {
        seniorAuditors,
        juniorAuditors,
        reasoning: 'Resource allocation based on project complexity and scope',
      },
      cost: {
        min: Math.max(5000, baseCost - costVariance),
        max: baseCost + costVariance,
        currency: 'USD' as const,
        reasoning:
          'Cost estimate based on industry standards and project scope',
      },
      riskFactors: [
        'Complexity of smart contract interactions',
        'Number of external dependencies',
        'Test coverage adequacy',
      ],
      specialConsiderations: [
        'Framework-specific security considerations',
        'Integration points with external protocols',
        'Gas optimization requirements',
      ],
    };
  }
}
