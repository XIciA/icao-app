import { Injectable, UnauthorizedException } from '@nestjs/common';

export const APPLE_ID_TOKEN_VERIFIER = Symbol('APPLE_ID_TOKEN_VERIFIER');
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = new URL('https://appleid.apple.com/auth/keys');

export type VerifiedAppleIdTokenClaims = {
  aud?: unknown;
  exp?: unknown;
  iss?: unknown;
  nonce?: unknown;
  sub?: unknown;
};

export type AppleIdTokenVerifier = {
  verify(token: string, clientId: string): Promise<VerifiedAppleIdTokenClaims>;
};

@Injectable()
export class JoseAppleIdTokenVerifier implements AppleIdTokenVerifier {
  private readonly jwks = import('jose').then(({ createRemoteJWKSet }) => (
    createRemoteJWKSet(APPLE_JWKS, {
      cacheMaxAge: 60 * 60 * 1_000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    })
  ));

  async verify(token: string, clientId: string) {
    try {
      const [{ jwtVerify }, jwks] = await Promise.all([import('jose'), this.jwks]);
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256'],
        audience: clientId,
        issuer: APPLE_ISSUER,
      });
      return payload;
    } catch {
      throw new UnauthorizedException('invalid_apple_authorization');
    }
  }
}
