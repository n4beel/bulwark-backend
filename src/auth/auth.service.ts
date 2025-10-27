import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private configService: ConfigService) { }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const clientId = this.configService.get<string>('GIT_CLIENT_ID');
      const clientSecret = this.configService.get<string>(
        'GIT_CLIENT_SECRET',
      );

      if (!clientId || !clientSecret) {
        throw new Error('GitHub OAuth credentials not configured');
      }

      const response = await axios.post<GitHubTokenResponse>(
        'https://github.com/login/oauth/access_token',
        {
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.error) {
        throw new Error(
          `GitHub OAuth error: ${response.data.error_description || response.data.error}`,
        );
      }

      if (!response.data.access_token) {
        throw new Error('No access token received from GitHub');
      }

      return response.data.access_token;
    } catch (error) {
      this.logger.error(`Failed to exchange code for token: ${error.message}`);
      throw new Error('Failed to authenticate with GitHub');
    }
  }

  /**
   * Get GitHub user information using access token
   */
  async getGitHubUser(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get<GitHubUser>(
        'https://api.github.com/user',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get GitHub user: ${error.message}`);
      throw new Error('Failed to get user information from GitHub');
    }
  }

  /**
     * Generate GitHub OAuth URL
     */
  getGitHubAuthUrl(fromPath?: string): string { // <-- 1. Accept the path
    const clientId = this.configService.get<string>('GIT_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GIT_CALLBACK_URL');

    if (!clientId || !redirectUri) {
      throw new Error('GitHub OAuth credentials not configured');
    }

    // 2. Use the 'fromPath' as the state.
    //    Default to '/' if no path is provided.
    const state = fromPath || '/';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user user:email',
      state: state, // <-- 3. Use the path here
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Generate a random state parameter for OAuth security
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
