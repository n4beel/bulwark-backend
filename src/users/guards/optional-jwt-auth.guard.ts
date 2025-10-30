import {
    Injectable,
    CanActivate,
    ExecutionContext,
} from '@nestjs/common';
import { UserService } from '../user.service';

/**
 * Optional JWT Auth Guard - doesn't throw errors if token is missing
 * Use this for routes where authentication is optional
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
    constructor(private userService: UserService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            // No token provided, continue without user
            request.user = null;
            return true;
        }

        try {
            const payload = this.userService.verifyToken(token);
            const user = await this.userService.findById(payload.userId);

            if (user) {
                // Attach user to request for use in controllers
                request.user = user;
            } else {
                request.user = null;
            }
        } catch (error) {
            // Invalid token, continue without user
            request.user = null;
        }

        return true;
    }

    private extractTokenFromHeader(request: any): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}

