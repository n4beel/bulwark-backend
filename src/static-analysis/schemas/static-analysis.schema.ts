import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StaticAnalysisDocument = StaticAnalysisReport & Document;

@Schema({ timestamps: true })
export class StaticAnalysisReport {
    @Prop({ required: true })
    repository: string;

    @Prop({ required: true })
    repositoryUrl: string;

    @Prop({ required: true })
    language: string;

    @Prop({ required: true })
    framework: string;

    @Prop({ type: Object, required: true })
    analysisFactors: any;

    @Prop({ type: Object, required: true })
    scores: any;

    // Static analysis scores - flexible object for various metrics
    @Prop({ type: Object, required: false })
    static_analysis_scores?: {
        total_lines_of_code?: number;
        total_functions?: number;
        code_complexity_factor?: number;
        [key: string]: any; // Allow for additional flexible properties
    };

    // Analysis metadata
    @Prop({ type: String, required: false })
    analysis_engine?: string;

    @Prop({ type: String, required: false })
    analyzer_version?: string;

    @Prop({ type: String, required: false })
    analysis_date?: string;

    // TypeScript analysis results
    @Prop({ type: Object, required: false })
    typescript_analysis?: {
        engine: string;
        version: string;
        success: boolean;
        analysisFactors: any;
        scores: any;
        total_lines_of_code: number;
        total_functions: number;
        complex_math_operations: number;
    };

    // Rust analysis results
    @Prop({ type: Object, required: false })
    rust_analysis?: {
        engine: string;
        version: string;
        success: boolean;
        error: string | null;
        analysisFactors: any;
        total_lines_of_code: number;
        total_functions: number;
        complex_math_operations: number;
    };

    // AI analysis results
    @Prop({ type: Object, required: false })
    ai_analysis?: {
        engine: string;
        version: string;
        success: boolean;
        error: string | null;
        analysisFactors: any;
        documentation_clarity: number;
        testing_coverage: number;
        financial_logic_complexity: number;
        attack_vector_risk: number;
        value_at_risk: number;
        game_theory_complexity: number;
    };

    // Analysis comparison
    @Prop({ type: Object, required: false })
    analysis_comparison?: {
        lines_of_code_diff: number;
        functions_diff: number;
        math_operations_diff: number;
        accuracy_notes: string[];
    } | {
        error: string;
        fallback_used: string;
    };

    // Augmentation metadata: stores which fields were overridden and raw rust payload
    @Prop({ type: Object, required: false })
    augmentationMeta?: {
        workspaceId?: string;
        overridden?: string[];
        apiVersion?: string;
        timestamp?: string;
    };

    @Prop({ type: Object, required: false })
    rustAugmentationRaw?: any;

    @Prop({ type: Object, required: true })
    performance: {
        analysisTime: number;
        memoryUsage: number;
        typescript_analysis_included?: boolean;
        rust_analysis_success?: boolean;
    };

    @Prop({ default: Date.now })
    createdAt: Date;

    @Prop({ default: Date.now })
    updatedAt: Date;
}

export const StaticAnalysisSchema = SchemaFactory.createForClass(StaticAnalysisReport);
