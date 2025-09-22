import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    HttpException,
    HttpStatus,
    Logger,
    Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UploadsService } from './uploads.service';
import * as path from 'path';
import * as fs from 'fs';

@Controller('uploads')
export class UploadsController {
    private readonly logger = new Logger(UploadsController.name);

    constructor(private readonly uploadsService: UploadsService) { }

    @Post('discover-files')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: (req, file, cb) => {
                    const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    cb(null, uploadDir);
                },
                filename: (req, file, cb) => {
                    const timestamp = Date.now();
                    const ext = path.extname(file.originalname);
                    cb(null, `upload-${timestamp}${ext}`);
                },
            }),
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB limit
            },
            fileFilter: (req, file, cb) => {
                const allowedExtensions = ['.zip', '.tar', '.gz', '.rar', '.7z'];
                const fileExt = path.extname(file.originalname).toLowerCase();

                if (allowedExtensions.includes(fileExt) ||
                    file.originalname.toLowerCase().includes('.tar.gz')) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Only zip, tar.gz, rar, and 7z files are allowed.'), false);
                }
            },
        }),
    )
    async discoverUploadedFiles(
        @UploadedFile() file: Express.Multer.File,
    ): Promise<any> {
        try {
            if (!file) {
                throw new HttpException(
                    'No file uploaded',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`Discovering files in uploaded archive: ${file.originalname}`);

            const discovery = await this.uploadsService.discoverFilesInUpload(
                file.path,
                file.originalname,
            );

            this.logger.log(`Successfully discovered files in: ${file.originalname}`);

            return discovery;

        } catch (error) {
            this.logger.error(`Failed to discover files in upload: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                `Failed to discover files: ${error.message}`,
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
