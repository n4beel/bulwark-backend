import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { UserService } from '../users/user.service';
import { StaticAnalysisService } from 'src/static-analysis/static-analysis.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private staticAnalysisService: StaticAnalysisService,
  ) { }

  /**
   * Get GitHub OAuth URL
   */
  @Get('github/url')
  getGitHubAuthUrl(@Query('from') from: string, @Query('mode') mode: string, @Query('reportId') reportId: string) {
    try {
      const authUrl = this.authService.getGitHubAuthUrl(from, mode, reportId);
      return { authUrl };
    } catch (error) {
      throw new HttpException(
        'Failed to generate GitHub auth URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GitHub OAuth callback
   */
  @Get('github/callback')
  async handleGitHubCallback(
    @Query('code') code: string,
    @Query('state') state: string, // <-- This will be '/dashboard'
    @Res() res: Response,
  ) {
    try {
      // Exchange code for GitHub access token
      const accessToken = await this.authService.exchangeCodeForToken(code);

      // Get GitHub user info
      const githubUser = await this.authService.getGitHubUser(accessToken);

      // Find or create user in database
      const user = await this.userService.findOrCreateUser(githubUser);

      // Generate JWT token
      const jwtToken = this.userService.generateToken(user);

      // --- Use the 'state' for the redirect ---
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

      const stateObject = JSON.parse(state);

      // Use the 'state' as the return path.
      const returnPath = stateObject.path || '/';
      const mode = stateObject.mode || 'auth';
      const reportId = stateObject.reportId || '';
      console.log("🚀 ~ AuthController ~ handleGitHubCallback ~ mode:", mode)

      console.log("====================================================")
      console.log("CHECKING FOR REPORT ID");
      console.log("====================================================")

      try {
        if (reportId && reportId !== '') {
          console.log("====================================================")
          console.log("ASSOCIATING REPORT WITH USER");
          console.log("====================================================")
          const report = await this.staticAnalysisService.associateReportWithUser(reportId, String(user._id));
          console.log("🚀 ~ AuthController ~ handleGitHubCallback ~ report:", report)
        }
      } catch (error) {
        console.error('Failed to associate report with user:', error);
      }


      // Redirect with JWT token instead of GitHub token
      const redirectUrl = `${frontendUrl}${returnPath}?token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify({
        id: String(user._id),
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        jwtToken: jwtToken,
        mode: mode,
        reportId: reportId,
        from: returnPath,
      }))}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error('GitHub OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const errorUrl = `${frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}`;
      res.redirect(errorUrl);
    }
  }

  /**
   * Validate access token
   */
  @Get('validate')
  async validateToken(@Query('token') token: string) {
    try {
      if (!token) {
        throw new HttpException('Token is required', HttpStatus.BAD_REQUEST);
      }

      const user = await this.authService.getGitHubUser(token);
      return { valid: true, user };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}
