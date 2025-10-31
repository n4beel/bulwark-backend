import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../users/user.module';
import { StaticAnalysisModule } from '../static-analysis/static-analysis.module';

@Module({
  imports: [UserModule, StaticAnalysisModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule { }
