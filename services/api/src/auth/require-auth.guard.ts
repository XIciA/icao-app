import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { AUTH_VERIFIER, type AuthenticatedRequest, type AuthVerifier } from './auth.types';

@Injectable()
export class RequireAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = request.headers.authorization;
    const authorization = Array.isArray(raw) ? raw[0] : raw;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('missing_bearer_token');

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('missing_bearer_token');
    request.user = await this.verifier.verify(token);
    return true;
  }
}
