import { Module } from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { AIModule } from '../ai/ai.module';

@Module({
    imports: [AIModule],
    providers: [AiAnalysisService],
    exports: [AiAnalysisService],
})
export class AiAnalysisModule { }
