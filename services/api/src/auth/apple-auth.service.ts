import { createCipheriv, createDecipheriv, createHash, createSign, randomBytes } from 'node:crypto';

import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { IdentityDigestService } from '../account/identity-digest.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { appleRevocableCredentials } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { APPLE_AUTH_HTTP, AppleAuthHttpError, type AppleAuthHttp } from './apple-auth-http';
import type { VerifiedAuthSession } from './auth.types';
import { APPLE_ID_TOKEN_VERIFIER, type AppleIdTokenVerifier } from './apple-id-token.verifier';

const APPLE_ISSUER = 'https://appleid.apple.com';
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

type AppleCredentialInput = {
  authorizationCode: string;
  rawNonce: string;
};

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

@Injectable()
export class AppleAuthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(APPLE_AUTH_HTTP) private readonly http: AppleAuthHttp,
    @Inject(APPLE_ID_TOKEN_VERIFIER) private readonly idTokenVerifier: AppleIdTokenVerifier,
    private readonly database: DatabaseService,
    private readonly digests: IdentityDigestService,
  ) {}

  async registerCredential(
    source: VerifiedAuthSession,
    input: AppleCredentialInput,
    now = new Date(),
  ) {
    const subject = this.appleSubject(source);
    const apple = this.requireConfiguration();
    let response;
    try {
      response = await this.http.exchangeAuthorizationCode({
        authorizationCode: input.authorizationCode,
        clientId: apple.clientId,
        clientSecret: this.clientSecret(apple, now),
      });
    } catch (error) {
      if (this.httpErrorCode(error) === 'invalid_grant') {
        throw new UnauthorizedException('invalid_apple_authorization');
      }
      throw new ServiceUnavailableException('apple_auth_unavailable');
    }
    const claims = await this.idTokenVerifier.verify(response.idToken, apple.clientId);
    this.validateClaims(claims, subject, input.rawNonce, now, apple.clientId);
    const currentDigest = this.digests.current('apple-revocable-credential-v1', 'apple', subject);
    const candidateDigests = this.digests
      .candidates('apple-revocable-credential-v1', 'apple', subject)
      .map(({ digest }) => digest);
    const encryptedRefreshToken = this.encrypt(
      response.refreshToken,
      apple.encryptionKey,
      this.encryptionContext(source.user.id, source.authUserId, currentDigest.digest),
    );

    await this.database.db.transaction(async (transaction) => {
      for (const digest of [...candidateDigests].sort()) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-credential:${digest}`}, 0))`);
      }
      const [existing] = await transaction.select({
        accountId: appleRevocableCredentials.accountId,
        id: appleRevocableCredentials.id,
        status: appleRevocableCredentials.status,
      }).from(appleRevocableCredentials)
        .where(inArray(appleRevocableCredentials.subjectDigest, candidateDigests))
        .limit(1);
      if (existing && existing.status !== 'revoked' && existing.accountId !== source.user.id) {
        throw new UnauthorizedException('identity_account_conflict');
      }
      const values = {
        accountId: source.user.id,
        authUserId: source.authUserId,
        subjectDigest: currentDigest.digest,
        digestKeyVersion: currentDigest.version,
        encryptedRefreshToken,
        encryptionVersion: 1,
        status: 'active',
        revokeAttemptCount: 0,
        nextRetryAt: null,
        lastAttemptAt: null,
        lastErrorCode: null,
        revokedAt: null,
        updatedAt: now,
      } as const;
      if (existing) {
        await transaction.update(appleRevocableCredentials).set(values)
          .where(eq(appleRevocableCredentials.id, existing.id));
      } else {
        await transaction.insert(appleRevocableCredentials).values(values);
      }
    });
    return { registered: true as const };
  }

  async revokeForAccount(accountId: string, now = new Date()) {
    const apple = this.requireConfiguration();
    const credentials = await this.database.db.select().from(appleRevocableCredentials)
      .where(and(
        eq(appleRevocableCredentials.accountId, accountId),
        ne(appleRevocableCredentials.status, 'revoked'),
      ));
    if (credentials.length === 0) return { outcome: 'manual_action_required' as const };

    for (const credential of credentials) {
      await this.database.db.update(appleRevocableCredentials).set({
        status: 'revoke_pending',
        lastAttemptAt: now,
        updatedAt: now,
      }).where(eq(appleRevocableCredentials.id, credential.id));
      try {
        await this.http.revoke({
          clientId: apple.clientId,
          clientSecret: this.clientSecret(apple, now),
          refreshToken: this.decrypt(
            credential.encryptedRefreshToken,
            apple.encryptionKey,
            this.encryptionContext(credential.accountId, credential.authUserId, credential.subjectDigest),
          ),
        });
      } catch (error) {
        const code = this.httpErrorCode(error);
        await this.database.db.update(appleRevocableCredentials).set({
          status: 'retryable',
          revokeAttemptCount: credential.revokeAttemptCount + 1,
          nextRetryAt: new Date(now.getTime() + this.retryDelayMs(credential.revokeAttemptCount + 1)),
          lastAttemptAt: now,
          lastErrorCode: code,
          updatedAt: now,
        }).where(eq(appleRevocableCredentials.id, credential.id));
        return { errorCode: code, outcome: 'retryable' as const };
      }
      await this.database.db.update(appleRevocableCredentials).set({
        status: 'revoked',
        revokeAttemptCount: credential.revokeAttemptCount + 1,
        nextRetryAt: null,
        lastAttemptAt: now,
        lastErrorCode: null,
        revokedAt: now,
        updatedAt: now,
      }).where(eq(appleRevocableCredentials.id, credential.id));
    }
    return { outcome: 'revoked' as const };
  }

  private appleSubject(source: VerifiedAuthSession) {
    const subjects = [...new Set(source.identities
      .filter((identity) => identity.provider === 'apple')
      .map((identity) => identity.subject))];
    if (!source.user.providers?.includes('apple') || subjects.length !== 1) {
      throw new UnauthorizedException('apple_reauthentication_unavailable');
    }
    return subjects[0]!;
  }

  private validateClaims(
    claims: { aud?: unknown; exp?: unknown; iss?: unknown; nonce?: unknown; sub?: unknown },
    subject: string,
    rawNonce: string,
    now: Date,
    clientId: string,
  ) {
    const audienceMatches = claims.aud === clientId
      || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
    const nonce = createHash('sha256').update(rawNonce).digest('hex');
    if (
      claims.iss !== APPLE_ISSUER
      || !audienceMatches
      || typeof claims.exp !== 'number'
      || claims.exp <= Math.floor(now.getTime() / 1_000)
      || claims.sub !== subject
      || claims.nonce !== nonce
    ) throw new UnauthorizedException('invalid_apple_authorization');
  }

  private requireConfiguration() {
    const { appleCredentialEncryptionKey, appleKeyId, applePrivateKey, appleSignInClientId, appleTeamId } = this.config;
    if (!appleCredentialEncryptionKey || !appleKeyId || !applePrivateKey || !appleSignInClientId || !appleTeamId) {
      throw new ServiceUnavailableException('apple_auth_server_not_configured');
    }
    const encryptionKey = Buffer.from(appleCredentialEncryptionKey, 'base64');
    if (encryptionKey.byteLength !== 32) throw new ServiceUnavailableException('apple_auth_server_not_configured');
    return {
      clientId: appleSignInClientId,
      encryptionKey,
      keyId: appleKeyId,
      privateKey: applePrivateKey,
      teamId: appleTeamId,
    };
  }

  private clientSecret(
    apple: { clientId: string; keyId: string; privateKey: string; teamId: string },
    now: Date,
  ) {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const header = base64urlJson({ alg: 'ES256', kid: apple.keyId, typ: 'JWT' });
    const payload = base64urlJson({
      aud: APPLE_ISSUER,
      exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
      iat: issuedAt,
      iss: apple.teamId,
      sub: apple.clientId,
    });
    const unsigned = `${header}.${payload}`;
    const signer = createSign('SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign({ dsaEncoding: 'ieee-p1363', key: apple.privateKey });
    return `${unsigned}.${signature.toString('base64url')}`;
  }

  private encrypt(value: string, key: Buffer, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decrypt(value: string, key: Buffer, context: string) {
    const [version, rawIv, rawTag, rawCiphertext] = value.split('.');
    if (version !== 'v1' || !rawIv || !rawTag || !rawCiphertext) {
      throw new AppleAuthHttpError('invalid_response');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(rawIv, 'base64url'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(rawTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(rawCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new AppleAuthHttpError('invalid_response');
    }
  }

  private encryptionContext(accountId: string, authUserId: string, subjectDigest: string) {
    return `apple-revocable-credential-aad-v1\0${accountId}\0${authUserId}\0${subjectDigest}`;
  }

  private retryDelayMs(attempt: number) {
    return Math.min(24 * 60 * 60 * 1_000, 60_000 * (2 ** Math.min(attempt - 1, 10)));
  }

  private httpErrorCode(error: unknown): AppleAuthHttpError['code'] {
    const candidate = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    return [
      'invalid_grant',
      'invalid_client',
      'rate_limited',
      'server_error',
      'invalid_response',
      'unavailable',
    ].includes(candidate as string)
      ? candidate as AppleAuthHttpError['code']
      : 'unavailable';
  }
}
