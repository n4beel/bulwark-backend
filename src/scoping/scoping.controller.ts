import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ScopingService, PreAuditReport } from './scoping.service';

export class GenerateReportDto {
  owner: string;
  repo: string;
  accessToken: string;
  selectedFiles?: string[];
}

@Controller('scoping')
export class ScopingController {
  private readonly logger = new Logger(ScopingController.name);

  constructor(private readonly scopingService: ScopingService) {}

  @Post('generate-report')
  async generatePreAuditReport(
    @Body() dto: GenerateReportDto,
  ): Promise<PreAuditReport> {
    try {
      this.logger.log(
        `Received request to generate report for ${dto.owner}/${dto.repo}`,
      );

      // Validate input
      if (!dto.owner || !dto.repo || !dto.accessToken) {
        throw new HttpException(
          'Missing required fields: owner, repo, and accessToken are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Generate the pre-audit report
      const report = await this.scopingService.generatePreAuditReport(
        dto.owner,
        dto.repo,
        dto.accessToken,
        dto.selectedFiles,
      );

      this.logger.log(
        `Successfully generated report for ${dto.owner}/${dto.repo}`,
      );
      return report;
    } catch (error) {
      this.logger.error(`Failed to generate report: ${error.message}`);

      if (error instanceof HttpException) {
        throw error;
      }

      // Handle specific GitHub API errors
      if (error.message.includes('Not Found')) {
        throw new HttpException(
          'Repository not found or access denied',
          HttpStatus.NOT_FOUND,
        );
      }

      if (error.message.includes('Bad credentials')) {
        throw new HttpException(
          'Invalid GitHub access token',
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new HttpException(
        'Failed to generate pre-audit report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('health')
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    return {
      status: 'healthy',
      timestamp: new Date(),
    };
  }
}
