import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AccountIdentityService } from '../account/account-identity.service';
import { AUTH_VERIFIER, type AuthenticatedRequest, type AuthVerifier } from './auth.types';
import { SessionSecurityService } from './session-security.service';

@Injectable()
export class RequireAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly identities: AccountIdentityService,
    private readonly sessions: SessionSecurityService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = request.headers.authorization;
    const authorization = Array.isArray(raw) ? raw[0] : raw;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('missing_bearer_token');

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('missing_bearer_token');
    const auth = await this.verifier.verify(token);
    await this.sessions.assertActive(auth);
    auth.user = await this.identities.resolve(auth);
    request.auth = auth;
    request.user = auth.user;
    return true;
  }
}

/** Anonymous reads are allowed only where this guard is explicitly installed.
 * A supplied invalid/expired token is never downgraded to a guest identity. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly required: RequireAuthGuard) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.headers.authorization === undefined ? true : this.required.canActivate(context);
  }
}
