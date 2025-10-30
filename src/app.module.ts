import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScopingModule } from './scoping/scoping.module';
import { AuthModule } from './auth/auth.module';
import { StaticAnalysisModule } from './static-analysis/static-analysis.module';
import { DatabaseModule } from './database/database.module';
import { UploadsModule } from './uploads/uploads.module';
import { TestModule } from './test/test.module';
import { UserModule } from './users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UserModule,
    ScopingModule,
    AuthModule,
    StaticAnalysisModule,
    UploadsModule,
    TestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
