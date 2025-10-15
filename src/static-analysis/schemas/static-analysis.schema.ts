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
    };

    @Prop({ default: Date.now })
    createdAt: Date;

    @Prop({ default: Date.now })
    updatedAt: Date;
}

export const StaticAnalysisSchema = SchemaFactory.createForClass(StaticAnalysisReport);
