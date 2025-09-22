import {
    Controller,
    Post,
    Body,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import {
    StaticAnalysisService,
    StaticAnalysisReport,
} from './static-analysis.service';
import { StaticAnalysisDto, StaticAnalysisReportDocument } from './dto/static-analysis.dto';
import { UploadsService } from '../uploads/uploads.service';

@Controller('static-analysis')
export class StaticAnalysisController {
    private readonly logger = new Logger(StaticAnalysisController.name);

    constructor(
        private readonly staticAnalysisService: StaticAnalysisService,
        private readonly uploadsService: UploadsService,
    ) { }

    @Post('analyze-rust-contract')
    async analyzeRustContract(
        @Body() dto: StaticAnalysisDto,
    ): Promise<StaticAnalysisReport> {
        try {
            this.logger.log(
                `Received request to analyze Rust contract for ${dto.owner}/${dto.repo}`,
            );

            // Validate input
            if (!dto.owner || !dto.repo || !dto.accessToken) {
                throw new HttpException(
                    'Missing required fields: owner, repo, and accessToken are required',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Perform static analysis
            const report = await this.staticAnalysisService.analyzeRustContract(
                dto.owner,
                dto.repo,
                dto.accessToken,
                dto.selectedFiles,
                dto.analysisOptions,
            );

            this.logger.log(
                `Successfully analyzed Rust contract for ${dto.owner}/${dto.repo}`,
            );
            return report;
        } catch (error) {
            this.logger.error(`Failed to analyze Rust contract: ${error.message}`);

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
                'Failed to perform static analysis on Rust contract',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('reports')
    async getAllReports(): Promise<StaticAnalysisReportDocument[]> {
        try {
            this.logger.log('Retrieving all analysis reports');
            return await this.staticAnalysisService.getAllReports();
        } catch (error) {
            this.logger.error(`Failed to retrieve reports: ${error.message}`);
            throw new HttpException(
                'Failed to retrieve analysis reports',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('reports/:repository')
    async getReportByRepository(@Body() body: { repository: string }): Promise<StaticAnalysisReportDocument | null> {
        try {
            this.logger.log(`Retrieving report for ${body.repository}`);
            return await this.staticAnalysisService.getReportByRepository(body.repository);
        } catch (error) {
            this.logger.error(`Failed to retrieve report: ${error.message}`);
            throw new HttpException(
                'Failed to retrieve analysis report',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('debug-framework')
    async debugFramework(@Body() dto: { owner: string; repo: string; accessToken: string }): Promise<any> {
        try {
            this.logger.log(`Debug framework detection for ${dto.owner}/${dto.repo}`);

            // Get repository info and clone
            const repoInfo = await this.staticAnalysisService.debugFrameworkDetection(
                dto.owner,
                dto.repo,
                dto.accessToken
            );

            return repoInfo;
        } catch (error) {
            this.logger.error(`Debug failed: ${error.message}`);
            throw new HttpException(
                'Debug failed',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('analyze-uploaded-contract')
    async analyzeUploadedContract(
        @Body() dto: { extractedPath: string; selectedFiles?: string[] },
    ): Promise<StaticAnalysisReport> {
        try {
            this.logger.log(`Analyzing uploaded contract at: ${dto.extractedPath}`);

            // Get upload session to extract repository info
            const uploadSession = this.uploadsService.getUploadSession(dto.extractedPath);
            if (!uploadSession) {
                throw new HttpException(
                    'Upload session not found. Please upload files first using /uploads/discover-files',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Use static analysis service with uploaded files
            const report = await this.staticAnalysisService.analyzeUploadedContract(
                dto.extractedPath,
                uploadSession.projectName,
                uploadSession.originalFilename,
                dto.selectedFiles,
            );

            this.logger.log(`Successfully analyzed uploaded contract: ${uploadSession.projectName}`);
            return report;

        } catch (error) {
            this.logger.error(`Failed to analyze uploaded contract: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                `Analysis failed: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('health')
    healthCheck(): Promise<{ status: string; timestamp: Date }> {
        return Promise.resolve({
            status: 'healthy',
            timestamp: new Date(),
        });
    }
}
