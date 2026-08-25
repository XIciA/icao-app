import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { AdminAuthService } from './admin-auth.service';
import type { OpsAuthenticatedRequest } from './admin.types';

@Injectable()
export class RequireAdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OpsAuthenticatedRequest>();
    const raw = request.headers.authorization;
    const authorization = Array.isArray(raw) ? raw[0] : raw;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing_ops_bearer_token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('missing_ops_bearer_token');
    request.opsStaff = await this.auth.authenticate(token);
    return true;
  }
}
