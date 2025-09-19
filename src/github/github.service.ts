import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RepositoryMetadata {
  name: string;
  fullName: string;
  description: string;
  language: string;
  size: number;
  defaultBranch: string;
  private: boolean;
  analysis: {
    totalLines: number;
    solidityFiles: number;
    contractFiles: string[];
    dependencies: string[];
    framework: string;
    testFiles: number;
    complexity: 'low' | 'medium' | 'high';
  };
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'repos');

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get repository metadata from GitHub API
   */
  async getRepositoryInfo(
    owner: string,
    repo: string,
    accessToken: string,
  ): Promise<any> {
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get repository info: ${error.message}`);
      throw new Error(`Failed to get repository info: ${error.message}`);
    }
  }

  /**
   * Clone repository to temporary directory
   */
  async cloneRepository(
    repoUrl: string,
    repoName: string,
    accessToken?: string,
  ): Promise<string> {
    const repoPath = path.join(this.tempDir, repoName);

    try {
      // Remove existing directory if it exists
      if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
      }

      // Configure git to not prompt for credentials
      await execAsync('git config --global credential.helper store');

      // Clone the repository with authentication if token is provided
      let cloneCommand: string;
      if (accessToken) {
        // Insert token into URL for authentication
        const urlWithToken = repoUrl.replace(
          'https://',
          `https://${accessToken}@`,
        );
        cloneCommand = `git clone "${urlWithToken}" "${repoPath}"`;
      } else {
        // Use original URL (for public repos)
        cloneCommand = `git clone "${repoUrl}" "${repoPath}"`;
      }

      await execAsync(cloneCommand);
      this.logger.log(`Repository cloned to: ${repoPath}`);

      return repoPath;
    } catch (error) {
      this.logger.error(`Failed to clone repository: ${error.message}`);
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Analyze repository and extract metadata
   */
  async analyzeRepository(
    repoPath: string,
    selectedFiles?: string[],
  ): Promise<RepositoryMetadata['analysis']> {
    try {
      const analysis = {
        totalLines: 0,
        solidityFiles: 0,
        contractFiles: [] as string[],
        dependencies: [] as string[],
        framework: '',
        testFiles: 0,
        complexity: 'low' as 'low' | 'medium' | 'high',
      };

      // Find contract files
      let contractFiles: string[];
      if (selectedFiles && selectedFiles.length > 0) {
        // Use only selected files
        contractFiles = selectedFiles.map((filePath) =>
          path.join(repoPath, filePath),
        );
        analysis.contractFiles = selectedFiles;
      } else {
        // Use all contract files
        contractFiles = await this.findContractFiles(repoPath);
        analysis.contractFiles = contractFiles.map((file) =>
          path.relative(repoPath, file),
        );
      }

      analysis.solidityFiles = contractFiles.length;

      // Count total lines of code (only for selected files if provided)
      if (selectedFiles && selectedFiles.length > 0) {
        analysis.totalLines =
          await this.countLinesOfCodeForFiles(contractFiles);
      } else {
        analysis.totalLines = await this.countLinesOfCode(repoPath);
      }

      // Detect framework
      analysis.framework = await this.detectFramework(repoPath);

      // Extract dependencies
      analysis.dependencies = await this.extractDependencies(repoPath);

      // Count test files
      analysis.testFiles = await this.countTestFiles(repoPath);

      // Determine complexity
      analysis.complexity = this.determineComplexity(analysis);

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze repository: ${error.message}`);
      throw new Error(`Failed to analyze repository: ${error.message}`);
    }
  }

  /**
   * Count total lines of code for specific files
   */
  private async countLinesOfCodeForFiles(files: string[]): Promise<number> {
    if (files.length === 0) {
      return 0;
    }

    let totalLines = 0;
    for (const file of files) {
      try {
        const { stdout } = await execAsync(`wc -l < "${file}"`);
        const lines = parseInt(stdout.trim()) || 0;
        totalLines += lines;
      } catch (error) {
        this.logger.warn(
          `Could not count lines for file ${file}: ${error.message}`,
        );
      }
    }

    return totalLines;
  }

  /**
   * Count total lines of code in the repository
   */
  private async countLinesOfCode(repoPath: string): Promise<number> {
    try {
      // First, find all contract files (Solidity and Rust)
      const { stdout: filesOutput } = await execAsync(
        `find "${repoPath}" -name "*.sol" -o -name "*.rs" -type f`,
      );
      const files = filesOutput
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      if (files.length === 0) {
        return 0;
      }

      // Count lines for each file and sum them up
      let totalLines = 0;
      for (const file of files) {
        try {
          const { stdout } = await execAsync(`wc -l < "${file}"`);
          const lines = parseInt(stdout.trim()) || 0;
          totalLines += lines;
        } catch (error) {
          this.logger.warn(
            `Could not count lines for file ${file}: ${error.message}`,
          );
        }
      }

      return totalLines;
    } catch (error) {
      this.logger.warn(`Could not count lines of code: ${error.message}`);
      return 0;
    }
  }

  /**
   * Find all contract files in the repository (Solidity + Rust)
   */
  private async findContractFiles(repoPath: string): Promise<string[]> {
    try {
      // Find all Solidity and Rust files recursively
      const { stdout } = await execAsync(
        `find "${repoPath}" -name "*.sol" -o -name "*.rs" -type f`,
      );
      const files = stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      // Filter out test files and common non-contract directories
      const filteredFiles = files.filter((file) => {
        const relativePath = path.relative(repoPath, file);
        const lowerPath = relativePath.toLowerCase();

        // Exclude test files and common non-contract directories
        const excludePatterns = [
          '/test/',
          '/tests/',
          '/testing/',
          '/example/',
          '/examples/',
          '/docs/',
          '/documentation/',
          '/scripts/',
          '/tools/',
          '/migrations/',
          '/deploy/',
          'test.sol',
          'test.rs',
          'mock',
          'mockup',
          'fake',
        ];

        return !excludePatterns.some((pattern) => lowerPath.includes(pattern));
      });

      this.logger.log(
        `Found ${filteredFiles.length} contract files in ${repoPath}`,
      );
      return filteredFiles;
    } catch (error) {
      this.logger.warn(`Could not find contract files: ${error.message}`);
      return [];
    }
  }

  /**
   * Detect the framework being used
   */
  private async detectFramework(repoPath: string): Promise<string> {
    const configFiles = [
      // Ethereum frameworks
      { file: 'hardhat.config.js', framework: 'hardhat' },
      { file: 'hardhat.config.ts', framework: 'hardhat' },
      { file: 'truffle-config.js', framework: 'truffle' },
      { file: 'foundry.toml', framework: 'foundry' },
      { file: 'brownie-config.yaml', framework: 'brownie' },
      { file: 'embark.json', framework: 'embark' },
      // Solana frameworks
      { file: 'Anchor.toml', framework: 'anchor' },
      { file: 'Cargo.toml', framework: 'solana' },
      // Near frameworks
      { file: 'Cargo.toml', framework: 'near' },
    ];

    for (const config of configFiles) {
      if (fs.existsSync(path.join(repoPath, config.file))) {
        // Additional logic for Solana vs Near
        if (config.file === 'Cargo.toml') {
          // Check if it's a Solana or Near project
          const cargoContent = fs.readFileSync(
            path.join(repoPath, config.file),
            'utf8',
          );
          if (cargoContent.includes('solana-program')) {
            return 'solana';
          } else if (cargoContent.includes('near-sdk')) {
            return 'near';
          }
        }
        return config.framework;
      }
    }

    return 'unknown';
  }

  /**
   * Extract dependencies from package.json or other config files
   */
  private async extractDependencies(repoPath: string): Promise<string[]> {
    const dependencies: string[] = [];

    // Check package.json
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        );
        if (packageJson.dependencies) {
          dependencies.push(...Object.keys(packageJson.dependencies));
        }
        if (packageJson.devDependencies) {
          dependencies.push(...Object.keys(packageJson.devDependencies));
        }
      } catch (error) {
        this.logger.warn(`Could not parse package.json: ${error.message}`);
      }
    }

    return dependencies;
  }

  /**
   * Count test files
   */
  private async countTestFiles(repoPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `find "${repoPath}" -name "*test*" -o -name "*spec*" -type f`,
      );
      const files = stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
      return files.length;
    } catch (error) {
      this.logger.warn(`Could not count test files: ${error.message}`);
      return 0;
    }
  }

  /**
   * Determine complexity based on analysis
   */
  private determineComplexity(analysis: any): 'low' | 'medium' | 'high' {
    const { totalLines, solidityFiles, dependencies } = analysis;

    let score = 0;

    // Lines of code factor
    if (totalLines > 10000) score += 3;
    else if (totalLines > 5000) score += 2;
    else if (totalLines > 1000) score += 1;

    // Number of contracts factor
    if (solidityFiles > 20) score += 3;
    else if (solidityFiles > 10) score += 2;
    else if (solidityFiles > 5) score += 1;

    // Dependencies factor
    if (dependencies.length > 10) score += 2;
    else if (dependencies.length > 5) score += 1;

    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * Clean up temporary repository
   */
  async cleanupRepository(repoPath: string): Promise<void> {
    try {
      if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
        this.logger.log(`Cleaned up repository: ${repoPath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup repository: ${error.message}`);
    }
  }
}
