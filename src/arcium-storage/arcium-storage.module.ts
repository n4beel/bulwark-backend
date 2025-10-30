import { Module } from '@nestjs/common';
import { ArciumStorageService } from './arcium-storage.service';

@Module({
  providers: [ArciumStorageService],
  exports: [ArciumStorageService],
})
export class ArciumStorageModule {}
