import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { GitHubUser } from '../auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) {}

    /**
     * Find or create user from GitHub data
     */
    async findOrCreateUser(githubUser: GitHubUser): Promise<UserDocument> {
        try {
            // Try to find existing user
            let user = await this.userModel.findOne({ githubId: githubUser.id }).exec();

            if (!user) {
                // Create new user
                user = new this.userModel({
                    githubId: githubUser.id,
                    githubUsername: githubUser.login,
                    email: githubUser.email,
                    name: githubUser.name,
                    avatarUrl: githubUser.avatar_url,
                });
                await user.save();
                this.logger.log(`Created new user: ${githubUser.login} (${githubUser.id})`);
            } else {
                // Update existing user info (in case GitHub data changed)
                user.githubUsername = githubUser.login;
                user.email = githubUser.email;
                user.name = githubUser.name;
                user.avatarUrl = githubUser.avatar_url;
                await user.save();
                this.logger.log(`Updated user: ${githubUser.login} (${githubUser.id})`);
            }

            return user;
        } catch (error) {
            this.logger.error(`Failed to find or create user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate JWT token for user
     */
    generateToken(user: UserDocument): string {
        const payload = {
            userId: String(user._id),
            githubId: user.githubId,
            githubUsername: user.githubUsername,
        };

        return this.jwtService.sign(payload);
    }

    /**
     * Verify and decode JWT token
     */
    verifyToken(token: string): { userId: string; githubId: number; githubUsername: string } {
        return this.jwtService.verify(token) as any;
    }

    /**
     * Find user by ID
     */
    async findById(userId: string): Promise<UserDocument | null> {
        return this.userModel.findById(userId).exec();
    }

    /**
     * Find user by GitHub ID
     */
    async findByGitHubId(githubId: number): Promise<UserDocument | null> {
        return this.userModel.findOne({ githubId }).exec();
    }
}

