import { createCipheriv, createDecipheriv, createHash, createHmac, createSign, randomBytes, randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { IdentityDigestService } from '../account/identity-digest.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { accountSecurityEvents, accounts, appleCredentialIntakes, appleRevocableCredentials } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { APPLE_AUTH_HTTP, AppleAuthHttpError, type AppleAuthHttp } from './apple-auth-http';
import type { VerifiedAuthSession } from './auth.types';
import { APPLE_ID_TOKEN_VERIFIER, type AppleIdTokenVerifier } from './apple-id-token.verifier';

const APPLE_ISSUER = 'https://appleid.apple.com';
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;
const INTAKE_RETENTION_MS = 183 * 24 * 60 * 60 * 1_000;
const INTAKE_LEASE_MS = 2 * 60 * 1_000;
const INTAKE_RETRY_INTERVAL_MS = 60_000;

type AppleCredentialInput = {
  authorizationCode: string;
  rawNonce: string;
};

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

@Injectable()
export class AppleAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppleAuthService.name);
  private retryTimer?: NodeJS.Timeout;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(APPLE_AUTH_HTTP) private readonly http: AppleAuthHttp,
    @Inject(APPLE_ID_TOKEN_VERIFIER) private readonly idTokenVerifier: AppleIdTokenVerifier,
    private readonly database: DatabaseService,
    private readonly digests: IdentityDigestService,
  ) {}

  onModuleInit() {
    this.retryTimer = setInterval(() => {
      void this.retryDueIntakes().catch(() => this.logger.error('apple_credential_intake_retry_failed'));
    }, INTAKE_RETRY_INTERVAL_MS);
    this.retryTimer.unref();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

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
        throw new ForbiddenException('invalid_apple_authorization');
      }
      throw new ServiceUnavailableException('apple_auth_unavailable');
    }
    let claims;
    try {
      claims = await this.idTokenVerifier.verify(response.idToken, apple.clientId);
      this.validateClaims(claims, subject, input.rawNonce, now, apple.clientId);
    } catch {
      await this.revokeUnpersisted(response.refreshToken, apple, now, source, subject);
      throw new ForbiddenException('invalid_apple_authorization');
    }
    const currentDigest = this.digests.current('apple-revocable-credential-v1', 'apple', subject);
    const candidateDigests = this.digests
      .candidates('apple-revocable-credential-v1', 'apple', subject)
      .map(({ digest }) => digest);
    const encryptedRefreshToken = this.encrypt(
      response.refreshToken,
      apple.encryptionKey,
      this.encryptionContext(source.user.id, source.authUserId, currentDigest.digest),
    );

    const intakeId = randomUUID();
    try {
      await this.database.db.insert(appleCredentialIntakes).values({
        id: intakeId,
        accountId: source.user.id,
        authUserId: source.authUserId,
        subjectDigest: currentDigest.digest,
        subjectDigestAliases: candidateDigests,
        digestKeyVersion: currentDigest.version,
        encryptedRefreshToken,
        retentionAt: new Date(now.getTime() + INTAKE_RETENTION_MS),
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      await this.revokeUnpersisted(response.refreshToken, apple, now, source, subject);
      throw new ServiceUnavailableException('apple_credential_persistence_failed');
    }
    try {
      const outcome = await this.bindIntake(intakeId, now);
      if (outcome === 'already_active') await this.compensateIntake(intakeId, now);
    } catch (error) {
      await this.compensateIntake(intakeId, now).catch(() => undefined);
      if (error instanceof ConflictException || error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException('apple_credential_persistence_failed');
    }
    return { registered: true as const };
  }

  async retryDueIntakes(now = new Date()) {
    await this.database.db.delete(appleCredentialIntakes).where(and(
      inArray(appleCredentialIntakes.status, ['revoked', 'manual_action_required']),
      lte(appleCredentialIntakes.retentionAt, now),
    ));
    const rows = await this.database.db.select({ id: appleCredentialIntakes.id })
      .from(appleCredentialIntakes)
      .where(or(
        eq(appleCredentialIntakes.status, 'pending_binding'),
        and(
          inArray(appleCredentialIntakes.status, ['retryable', 'revoke_pending']),
          or(isNull(appleCredentialIntakes.nextRetryAt), lte(appleCredentialIntakes.nextRetryAt, now)),
          or(isNull(appleCredentialIntakes.leaseUntil), lte(appleCredentialIntakes.leaseUntil, now)),
        ),
      )).limit(25);
    for (const row of rows) {
      const [intake] = await this.database.db.select({ status: appleCredentialIntakes.status })
        .from(appleCredentialIntakes).where(eq(appleCredentialIntakes.id, row.id)).limit(1);
      if (!intake) continue;
      if (intake.status === 'pending_binding') {
        try {
          const outcome = await this.bindIntake(row.id, now);
          if (outcome !== 'already_active') continue;
        } catch {
          // A pending intake that can no longer bind must be revoked durably.
        }
      }
      await this.compensateIntake(row.id, now);
    }
  }

  private async bindIntake(intakeId: string, now: Date) {
    return this.database.db.transaction(async (transaction) => {
      const [intake] = await transaction.select().from(appleCredentialIntakes)
        .where(eq(appleCredentialIntakes.id, intakeId)).limit(1).for('update');
      if (!intake) return 'missing' as const;
      if (intake.status !== 'pending_binding' || !intake.encryptedRefreshToken) {
        throw new Error('apple_credential_intake_not_bindable');
      }
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${intake.accountId}`}, 0))`);
      const aliases = Array.isArray(intake.subjectDigestAliases)
        ? intake.subjectDigestAliases.filter((digest): digest is string => typeof digest === 'string')
        : [];
      const candidateDigests = [...new Set([intake.subjectDigest, ...aliases])];
      for (const digest of [...candidateDigests].sort()) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-credential:${digest}`}, 0))`);
      }
      const [account] = await transaction.select({ status: accounts.status }).from(accounts)
        .where(eq(accounts.id, intake.accountId)).limit(1).for('update');
      if (!account || account.status !== 'active') throw new ForbiddenException('account_not_active');
      const [existing] = await transaction.select({
        accountId: appleRevocableCredentials.accountId,
        id: appleRevocableCredentials.id,
        status: appleRevocableCredentials.status,
      }).from(appleRevocableCredentials)
        .where(or(
          inArray(appleRevocableCredentials.subjectDigest, candidateDigests),
          eq(appleRevocableCredentials.authUserId, intake.authUserId),
        )).limit(1);
      if (existing && existing.status !== 'revoked' && existing.accountId !== intake.accountId) {
        throw new ConflictException('identity_account_conflict');
      }
      if (existing && existing.status !== 'revoked') return 'already_active' as const;
      const values = {
        accountId: intake.accountId,
        authUserId: intake.authUserId,
        subjectDigest: intake.subjectDigest,
        digestKeyVersion: intake.digestKeyVersion,
        encryptedRefreshToken: intake.encryptedRefreshToken,
        encryptionVersion: intake.encryptionVersion,
        status: 'active',
        revokeAttemptCount: 0,
        nextRetryAt: null,
        revokeLeaseToken: null,
        revokeLeaseUntil: null,
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
      await transaction.delete(appleCredentialIntakes).where(eq(appleCredentialIntakes.id, intake.id));
      return 'bound' as const;
    });
  }

  private async compensateIntake(intakeId: string, now: Date) {
    const leaseToken = randomUUID();
    const claimed = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-intake:${intakeId}`}, 0))`);
      const [intake] = await transaction.select().from(appleCredentialIntakes)
        .where(eq(appleCredentialIntakes.id, intakeId)).limit(1);
      if (!intake || ['revoked', 'manual_action_required'].includes(intake.status)) return undefined;
      if (intake.leaseToken && intake.leaseUntil && intake.leaseUntil > now) return undefined;
      const [updated] = await transaction.update(appleCredentialIntakes).set({
        status: 'revoke_pending',
        attemptCount: intake.attemptCount + 1,
        leaseToken,
        leaseUntil: new Date(now.getTime() + INTAKE_LEASE_MS),
        lastAttemptAt: now,
        nextRetryAt: null,
        updatedAt: now,
      }).where(eq(appleCredentialIntakes.id, intake.id)).returning();
      return updated ? { intake: updated, conservative: intake.status !== 'pending_binding' || intake.attemptCount > 0 } : undefined;
    });
    if (!claimed) return;
    const { intake, conservative } = claimed;
    if (!intake.encryptedRefreshToken) {
      await this.finishIntake(intake.id, leaseToken, {
        status: 'manual_action_required',
        lastErrorCode: 'credential_unavailable',
      }, now);
      return;
    }
    const apple = this.requireConfiguration();
    try {
      await this.http.revoke({
        clientId: apple.clientId,
        clientSecret: this.clientSecret(apple, now),
        refreshToken: this.decrypt(
          intake.encryptedRefreshToken,
          apple.encryptionKey,
          this.encryptionContext(intake.accountId, intake.authUserId, intake.subjectDigest),
        ),
      });
    } catch (error) {
      const code = this.httpErrorCode(error);
      if (code === 'invalid_grant' && conservative) {
        await this.finishIntake(intake.id, leaseToken, {
          encryptedRefreshToken: null,
          status: 'manual_action_required',
          lastErrorCode: 'invalid_grant_after_attempt',
        }, now);
        return;
      }
      await this.finishIntake(intake.id, leaseToken, {
        status: 'retryable',
        lastErrorCode: code,
        nextRetryAt: new Date(now.getTime() + this.retryDelayMs(intake.attemptCount)),
      }, now);
      return;
    }
    await this.finishIntake(intake.id, leaseToken, {
      encryptedRefreshToken: null,
      status: 'revoked',
      lastErrorCode: null,
      revokedAt: now,
    }, now);
  }

  private async finishIntake(
    intakeId: string,
    leaseToken: string,
    values: Partial<typeof appleCredentialIntakes.$inferInsert>,
    now: Date,
  ) {
    await this.database.db.update(appleCredentialIntakes).set({
      ...values,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: now,
    }).where(and(
      eq(appleCredentialIntakes.id, intakeId),
      eq(appleCredentialIntakes.leaseToken, leaseToken),
      eq(appleCredentialIntakes.status, 'revoke_pending'),
    ));
  }

  private async revokeUnpersisted(
    refreshToken: string,
    apple: ReturnType<AppleAuthService['requireConfiguration']>,
    now: Date,
    source: VerifiedAuthSession,
    subject: string,
  ) {
    try {
      await this.http.revoke({
        clientId: apple.clientId,
        clientSecret: this.clientSecret(apple, now),
        refreshToken,
      });
      return;
    } catch (error) {
      const errorCode = this.httpErrorCode(error);
      try {
        await this.database.db.insert(accountSecurityEvents).values({
          accountDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
            .update(`account-security-event-v1\0${source.user.id}`)
            .digest('hex'),
          subjectDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
            .update(`apple-unpersisted-revoke-risk-v1\0${subject}`)
            .digest('hex'),
          createdAt: now,
          eventType: 'apple_unpersisted_credential_revoke_failed',
          outcome: 'failed',
          metadata: { errorCode, manualActionRequired: true },
          retentionAt: new Date(now.getTime() + INTAKE_RETENTION_MS),
        });
      } catch {
        this.logger.error('apple_unpersisted_credential_risk_marker_failed');
      }
    }
  }

  async revokeForAccount(accountId: string, now = new Date()) {
    const intakes = await this.database.db.select().from(appleCredentialIntakes)
      .where(eq(appleCredentialIntakes.accountId, accountId));
    for (const intake of intakes) {
      if (!['revoked', 'manual_action_required'].includes(intake.status)) {
        await this.compensateIntake(intake.id, now);
      }
    }
    const currentIntakes = await this.database.db.select().from(appleCredentialIntakes)
      .where(eq(appleCredentialIntakes.accountId, accountId));
    const unresolvedIntake = currentIntakes.find(({ status }) => (
      !['revoked', 'manual_action_required'].includes(status)
    ));
    if (unresolvedIntake) {
      return {
        errorCode: unresolvedIntake.lastErrorCode ?? 'unavailable',
        outcome: 'retryable' as const,
      };
    }
    const allCredentials = await this.database.db.select().from(appleRevocableCredentials)
      .where(eq(appleRevocableCredentials.accountId, accountId));
    const intakeManualActionRequired = currentIntakes.some(({ status }) => status === 'manual_action_required');
    if (allCredentials.length === 0) {
      if (intakeManualActionRequired || currentIntakes.length === 0) {
        return { outcome: 'manual_action_required' as const };
      }
      return { outcome: 'revoked' as const };
    }
    const credentials = allCredentials.filter(({ status }) => status !== 'revoked');
    if (credentials.length === 0) {
      return {
        outcome: intakeManualActionRequired ? 'manual_action_required' as const : 'revoked' as const,
      };
    }
    let manualActionRequired = intakeManualActionRequired;

    for (const credential of credentials) {
      if (!credential.encryptedRefreshToken || credential.status === 'manual_action_required') {
        manualActionRequired = true;
        if (credential.status !== 'manual_action_required') {
          await this.database.db.update(appleRevocableCredentials).set({
            status: 'manual_action_required',
            nextRetryAt: null,
            lastErrorCode: 'credential_unavailable',
            updatedAt: now,
          }).where(eq(appleRevocableCredentials.id, credential.id));
        }
        continue;
      }
      const apple = this.requireConfiguration();
      const attemptNumber = credential.revokeAttemptCount + 1;
      const revokeLeaseToken = randomUUID();
      const [claimed] = await this.database.db.update(appleRevocableCredentials).set({
        status: 'revoke_pending',
        revokeAttemptCount: attemptNumber,
        revokeLeaseToken,
        revokeLeaseUntil: new Date(now.getTime() + INTAKE_LEASE_MS),
        lastAttemptAt: now,
        updatedAt: now,
      }).where(and(
        eq(appleRevocableCredentials.id, credential.id),
        eq(appleRevocableCredentials.revokeAttemptCount, credential.revokeAttemptCount),
        eq(appleRevocableCredentials.status, credential.status),
        credential.status === 'revoke_pending'
          ? or(isNull(appleRevocableCredentials.revokeLeaseUntil), lte(appleRevocableCredentials.revokeLeaseUntil, now))
          : inArray(appleRevocableCredentials.status, ['active', 'retryable']),
      )).returning();
      if (!claimed) return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
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
        if (code === 'invalid_grant' && (
          credential.status === 'revoke_pending'
          || credential.status === 'retryable'
          || credential.revokeAttemptCount > 0
        )) {
          const [finished] = await this.database.db.update(appleRevocableCredentials).set({
            encryptedRefreshToken: null,
            status: 'manual_action_required',
            revokeAttemptCount: attemptNumber,
            revokeLeaseToken: null,
            revokeLeaseUntil: null,
            nextRetryAt: null,
            lastAttemptAt: now,
            lastErrorCode: 'invalid_grant_after_attempt',
            updatedAt: now,
          }).where(this.ownedCredentialRevoke(credential.id, attemptNumber, revokeLeaseToken))
            .returning({ status: appleRevocableCredentials.status });
          if (!finished) {
            const status = await this.credentialStatus(credential.id);
            if (status === 'revoked') continue;
            if (status !== 'manual_action_required') {
              return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
            }
          }
          manualActionRequired = true;
          continue;
        }
        const [finished] = await this.database.db.update(appleRevocableCredentials).set({
          status: 'retryable',
          revokeAttemptCount: attemptNumber,
          revokeLeaseToken: null,
          revokeLeaseUntil: null,
          nextRetryAt: new Date(now.getTime() + this.retryDelayMs(attemptNumber)),
          lastAttemptAt: now,
          lastErrorCode: code,
          updatedAt: now,
        }).where(this.ownedCredentialRevoke(credential.id, attemptNumber, revokeLeaseToken))
          .returning({ status: appleRevocableCredentials.status });
        if (!finished) {
          const status = await this.credentialStatus(credential.id);
          if (status === 'revoked') continue;
          if (status === 'manual_action_required') {
            manualActionRequired = true;
            continue;
          }
        }
        return { errorCode: code, outcome: 'retryable' as const };
      }
      const [finished] = await this.database.db.update(appleRevocableCredentials).set({
        encryptedRefreshToken: null,
        status: 'revoked',
        revokeAttemptCount: attemptNumber,
        revokeLeaseToken: null,
        revokeLeaseUntil: null,
        nextRetryAt: null,
        lastAttemptAt: now,
        lastErrorCode: null,
        revokedAt: now,
        updatedAt: now,
      }).where(this.ownedCredentialRevoke(credential.id, attemptNumber, revokeLeaseToken))
        .returning({ status: appleRevocableCredentials.status });
      if (!finished) {
        const status = await this.credentialStatus(credential.id);
        if (status === 'manual_action_required') {
          manualActionRequired = true;
          continue;
        }
        if (status !== 'revoked') return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
      }
    }
    return { outcome: manualActionRequired ? 'manual_action_required' as const : 'revoked' as const };
  }

  private appleSubject(source: VerifiedAuthSession) {
    const subjects = [...new Set(source.identities
      .filter((identity) => identity.provider === 'apple')
      .map((identity) => identity.subject))];
    if (!source.user.providers?.includes('apple') || subjects.length !== 1) {
      throw new ForbiddenException('apple_reauthentication_unavailable');
    }
    return subjects[0]!;
  }

  private ownedCredentialRevoke(id: string, attemptNumber: number, leaseToken: string) {
    return and(
      eq(appleRevocableCredentials.id, id),
      eq(appleRevocableCredentials.status, 'revoke_pending'),
      eq(appleRevocableCredentials.revokeAttemptCount, attemptNumber),
      eq(appleRevocableCredentials.revokeLeaseToken, leaseToken),
    );
  }

  private async credentialStatus(id: string) {
    const [row] = await this.database.db.select({ status: appleRevocableCredentials.status })
      .from(appleRevocableCredentials).where(eq(appleRevocableCredentials.id, id)).limit(1);
    return row?.status;
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
    ) throw new ForbiddenException('invalid_apple_authorization');
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
