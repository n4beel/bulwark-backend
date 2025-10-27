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

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  /**
   * Get GitHub OAuth URL
   */
  @Get('github/url')
  getGitHubAuthUrl(@Query('from') from: string) {
    try {
      const authUrl = this.authService.getGitHubAuthUrl(from);
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
      // ... (your code to exchange token and get user) ...
      const accessToken = await this.authService.exchangeCodeForToken(code);
      const user = await this.authService.getGitHubUser(accessToken);

      // --- Use the 'state' for the redirect ---
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

      // Use the 'state' as the return path.
      const returnPath = state || '/';

      // This will now be: https://bulwark.blockapex.io/dashboard?token=...
      const redirectUrl = `${frontendUrl}${returnPath}?token=${encodeURIComponent(accessToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;

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
