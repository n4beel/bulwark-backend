import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import axios from 'axios';

export interface RustAnalysisResult {
    path: string;
    lines_of_code: number;
    function_count: number;
    functions: RustFunctionMetrics[];
    aggregated: RustAggregatedMetrics;
    semantic_tags: string[];
}

export interface RustFunctionMetrics {
    name: string;
    signature: string;
    line_range: [number, number];
    arithmetic: ArithmeticMetrics;
    math_functions: MathFunctionMetrics;
    control_flow: ControlFlowMetrics;
    safety: SafetyMetrics;
    semantic_tags: string[];
    risk_indicators: string[];
    complexity_score: number;
}

export interface ArithmeticMetrics {
    checked_add: number;
    checked_sub: number;
    checked_mul: number;
    checked_div: number;
    checked_rem: number;
    checked_pow: number;
    saturating_add: number;
    saturating_sub: number;
    saturating_mul: number;
    wrapping_add: number;
    wrapping_sub: number;
    wrapping_mul: number;
    wrapping_div: number;
    raw_add: number;
    raw_sub: number;
    raw_mul: number;
    raw_div: number;
    raw_rem: number;
    ceil_div: number;
    integer_sqrt: number;
    bitwise_ops: number;
}

export interface MathFunctionMetrics {
    sqrt: number;
    pow: number;
    exp: number;
    log: number;
    trig_functions: number;
    floor: number;
    ceil: number;
    round: number;
    abs: number;
    min_max: number;
}

export interface ControlFlowMetrics {
    cyclomatic_complexity: number;
    decision_points: number;
    max_loop_depth: number;
    loop_count: number;
    max_conditional_depth: number;
    conditional_count: number;
}

export interface SafetyMetrics {
    unsafe_blocks: number;
    raw_pointers: number;
    unwrap_calls: number;
    expect_calls: number;
    panic_calls: number;
    todo_calls: number;
}

export interface RustAggregatedMetrics {
    total_arithmetic_ops: number;
    total_math_functions: number;
    avg_cyclomatic_complexity: number;
    max_cyclomatic_complexity: number;
    total_unsafe_ops: number;
    safety_ratio: number;
    complexity_score: number;
}

@Injectable()
export class RustAnalyzerService {
    private readonly logger = new Logger(RustAnalyzerService.name);
    private readonly rustServiceUrl: string;

    constructor() {
        // URL to the Rust analyzer HTTP service
        this.rustServiceUrl = process.env.RUST_ANALYZER_URL || 'http://localhost:8080';
    }

    /**
     * Check if the Rust analyzer HTTP service is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.rustServiceUrl}/health`, {
                timeout: 5000,
            });

            return response.status === 200 && response.data?.status === 'healthy';
        } catch (error) {
            this.logger.error('Rust analyzer service availability check failed:', error);
            return false;
        }
    }

    /**
     * Analyze a single Rust file using the HTTP service
     * Note: This creates a temporary workspace for single file analysis
     */
    async analyzeFile(filePath: string): Promise<RustAnalysisResult> {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        if (!filePath.endsWith('.rs')) {
            throw new Error(`Not a Rust file: ${filePath}`);
        }

        try {
            this.logger.debug(`Analyzing Rust file via HTTP: ${filePath}`);

            // For single file analysis, we'll create a temporary workspace
            // and copy the file there, then analyze it
            const path = require('path');
            const fs = require('fs/promises');
            const crypto = require('crypto');

            const workspaceId = `temp-${crypto.randomBytes(8).toString('hex')}`;
            const workspacePath = `/tmp/shared/workspaces/${workspaceId}`;
            const fileName = path.basename(filePath);

            // Create workspace directory
            await fs.mkdir(workspacePath, { recursive: true });

            // Copy file to workspace
            await fs.copyFile(filePath, path.join(workspacePath, fileName));

            try {
                // Analyze using workspace method
                const result = await this.analyzeWorkspace(workspaceId, [fileName]);

                // Extract single file result from repository analysis
                if (result?.repository?.files && result.repository.files.length > 0) {
                    const fileResult = result.repository.files[0];
                    this.logger.debug(`Analysis complete for ${filePath}: ${fileResult.function_count} functions, ${fileResult.aggregated.total_arithmetic_ops} operations`);
                    return fileResult;
                } else {
                    throw new Error('No analysis results returned from Rust service');
                }
            } finally {
                // Clean up temporary workspace
                try {
                    await fs.rm(workspacePath, { recursive: true, force: true });
                } catch (cleanupError) {
                    this.logger.warn(`Failed to clean up workspace ${workspaceId}:`, cleanupError);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to analyze file ${filePath}:`, error);
            throw new Error(`Rust analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze a workspace using the HTTP service
     */
    async analyzeWorkspace(
        workspaceId: string,
        selectedFiles?: string[],
        options?: {
            includeTests?: boolean;
            includeBenches?: boolean;
            includeExamples?: boolean;
            expandMacros?: boolean;
            maxFileSize?: number;
        }
    ): Promise<any> {
        try {
            this.logger.debug(`Analyzing workspace via HTTP: ${workspaceId}`);

            const response = await axios.post(`${this.rustServiceUrl}/analyze`, {
                workspace_id: workspaceId,
                selected_files: selectedFiles,
                options: {
                    include_tests: options?.includeTests || false,
                    include_benches: options?.includeBenches || false,
                    include_examples: options?.includeExamples || false,
                    expand_macros: options?.expandMacros || false,
                    max_file_size: options?.maxFileSize || 1024 * 1024,
                }
            }, {
                timeout: 120000, // 2 minute timeout
                maxContentLength: 50 * 1024 * 1024, // 50MB response limit
            });

            if (response.data?.success) {
                this.logger.debug(`Workspace analysis complete: ${workspaceId}`);
                return response.data.data;
            } else {
                throw new Error(response.data?.error || 'Analysis failed');
            }
        } catch (error) {
            this.logger.error(`Failed to analyze workspace ${workspaceId}:`, error);
            throw new Error(`Rust workspace analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze a directory of Rust files using the HTTP service
     * Note: This creates a temporary workspace and copies the directory contents
     */
    async analyzeDirectory(
        directoryPath: string,
        options: {
            includeTests?: boolean;
            includeBenches?: boolean;
            includeExamples?: boolean;
            maxFileSize?: number;
        } = {}
    ): Promise<RustAnalysisResult[]> {
        if (!existsSync(directoryPath)) {
            throw new Error(`Directory not found: ${directoryPath}`);
        }

        try {
            this.logger.debug(`Analyzing Rust directory via HTTP: ${directoryPath}`);

            const path = require('path');
            const fs = require('fs/promises');
            const crypto = require('crypto');

            const workspaceId = `dir-${crypto.randomBytes(8).toString('hex')}`;
            const workspacePath = `/tmp/shared/workspaces/${workspaceId}`;

            // Create workspace directory
            await fs.mkdir(workspacePath, { recursive: true });

            try {
                // Copy directory contents to workspace
                await this.copyDirectoryRecursive(directoryPath, workspacePath);

                // Analyze using workspace method
                const result = await this.analyzeWorkspace(workspaceId, undefined, {
                    includeTests: options.includeTests,
                    includeBenches: options.includeBenches,
                    includeExamples: options.includeExamples,
                    maxFileSize: options.maxFileSize,
                });

                // Extract file metrics from repository result
                const fileMetrics = result?.repository?.files || [];

                this.logger.debug(`Directory analysis complete: ${fileMetrics.length} files analyzed`);

                return fileMetrics;
            } finally {
                // Clean up temporary workspace
                try {
                    await fs.rm(workspacePath, { recursive: true, force: true });
                } catch (cleanupError) {
                    this.logger.warn(`Failed to clean up workspace ${workspaceId}:`, cleanupError);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to analyze directory ${directoryPath}:`, error);
            throw new Error(`Rust directory analysis failed: ${error.message}`);
        }
    }

    /**
     * List available workspaces on the Rust analyzer service
     */
    async listWorkspaces(): Promise<string[]> {
        try {
            const response = await axios.get(`${this.rustServiceUrl}/workspaces`, {
                timeout: 10000,
            });

            if (response.data?.success) {
                return response.data.workspaces || [];
            } else {
                throw new Error(response.data?.error || 'Failed to list workspaces');
            }
        } catch (error) {
            this.logger.error('Failed to list workspaces:', error);
            throw new Error(`Failed to list workspaces: ${error.message}`);
        }
    }

    /**
     * Helper method to copy directory contents recursively
     */
    private async copyDirectoryRecursive(src: string, dest: string): Promise<void> {
        const fs = require('fs/promises');
        const path = require('path');

        const stat = await fs.stat(src);

        if (stat.isDirectory()) {
            await fs.mkdir(dest, { recursive: true });
            const entries = await fs.readdir(src);

            for (const entry of entries) {
                const srcPath = path.join(src, entry);
                const destPath = path.join(dest, entry);
                await this.copyDirectoryRecursive(srcPath, destPath);
            }
        } else if (stat.isFile() && src.endsWith('.rs')) {
            // Only copy Rust files
            await fs.copyFile(src, dest);
        }
    }

    /**
     * Convert Rust analysis result to our existing StaticAnalysisReport format
     */
    convertToStaticAnalysisReport(
        rustResult: RustAnalysisResult,
        repositoryInfo: { owner: string; repo: string; branch?: string } | null = null
    ): any {
        // Calculate complexity scores using the new precise metrics
        const complexityScore = this.calculateComplexityScore(rustResult);

        return {
            repository: repositoryInfo?.repo || 'unknown',
            owner: repositoryInfo?.owner || 'unknown',
            branch: repositoryInfo?.branch || 'main',
            analysis_date: new Date().toISOString(),

            // File-level metrics
            total_lines_of_code: rustResult.lines_of_code,
            total_functions: rustResult.function_count,

            // Arithmetic operations (now precise!)
            complex_math_operations: rustResult.aggregated.total_arithmetic_ops + rustResult.aggregated.total_math_functions,
            checked_arithmetic_operations: this.sumArithmeticOperations(rustResult, 'checked'),
            raw_arithmetic_operations: this.sumArithmeticOperations(rustResult, 'raw'),

            // Math functions
            mathematical_functions: rustResult.aggregated.total_math_functions,

            // Control flow
            cyclomatic_complexity: rustResult.aggregated.avg_cyclomatic_complexity,
            max_cyclomatic_complexity: rustResult.aggregated.max_cyclomatic_complexity,

            // Safety metrics
            safety_ratio: rustResult.aggregated.safety_ratio,
            unsafe_operations: rustResult.aggregated.total_unsafe_ops,

            // Semantic analysis
            semantic_patterns: rustResult.semantic_tags,
            detected_patterns: this.extractSemanticPatterns(rustResult),

            // Complexity scoring (4-layer system)
            structural_complexity: complexityScore.structural,
            security_complexity: complexityScore.security,
            systemic_complexity: complexityScore.systemic,
            economic_complexity: complexityScore.economic,

            overall_complexity_score: complexityScore.overall,

            // Function-level details
            function_details: rustResult.functions.map(func => ({
                name: func.name,
                complexity_score: func.complexity_score,
                cyclomatic_complexity: func.control_flow.cyclomatic_complexity,
                arithmetic_operations: this.countFunctionArithmetic(func),
                math_functions: this.countFunctionMathFunctions(func),
                semantic_tags: func.semantic_tags,
                safety_score: this.calculateFunctionSafetyScore(func),
            })),

            // Risk assessment
            risk_level: this.assessRiskLevel(rustResult),
            risk_factors: this.identifyRiskFactors(rustResult),

            // Analysis metadata
            analysis_engine: 'rust-semantic-analyzer',
            analyzer_version: '0.1.0',
        };
    }

    private calculateComplexityScore(rustResult: RustAnalysisResult) {
        const { aggregated } = rustResult;

        // Structural Complexity (0-25): Based on code structure and control flow
        const structural = Math.min(25,
            aggregated.avg_cyclomatic_complexity * 2 +
            (rustResult.function_count / 10) * 2
        );

        // Security Complexity (0-25): Based on safety and risk factors
        const security = Math.min(25,
            (1 - aggregated.safety_ratio) * 20 +
            (aggregated.total_unsafe_ops / 10) * 5
        );

        // Systemic Complexity (0-25): Based on mathematical operations
        const systemic = Math.min(25,
            (aggregated.total_arithmetic_ops / 50) * 15 +
            (aggregated.total_math_functions / 20) * 10
        );

        // Economic Complexity (0-25): Based on DeFi-specific patterns
        const defiPatterns = rustResult.functions.filter(f =>
            f.semantic_tags.some(tag =>
                ['token_swap', 'liquidity_management', 'price_calculation', 'fee_calculation'].includes(tag)
            )
        ).length;
        const economic = Math.min(25, (defiPatterns / rustResult.function_count) * 25);

        const overall = structural + security + systemic + economic;

        return {
            structural: Math.round(structural),
            security: Math.round(security),
            systemic: Math.round(systemic),
            economic: Math.round(economic),
            overall: Math.round(overall),
        };
    }

    private sumArithmeticOperations(rustResult: RustAnalysisResult, type: 'checked' | 'raw'): number {
        return rustResult.functions.reduce((sum, func) => {
            if (type === 'checked') {
                return sum + func.arithmetic.checked_add + func.arithmetic.checked_sub +
                    func.arithmetic.checked_mul + func.arithmetic.checked_div +
                    func.arithmetic.saturating_add + func.arithmetic.saturating_sub +
                    func.arithmetic.saturating_mul;
            } else {
                return sum + func.arithmetic.raw_add + func.arithmetic.raw_sub +
                    func.arithmetic.raw_mul + func.arithmetic.raw_div;
            }
        }, 0);
    }

    private extractSemanticPatterns(rustResult: RustAnalysisResult): string[] {
        const patterns = new Set<string>();

        rustResult.functions.forEach(func => {
            func.semantic_tags.forEach(tag => patterns.add(tag));
        });

        return Array.from(patterns);
    }

    private countFunctionArithmetic(func: RustFunctionMetrics): number {
        const { arithmetic } = func;
        return arithmetic.checked_add + arithmetic.checked_sub + arithmetic.checked_mul +
            arithmetic.checked_div + arithmetic.raw_add + arithmetic.raw_sub +
            arithmetic.raw_mul + arithmetic.raw_div + arithmetic.ceil_div + arithmetic.integer_sqrt;
    }

    private countFunctionMathFunctions(func: RustFunctionMetrics): number {
        const { math_functions } = func;
        return math_functions.sqrt + math_functions.pow + math_functions.exp +
            math_functions.log + math_functions.trig_functions + math_functions.floor +
            math_functions.ceil + math_functions.round + math_functions.abs + math_functions.min_max;
    }

    private calculateFunctionSafetyScore(func: RustFunctionMetrics): number {
        const totalOps = this.countFunctionArithmetic(func);
        if (totalOps === 0) return 100;

        const safeOps = func.arithmetic.checked_add + func.arithmetic.checked_sub +
            func.arithmetic.checked_mul + func.arithmetic.checked_div +
            func.arithmetic.saturating_add + func.arithmetic.saturating_sub +
            func.arithmetic.saturating_mul;

        return Math.round((safeOps / totalOps) * 100);
    }

    private assessRiskLevel(rustResult: RustAnalysisResult): string {
        const { aggregated } = rustResult;

        let riskScore = 0;

        if (aggregated.safety_ratio < 0.7) riskScore += 3;
        if (aggregated.avg_cyclomatic_complexity > 10) riskScore += 2;
        if (aggregated.total_unsafe_ops > 5) riskScore += 3;

        if (riskScore >= 6) return 'high';
        if (riskScore >= 3) return 'medium';
        return 'low';
    }

    private identifyRiskFactors(rustResult: RustAnalysisResult): string[] {
        const factors: string[] = [];
        const { aggregated } = rustResult;

        if (aggregated.safety_ratio < 0.7) {
            factors.push(`Low safety ratio: ${Math.round(aggregated.safety_ratio * 100)}% of operations use safe arithmetic`);
        }

        if (aggregated.avg_cyclomatic_complexity > 10) {
            factors.push(`High average cyclomatic complexity: ${aggregated.avg_cyclomatic_complexity.toFixed(1)}`);
        }

        if (aggregated.total_unsafe_ops > 5) {
            factors.push(`${aggregated.total_unsafe_ops} potentially unsafe operations detected`);
        }

        return factors;
    }
}
