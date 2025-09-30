import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaticAnalysisController } from './static-analysis.controller';
import { StaticAnalysisService } from './static-analysis.service';
import { RustAnalyzerService } from './rust-analyzer.service';
import { GitHubModule } from '../github/github.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StaticAnalysisReport, StaticAnalysisSchema } from './schemas/static-analysis.schema';

@Module({
  imports: [
    GitHubModule,
    UploadsModule,
    MongooseModule.forFeature([
      { name: StaticAnalysisReport.name, schema: StaticAnalysisSchema },
    ]),
  ],
  controllers: [StaticAnalysisController],
  providers: [StaticAnalysisService, RustAnalyzerService],
  exports: [StaticAnalysisService, RustAnalyzerService],
})
export class StaticAnalysisModule { }
