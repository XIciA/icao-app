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
const EXCHANGE_CLAIM_LEASE_MS = 2 * 60 * 1_000;
const VALIDATION_CLAIM_LEASE_MS = 2 * 60 * 1_000;

type AppleAuthTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

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
    const currentDigest = this.digests.current('apple-revocable-credential-v1', 'apple', subject);
    const candidateDigests = this.digests
      .candidates('apple-revocable-credential-v1', 'apple', subject)
      .map(({ digest }) => digest);
    const intakeId = randomUUID();
    const exchangeClaimToken = randomUUID();
    try {
      await this.createExchangeClaim({
        accountId: source.user.id,
        authUserId: source.authUserId,
        candidateDigests,
        digestKeyVersion: currentDigest.version,
        exchangeClaimToken,
        intakeId,
        now,
        subjectDigest: currentDigest.digest,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException('apple_credential_persistence_failed');
    }

    let response;
    try {
      response = await this.http.exchangeAuthorizationCode({
        authorizationCode: input.authorizationCode,
        clientId: apple.clientId,
        clientSecret: this.clientSecret(apple, now),
      });
    } catch (error) {
      const code = this.httpErrorCode(error);
      const exchangeDefinitelyRejected = ['invalid_grant', 'invalid_client', 'rate_limited', 'server_error']
        .includes(code);
      await this.finishExchangeClaim(
        source.user.id,
        intakeId,
        exchangeClaimToken,
        exchangeDefinitelyRejected ? 'revoked' : 'manual_action_required',
        `exchange_${code}`,
        now,
      );
      if (code === 'invalid_grant') {
        throw new ForbiddenException('invalid_apple_authorization');
      }
      throw new ServiceUnavailableException('apple_auth_unavailable');
    }

    const encryptedRefreshToken = this.encrypt(
      response.refreshToken,
      apple.encryptionKey,
      this.encryptionContext(source.user.id, source.authUserId, currentDigest.digest),
    );
    try {
      await this.persistExchangeResult(
        source.user.id,
        intakeId,
        exchangeClaimToken,
        encryptedRefreshToken,
        new Date(),
      );
    } catch {
      throw new ServiceUnavailableException('apple_credential_persistence_failed');
    }

    let validatedAt: Date;
    try {
      const claims = await this.idTokenVerifier.verify(response.idToken, apple.clientId);
      validatedAt = new Date();
      this.validateClaims(claims, subject, input.rawNonce, validatedAt, apple.clientId);
    } catch {
      await this.compensateIntake(intakeId, new Date(), exchangeClaimToken).catch(() => undefined);
      throw new ForbiddenException('invalid_apple_authorization');
    }
    try {
      await this.finishValidationClaim(
        source.user.id,
        intakeId,
        exchangeClaimToken,
        validatedAt,
      );
    } catch (error) {
      await this.compensateIntake(intakeId, new Date(), exchangeClaimToken).catch(() => undefined);
      if (error instanceof ForbiddenException) throw error;
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

  private async createExchangeClaim(input: {
    accountId: string;
    authUserId: string;
    candidateDigests: string[];
    digestKeyVersion: number;
    exchangeClaimToken: string;
    intakeId: string;
    now: Date;
    subjectDigest: string;
  }) {
    await this.database.db.transaction(async (transaction) => {
      const account = await this.lockAccountFence(transaction, input.accountId);
      if (account.status !== 'active') throw new ForbiddenException('account_not_active');
      await transaction.insert(appleCredentialIntakes).values({
        id: input.intakeId,
        accountId: input.accountId,
        authUserId: input.authUserId,
        subjectDigest: input.subjectDigest,
        subjectDigestAliases: input.candidateDigests,
        digestKeyVersion: input.digestKeyVersion,
        encryptedRefreshToken: null,
        status: 'pending_exchange',
        leaseToken: input.exchangeClaimToken,
        leaseUntil: new Date(input.now.getTime() + EXCHANGE_CLAIM_LEASE_MS),
        retentionAt: new Date(input.now.getTime() + INTAKE_RETENTION_MS),
        createdAt: input.now,
        updatedAt: input.now,
      });
    });
  }

  private async persistExchangeResult(
    accountId: string,
    intakeId: string,
    exchangeClaimToken: string,
    encryptedRefreshToken: string,
    now: Date,
  ) {
    await this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, accountId);
      const [intake] = await transaction.select({ id: appleCredentialIntakes.id })
        .from(appleCredentialIntakes)
        .where(and(
          eq(appleCredentialIntakes.id, intakeId),
          eq(appleCredentialIntakes.accountId, accountId),
          eq(appleCredentialIntakes.status, 'pending_exchange'),
          eq(appleCredentialIntakes.leaseToken, exchangeClaimToken),
        ))
        .limit(1)
        .for('update');
      if (!intake) throw new Error('apple_exchange_claim_lost');
      const [persisted] = await transaction.update(appleCredentialIntakes).set({
        encryptedRefreshToken,
        status: 'pending_validation',
        leaseUntil: new Date(now.getTime() + VALIDATION_CLAIM_LEASE_MS),
        lastErrorCode: null,
        updatedAt: now,
      }).where(eq(appleCredentialIntakes.id, intake.id)).returning({ id: appleCredentialIntakes.id });
      if (!persisted) throw new Error('apple_exchange_claim_lost');
    });
  }

  private async finishExchangeClaim(
    accountId: string,
    intakeId: string,
    exchangeClaimToken: string,
    status: 'revoked' | 'manual_action_required',
    errorCode: string,
    now: Date,
  ) {
    await this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, accountId);
      const [finished] = await transaction.update(appleCredentialIntakes).set({
        status,
        leaseToken: null,
        leaseUntil: null,
        lastAttemptAt: now,
        lastErrorCode: errorCode,
        revokedAt: status === 'revoked' ? now : null,
        updatedAt: now,
      }).where(and(
        eq(appleCredentialIntakes.id, intakeId),
        eq(appleCredentialIntakes.accountId, accountId),
        eq(appleCredentialIntakes.status, 'pending_exchange'),
        eq(appleCredentialIntakes.leaseToken, exchangeClaimToken),
      )).returning({ id: appleCredentialIntakes.id });
      if (!finished) throw new Error('apple_exchange_claim_lost');
    });
  }

  private async finishValidationClaim(
    accountId: string,
    intakeId: string,
    validationClaimToken: string,
    now: Date,
  ) {
    await this.database.db.transaction(async (transaction) => {
      const account = await this.lockAccountFence(transaction, accountId);
      if (account.status !== 'active') throw new ForbiddenException('account_not_active');
      const [claim] = await transaction.select({
        leaseToken: appleCredentialIntakes.leaseToken,
        leaseUntil: appleCredentialIntakes.leaseUntil,
        status: appleCredentialIntakes.status,
      }).from(appleCredentialIntakes).where(and(
        eq(appleCredentialIntakes.id, intakeId),
        eq(appleCredentialIntakes.accountId, accountId),
      )).limit(1).for('update');
      if (
        claim?.status !== 'pending_validation'
        || claim.leaseToken !== validationClaimToken
        || !claim.leaseUntil
        || claim.leaseUntil <= now
      ) throw new Error('apple_validation_claim_lost');
      const [validated] = await transaction.update(appleCredentialIntakes).set({
        status: 'pending_binding',
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
        updatedAt: now,
      }).where(and(
        eq(appleCredentialIntakes.id, intakeId),
        eq(appleCredentialIntakes.accountId, accountId),
        eq(appleCredentialIntakes.status, 'pending_validation'),
        eq(appleCredentialIntakes.leaseToken, validationClaimToken),
      )).returning({ id: appleCredentialIntakes.id });
      if (!validated) throw new Error('apple_validation_claim_lost');
    });
  }

  async retryDueIntakes(now = new Date()) {
    await this.database.db.delete(appleCredentialIntakes).where(and(
      inArray(appleCredentialIntakes.status, ['revoked', 'manual_action_required']),
      lte(appleCredentialIntakes.retentionAt, now),
    ));
    const rows = await this.database.db.select({ id: appleCredentialIntakes.id })
      .from(appleCredentialIntakes)
      .where(or(
        and(
          eq(appleCredentialIntakes.status, 'pending_exchange'),
          lte(appleCredentialIntakes.leaseUntil, now),
        ),
        and(
          eq(appleCredentialIntakes.status, 'pending_validation'),
          lte(appleCredentialIntakes.leaseUntil, now),
        ),
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
      if (intake.status === 'pending_exchange') {
        await this.expireExchangeClaim(row.id, now);
        continue;
      }
      if (intake.status === 'pending_validation') {
        await this.compensateIntake(row.id, now);
        continue;
      }
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

  private async expireExchangeClaim(intakeId: string, now: Date) {
    const [owner] = await this.database.db.select({ accountId: appleCredentialIntakes.accountId })
      .from(appleCredentialIntakes).where(eq(appleCredentialIntakes.id, intakeId)).limit(1);
    if (!owner) return;
    await this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, owner.accountId);
      const [expired] = await transaction.update(appleCredentialIntakes).set({
        status: 'manual_action_required',
        leaseToken: null,
        leaseUntil: null,
        lastAttemptAt: now,
        lastErrorCode: 'exchange_claim_expired',
        updatedAt: now,
      }).where(and(
        eq(appleCredentialIntakes.id, intakeId),
        eq(appleCredentialIntakes.accountId, owner.accountId),
        eq(appleCredentialIntakes.status, 'pending_exchange'),
        lte(appleCredentialIntakes.leaseUntil, now),
      )).returning({ subjectDigest: appleCredentialIntakes.subjectDigest });
      if (!expired) return;
      await transaction.insert(accountSecurityEvents).values({
        accountDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
          .update(`account-security-event-v1\0${owner.accountId}`)
          .digest('hex'),
        subjectDigest: expired.subjectDigest,
        createdAt: now,
        eventType: 'apple_exchange_claim_expired',
        outcome: 'failed',
        metadata: { errorCode: 'exchange_claim_expired', manualActionRequired: true },
        retentionAt: new Date(now.getTime() + INTAKE_RETENTION_MS),
      });
    });
  }

  private async bindIntake(intakeId: string, now: Date) {
    const [owner] = await this.database.db.select({
      accountId: appleCredentialIntakes.accountId,
      subjectDigest: appleCredentialIntakes.subjectDigest,
      subjectDigestAliases: appleCredentialIntakes.subjectDigestAliases,
    }).from(appleCredentialIntakes).where(eq(appleCredentialIntakes.id, intakeId)).limit(1);
    if (!owner) return 'missing' as const;
    const ownerAliases = Array.isArray(owner.subjectDigestAliases)
      ? owner.subjectDigestAliases.filter((digest): digest is string => typeof digest === 'string')
      : [];
    const ownerCandidateDigests = [...new Set([owner.subjectDigest, ...ownerAliases])];
    return this.database.db.transaction(async (transaction) => {
      const account = await this.lockAccountFence(transaction, owner.accountId);
      for (const digest of [...ownerCandidateDigests].sort()) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-credential:${digest}`}, 0))`);
      }
      const [intake] = await transaction.select().from(appleCredentialIntakes)
        .where(and(
          eq(appleCredentialIntakes.id, intakeId),
          eq(appleCredentialIntakes.accountId, owner.accountId),
        )).limit(1).for('update');
      if (!intake) return 'missing' as const;
      if (intake.status !== 'pending_binding' || !intake.encryptedRefreshToken) {
        throw new Error('apple_credential_intake_not_bindable');
      }
      const aliases = Array.isArray(intake.subjectDigestAliases)
        ? intake.subjectDigestAliases.filter((digest): digest is string => typeof digest === 'string')
        : [];
      const candidateDigests = [...new Set([intake.subjectDigest, ...aliases])];
      if (account.status !== 'active') throw new ForbiddenException('account_not_active');
      const [existing] = await transaction.select({
        accountId: appleRevocableCredentials.accountId,
        id: appleRevocableCredentials.id,
        status: appleRevocableCredentials.status,
      }).from(appleRevocableCredentials)
        .where(or(
          inArray(appleRevocableCredentials.subjectDigest, candidateDigests),
          eq(appleRevocableCredentials.authUserId, intake.authUserId),
        )).limit(1).for('update');
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

  private async compensateIntake(intakeId: string, now: Date, validationClaimToken?: string) {
    const [owner] = await this.database.db.select({ accountId: appleCredentialIntakes.accountId })
      .from(appleCredentialIntakes).where(eq(appleCredentialIntakes.id, intakeId)).limit(1);
    if (!owner) return;
    const leaseToken = randomUUID();
    const claimed = await this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, owner.accountId);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-intake:${intakeId}`}, 0))`);
      const [intake] = await transaction.select().from(appleCredentialIntakes)
        .where(and(
          eq(appleCredentialIntakes.id, intakeId),
          eq(appleCredentialIntakes.accountId, owner.accountId),
        )).limit(1).for('update');
      if (!intake || ['revoked', 'manual_action_required'].includes(intake.status)) return undefined;
      if (intake.status === 'pending_exchange') return undefined;
      const ownsValidationClaim = intake.status === 'pending_validation'
        && intake.leaseToken === validationClaimToken;
      if (intake.leaseToken && intake.leaseUntil && intake.leaseUntil > now && !ownsValidationClaim) {
        return undefined;
      }
      const [updated] = await transaction.update(appleCredentialIntakes).set({
        status: 'revoke_pending',
        attemptCount: intake.attemptCount + 1,
        leaseToken,
        leaseUntil: new Date(now.getTime() + INTAKE_LEASE_MS),
        lastAttemptAt: now,
        nextRetryAt: null,
        updatedAt: now,
      }).where(eq(appleCredentialIntakes.id, intake.id)).returning();
      return updated ? {
        intake: updated,
        conservative: intake.status !== 'pending_binding' || intake.attemptCount > 0,
      } : undefined;
    });
    if (!claimed) return;
    const { intake, conservative } = claimed;
    if (!intake.encryptedRefreshToken) {
      await this.finishIntake(intake.accountId, intake.id, leaseToken, {
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
        await this.finishIntake(intake.accountId, intake.id, leaseToken, {
          encryptedRefreshToken: null,
          status: 'manual_action_required',
          lastErrorCode: 'invalid_grant_after_attempt',
        }, now);
        return;
      }
      await this.finishIntake(intake.accountId, intake.id, leaseToken, {
        status: 'retryable',
        lastErrorCode: code,
        nextRetryAt: new Date(now.getTime() + this.retryDelayMs(intake.attemptCount)),
      }, now);
      return;
    }
    await this.finishIntake(intake.accountId, intake.id, leaseToken, {
      encryptedRefreshToken: null,
      status: 'revoked',
      lastErrorCode: null,
      revokedAt: now,
    }, now);
  }

  private async finishIntake(
    accountId: string,
    intakeId: string,
    leaseToken: string,
    values: Partial<typeof appleCredentialIntakes.$inferInsert>,
    now: Date,
  ) {
    await this.database.db.transaction(async (transaction) => {
      const account = await this.lockAccountFence(transaction, accountId);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-intake:${intakeId}`}, 0))`);
      const [finished] = await transaction.update(appleCredentialIntakes).set({
        ...values,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: now,
      }).where(and(
        eq(appleCredentialIntakes.id, intakeId),
        eq(appleCredentialIntakes.accountId, accountId),
        eq(appleCredentialIntakes.leaseToken, leaseToken),
        eq(appleCredentialIntakes.status, 'revoke_pending'),
      )).returning({ status: appleCredentialIntakes.status });
      if (finished) return;
      const [current] = await transaction.select({ status: appleCredentialIntakes.status })
        .from(appleCredentialIntakes)
        .where(and(
          eq(appleCredentialIntakes.id, intakeId),
          eq(appleCredentialIntakes.accountId, accountId),
        ))
        .limit(1)
        .for('update');
      if (current && ['revoked', 'manual_action_required'].includes(current.status)) return;
      if (!current && account.status === 'deleted') return;
      throw new Error('apple_credential_intake_finish_lost');
    });
  }

  async revokeForAccount(accountId: string, now = new Date()) {
    const initial = await this.providerRowsUnderFence(accountId);
    const intakes = initial.intakes;
    for (const intake of intakes) {
      if (!['revoked', 'manual_action_required'].includes(intake.status)) {
        await this.compensateIntake(intake.id, now);
      }
    }
    const afterIntakes = await this.providerRowsUnderFence(accountId);
    const unresolvedIntake = afterIntakes.intakes.find(({ status }) => (
      !['revoked', 'manual_action_required'].includes(status)
    ));
    if (unresolvedIntake) {
      return {
        errorCode: unresolvedIntake.status === 'pending_exchange'
          ? 'exchange_in_progress'
          : unresolvedIntake.status === 'pending_validation'
            ? 'validation_in_progress'
          : unresolvedIntake.lastErrorCode ?? 'unavailable',
        outcome: 'retryable' as const,
      };
    }
    for (const credential of afterIntakes.credentials) {
      const result = await this.revokeCredential(credential.id, now);
      if (result.outcome === 'retryable') return result;
    }
    const terminal = await this.providerRowsUnderFence(accountId);
    const unresolvedCredential = terminal.credentials.find(({ status }) => (
      !['revoked', 'manual_action_required'].includes(status)
    ));
    const terminalUnresolvedIntake = terminal.intakes.find(({ status }) => (
      !['revoked', 'manual_action_required'].includes(status)
    ));
    if (unresolvedCredential || terminalUnresolvedIntake) {
      return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
    }
    const manualActionRequired = [...terminal.intakes, ...terminal.credentials]
      .some(({ status }) => status === 'manual_action_required');
    if (terminal.intakes.length === 0 && terminal.credentials.length === 0) {
      return { outcome: 'manual_action_required' as const };
    }
    return { outcome: manualActionRequired ? 'manual_action_required' as const : 'revoked' as const };
  }

  private async revokeCredential(credentialId: string, now: Date) {
    const [owner] = await this.database.db.select({
      accountId: appleRevocableCredentials.accountId,
      subjectDigest: appleRevocableCredentials.subjectDigest,
    }).from(appleRevocableCredentials).where(eq(appleRevocableCredentials.id, credentialId)).limit(1);
    if (!owner) return { outcome: 'revoked' as const };
    const revokeLeaseToken = randomUUID();
    const claimed = await this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, owner.accountId);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-credential:${owner.subjectDigest}`}, 0))`);
      const [credential] = await transaction.select().from(appleRevocableCredentials)
        .where(and(
          eq(appleRevocableCredentials.id, credentialId),
          eq(appleRevocableCredentials.accountId, owner.accountId),
        )).limit(1).for('update');
      if (!credential || credential.status === 'revoked') return { outcome: 'revoked' as const };
      if (credential.status === 'manual_action_required') return { outcome: 'manual_action_required' as const };
      if (!credential.encryptedRefreshToken) {
        await transaction.update(appleRevocableCredentials).set({
          status: 'manual_action_required',
          nextRetryAt: null,
          lastErrorCode: 'credential_unavailable',
          updatedAt: now,
        }).where(eq(appleRevocableCredentials.id, credential.id));
        return { outcome: 'manual_action_required' as const };
      }
      if (credential.revokeLeaseUntil && credential.revokeLeaseUntil > now) {
        return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
      }
      const attemptNumber = credential.revokeAttemptCount + 1;
      const [updated] = await transaction.update(appleRevocableCredentials).set({
        status: 'revoke_pending',
        revokeAttemptCount: attemptNumber,
        revokeLeaseToken,
        revokeLeaseUntil: new Date(now.getTime() + INTAKE_LEASE_MS),
        lastAttemptAt: now,
        updatedAt: now,
      }).where(eq(appleRevocableCredentials.id, credential.id)).returning();
      if (!updated) return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
      return {
        attemptNumber,
        conservative: credential.status === 'revoke_pending'
          || credential.status === 'retryable'
          || credential.revokeAttemptCount > 0,
        credential: updated,
        outcome: 'claimed' as const,
      };
    });
    if (claimed.outcome !== 'claimed') return claimed;

    const apple = this.requireConfiguration();
    try {
      await this.http.revoke({
        clientId: apple.clientId,
        clientSecret: this.clientSecret(apple, now),
        refreshToken: this.decrypt(
          claimed.credential.encryptedRefreshToken!,
          apple.encryptionKey,
          this.encryptionContext(
            claimed.credential.accountId,
            claimed.credential.authUserId,
            claimed.credential.subjectDigest,
          ),
        ),
      });
    } catch (error) {
      const code = this.httpErrorCode(error);
      if (code === 'invalid_grant' && claimed.conservative) {
        const status = await this.finishCredentialRevoke(
          claimed.credential,
          claimed.attemptNumber,
          revokeLeaseToken,
          {
            encryptedRefreshToken: null,
            status: 'manual_action_required',
            nextRetryAt: null,
            lastErrorCode: 'invalid_grant_after_attempt',
          },
          now,
        );
        return status === 'revoked'
          ? { outcome: 'revoked' as const }
          : { outcome: 'manual_action_required' as const };
      }
      const status = await this.finishCredentialRevoke(
        claimed.credential,
        claimed.attemptNumber,
        revokeLeaseToken,
        {
          status: 'retryable',
          nextRetryAt: new Date(now.getTime() + this.retryDelayMs(claimed.attemptNumber)),
          lastErrorCode: code,
        },
        now,
      );
      if (status === 'revoked') return { outcome: 'revoked' as const };
      if (status === 'manual_action_required') return { outcome: 'manual_action_required' as const };
      return { errorCode: code, outcome: 'retryable' as const };
    }
    const status = await this.finishCredentialRevoke(
      claimed.credential,
      claimed.attemptNumber,
      revokeLeaseToken,
      {
        encryptedRefreshToken: null,
        status: 'revoked',
        nextRetryAt: null,
        lastErrorCode: null,
        revokedAt: now,
      },
      now,
    );
    if (status === 'manual_action_required') return { outcome: 'manual_action_required' as const };
    if (status !== 'revoked') return { errorCode: 'unavailable' as const, outcome: 'retryable' as const };
    return { outcome: 'revoked' as const };
  }

  private async finishCredentialRevoke(
    credential: typeof appleRevocableCredentials.$inferSelect,
    attemptNumber: number,
    revokeLeaseToken: string,
    values: Partial<typeof appleRevocableCredentials.$inferInsert>,
    now: Date,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const account = await this.lockAccountFence(transaction, credential.accountId);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`apple-credential:${credential.subjectDigest}`}, 0))`);
      const [finished] = await transaction.update(appleRevocableCredentials).set({
        ...values,
        revokeAttemptCount: attemptNumber,
        revokeLeaseToken: null,
        revokeLeaseUntil: null,
        lastAttemptAt: now,
        updatedAt: now,
      }).where(this.ownedCredentialRevoke(credential.id, attemptNumber, revokeLeaseToken))
        .returning({ status: appleRevocableCredentials.status });
      if (finished) return finished.status;
      const [current] = await transaction.select({ status: appleRevocableCredentials.status })
        .from(appleRevocableCredentials)
        .where(and(
          eq(appleRevocableCredentials.id, credential.id),
          eq(appleRevocableCredentials.accountId, credential.accountId),
        )).limit(1).for('update');
      if (current) return current.status;
      if (account.status === 'deleted') return 'revoked';
      throw new Error('apple_credential_finish_lost');
    });
  }

  private async providerRowsUnderFence(accountId: string) {
    return this.database.db.transaction(async (transaction) => {
      await this.lockAccountFence(transaction, accountId);
      const intakes = await transaction.select().from(appleCredentialIntakes)
        .where(eq(appleCredentialIntakes.accountId, accountId)).for('update');
      const credentials = await transaction.select().from(appleRevocableCredentials)
        .where(eq(appleRevocableCredentials.accountId, accountId)).for('update');
      return { credentials, intakes };
    });
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

  private async lockAccountFence(transaction: AppleAuthTransaction, accountId: string) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))`);
    const [account] = await transaction.select({ status: accounts.status }).from(accounts)
      .where(eq(accounts.id, accountId)).limit(1).for('update');
    if (!account) throw new Error('apple_credential_account_not_found');
    return account;
  }

  private ownedCredentialRevoke(id: string, attemptNumber: number, leaseToken: string) {
    return and(
      eq(appleRevocableCredentials.id, id),
      eq(appleRevocableCredentials.status, 'revoke_pending'),
      eq(appleRevocableCredentials.revokeAttemptCount, attemptNumber),
      eq(appleRevocableCredentials.revokeLeaseToken, leaseToken),
    );
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
