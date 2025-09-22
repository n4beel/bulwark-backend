import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaticAnalysisController } from './static-analysis.controller';
import { StaticAnalysisService } from './static-analysis.service';
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
  providers: [StaticAnalysisService],
  exports: [StaticAnalysisService],
})
export class StaticAnalysisModule { }
