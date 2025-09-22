import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { GitHubService } from '../github/github.service';

@Module({
    controllers: [UploadsController],
    providers: [UploadsService, GitHubService],
    exports: [UploadsService],
})
export class UploadsModule { }
