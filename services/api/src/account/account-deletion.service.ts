import { createHmac, randomUUID } from 'node:crypto';

import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DeleteAccountRequest, DeleteAccountResponse } from '@icao/contracts';
import { and, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';

import { AppleAuthService } from '../auth/apple-auth.service';
import type { VerifiedAuthSession } from '../auth/auth.types';
import { RecentAuthService } from '../auth/recent-auth.service';
import { PersistentCommerceBenefitsService } from '../commerce/persistent-commerce-benefits.service';
import { API_CONFIG, type ApiConfig } from '../config';
import {
  accountContentCredentialRevocations,
  accountDeletionAuthUsers,
  accountDeletionJobs,
  accountDeletionStatusRateLimits,
  accountDeletionTombstones,
  accountIdentities,
  accountSecurityEvents,
  accounts,
  aiAllowanceAccounts,
  aiConsents,
  aiQuotaBuckets,
  aiUsageLogs,
  productClickEvents,
  aiWordCache,
  appleCredentialIntakes,
  appleRevocableCredentials,
  feedbackAttachments,
  feedbackTickets,
  inviteAccounts,
  learningRecords,
  privacyActionReceipts,
  profiles,
  recentAuthChallenges,
  recentAuthGrants,
  syncChanges,
  syncMutations,
  userCardStates,
  userDocuments,
  wechatAuthPrincipals,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { FeedbackService } from '../feedback/feedback.service';
import { ACCOUNT_AUTH_ADMIN, type AccountAuthAdmin } from './account-auth-admin';

const DELETION_LEASE_MS = 5 * 60 * 1_000;
const RETRY_INTERVAL_MS = 60_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1_000;
const DELETION_RECORD_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1_000;
const SECURITY_EVENT_RETENTION_MS = 183 * 24 * 60 * 60 * 1_000;

class AppleCredentialStateUnresolvedError extends Error {}

@Injectable()
export class AccountDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionService.name);
  private retryTimer?: NodeJS.Timeout;
  private retentionTimer?: NodeJS.Timeout;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(ACCOUNT_AUTH_ADMIN) private readonly authAdmin: AccountAuthAdmin,
    private readonly appleAuth: AppleAuthService,
    private readonly commerce: PersistentCommerceBenefitsService,
    private readonly database: DatabaseService,
    private readonly feedback: FeedbackService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  onModuleInit() {
    this.retryTimer = setInterval(() => {
      void this.retryDueJobs().catch(() => this.logger.error('account_deletion_retry_worker_failed'));
    }, RETRY_INTERVAL_MS);
    this.retryTimer.unref();
    void this.retryDueJobs().catch(() => this.logger.error('account_deletion_retry_worker_failed'));
    this.retentionTimer = setInterval(() => {
      void this.purgeExpiredRecords().catch(() => this.logger.error('account_security_retention_cleanup_failed'));
    }, RETENTION_INTERVAL_MS);
    this.retentionTimer.unref();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  async requestDeletion(source: VerifiedAuthSession, input: DeleteAccountRequest) {
    const requestedAt = new Date();
    let intent;
    try {
      intent = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${source.user.id}`}, 0))`);
      const [existingForAccount] = await transaction.select().from(accountDeletionJobs)
        .where(eq(accountDeletionJobs.accountId, source.user.id)).limit(1);
      if (existingForAccount) {
        if (existingForAccount.idempotencyKey !== input.idempotencyKey) {
          throw new ConflictException('account_deletion_idempotency_conflict');
        }
        return existingForAccount;
      }
      const [idempotencyCollision] = await transaction.select({ id: accountDeletionJobs.id })
        .from(accountDeletionJobs)
        .where(eq(accountDeletionJobs.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (idempotencyCollision) throw new ConflictException('account_deletion_idempotency_conflict');

      const [account] = await transaction.update(accounts).set({
        sessionsRevokedAt: requestedAt,
        status: 'deleting',
        updatedAt: requestedAt,
      }).where(and(
        eq(accounts.id, source.user.id),
        eq(accounts.status, 'active'),
      )).returning({ id: accounts.id });
      if (!account) throw new Error('account_deletion_not_available');
      await this.recentAuth.consumeInTransaction(
        transaction,
        source,
        input.grantId,
        'account_delete',
        requestedAt,
      );

      const authUsers = await transaction.selectDistinct({ authUserId: accountIdentities.authUserId })
        .from(accountIdentities).where(eq(accountIdentities.accountId, source.user.id));
      const objectRows = await transaction.select({ objectKey: feedbackAttachments.objectKey })
        .from(feedbackAttachments)
        .innerJoin(feedbackTickets, eq(feedbackTickets.id, feedbackAttachments.ticketId))
        .where(eq(feedbackTickets.userId, source.user.id));
      const objectKeys = [...new Set(objectRows.map(({ objectKey }) => objectKey))];
      const [job] = await transaction.insert(accountDeletionJobs).values({
        accountId: source.user.id,
        requestedByAuthUserId: source.authUserId,
        idempotencyKey: input.idempotencyKey,
        status: 'pending',
        identityProviderOutcome: 'pending',
        objectCleanupStatus: objectKeys.length === 0 ? 'not_applicable' : 'pending',
        objectKeys,
        requestedAt,
        updatedAt: requestedAt,
      }).returning();
      if (!job) throw new Error('account_deletion_intent_not_created');
      if (authUsers.length > 0) {
        await transaction.insert(accountDeletionAuthUsers).values(authUsers.map(({ authUserId }) => ({
          authUserId,
          jobId: job.id,
        })));
      }
      await transaction.insert(accountDeletionTombstones).values({
        accountId: source.user.id,
        createdAt: requestedAt,
        jobId: job.id,
        legalRetentionUntil: new Date(requestedAt.getTime() + DELETION_RECORD_RETENTION_MS),
        updatedAt: requestedAt,
      });
      await transaction.insert(accountContentCredentialRevocations).values({
        accountId: source.user.id,
        deletionJobId: job.id,
        revokedBefore: requestedAt,
      });
      for (const { authUserId } of authUsers) {
        await transaction.execute(sql`
          insert into account_session_revocations (session_id, user_id, revoked_at)
          select id, user_id, ${requestedAt.toISOString()}::timestamptz
          from auth.sessions where user_id = ${authUserId}::uuid
          on conflict (session_id) do update set revoked_at = excluded.revoked_at
        `);
      }
      await transaction.insert(accountSecurityEvents).values({
        accountDigest: this.accountDigest(source.user.id),
        createdAt: requestedAt,
        eventType: 'account_deletion_requested',
        outcome: 'pending',
        metadata: { deletionJobId: job.id },
        retentionAt: new Date(requestedAt.getTime() + SECURITY_EVENT_RETENTION_MS),
      });
      return job;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('account_deletion_idempotency_conflict');
      throw error;
    }
    return this.processJob(intent.id);
  }

  async statusByIdempotencyKey(idempotencyKey: string, sourceIp = 'unknown', now = new Date()) {
    await this.assertStatusRateLimit(idempotencyKey, sourceIp, now);
    const [job] = await this.database.db.select().from(accountDeletionJobs)
      .where(eq(accountDeletionJobs.idempotencyKey, idempotencyKey)).limit(1);
    if (!job) throw new NotFoundException('account_deletion_job_not_found');
    if (
      job.status !== 'completed'
      && (!job.nextRetryAt || job.nextRetryAt <= now)
    ) return this.processJob(job.id, now);
    return this.responseFor(job);
  }

  async retryDueJobs(now = new Date()) {
    const jobs = await this.database.db.select({ id: accountDeletionJobs.id })
      .from(accountDeletionJobs)
      .where(and(
        ne(accountDeletionJobs.status, 'completed'),
        or(isNull(accountDeletionJobs.nextRetryAt), lte(accountDeletionJobs.nextRetryAt, now)),
      ))
      .limit(25);
    await Promise.all(jobs.map(({ id }) => this.processJob(id, now)));
  }

  async processJob(jobId: string, now = new Date()): Promise<DeleteAccountResponse> {
    const leaseToken = randomUUID();
    const [leased] = await this.database.db.update(accountDeletionJobs).set({
      leaseToken,
      status: 'processing',
      attemptCount: sql`${accountDeletionJobs.attemptCount} + 1`,
      nextRetryAt: new Date(now.getTime() + DELETION_LEASE_MS),
      startedAt: now,
      updatedAt: now,
    }).where(and(
      eq(accountDeletionJobs.id, jobId),
      ne(accountDeletionJobs.status, 'completed'),
      or(
        eq(accountDeletionJobs.status, 'pending'),
        and(eq(accountDeletionJobs.status, 'retryable'), or(
          isNull(accountDeletionJobs.nextRetryAt),
          lte(accountDeletionJobs.nextRetryAt, now),
        )),
        and(eq(accountDeletionJobs.status, 'processing'), lte(accountDeletionJobs.nextRetryAt, now)),
      ),
    )).returning();
    if (!leased) return this.responseFor(await this.requireJob(jobId));

    let job = leased;
    if (!job.identityProvidersRevokedAt) {
      const providers = await this.database.db.selectDistinct({ provider: accountIdentities.provider })
        .from(accountIdentities).where(eq(accountIdentities.accountId, job.accountId));
      const [intakeState] = await this.database.db.select({ id: appleCredentialIntakes.id })
        .from(appleCredentialIntakes).where(eq(appleCredentialIntakes.accountId, job.accountId)).limit(1);
      const [credentialState] = await this.database.db.select({ id: appleRevocableCredentials.id })
        .from(appleRevocableCredentials).where(eq(appleRevocableCredentials.accountId, job.accountId)).limit(1);
      if (providers.some(({ provider }) => provider === 'apple') || intakeState || credentialState) {
        let result;
        try {
          result = await this.appleAuth.revokeForAccount(job.accountId, now);
        } catch {
          return this.markRetryable(job, leaseToken, 'apple_auth_unavailable', now);
        }
        if (result.outcome === 'retryable') {
          return this.markRetryable(job, leaseToken, `apple_revoke_${result.errorCode}`, now);
        }
        const rows = await this.database.db.update(accountDeletionJobs).set({
          identityProviderOutcome: result.outcome,
          identityProvidersRevokedAt: now,
          updatedAt: now,
        }).where(this.ownedLease(job.id, leaseToken)).returning();
        if (!rows[0]) return this.responseFor(await this.requireJob(jobId));
        job = rows[0];
      } else {
        const rows = await this.database.db.update(accountDeletionJobs).set({
          identityProviderOutcome: 'not_applicable',
          identityProvidersRevokedAt: now,
          updatedAt: now,
        }).where(this.ownedLease(job.id, leaseToken)).returning();
        if (!rows[0]) return this.responseFor(await this.requireJob(jobId));
        job = rows[0];
      }
    }

    if (!job.authUsersDeletedAt) {
      const authUsers = await this.database.db.select().from(accountDeletionAuthUsers)
        .where(and(
          eq(accountDeletionAuthUsers.jobId, job.id),
          ne(accountDeletionAuthUsers.status, 'deleted'),
        ));
      for (const authUser of authUsers) {
        try {
          await this.authAdmin.deleteUser(authUser.authUserId);
        } catch {
          if (!await this.ownsLease(job.id, leaseToken)) return this.responseFor(await this.requireJob(jobId));
          await this.database.db.update(accountDeletionAuthUsers).set({
            status: 'retryable',
            attemptCount: authUser.attemptCount + 1,
            lastErrorCode: 'auth_user_delete_failed',
            nextRetryAt: this.nextRetryAt(authUser.attemptCount + 1, now),
            updatedAt: now,
          }).where(and(
            eq(accountDeletionAuthUsers.jobId, job.id),
            eq(accountDeletionAuthUsers.authUserId, authUser.authUserId),
          ));
          return this.markRetryable(job, leaseToken, 'auth_user_delete_failed', now);
        }
        if (!await this.ownsLease(job.id, leaseToken)) return this.responseFor(await this.requireJob(jobId));
        await this.database.db.update(accountDeletionAuthUsers).set({
          status: 'deleted',
          attemptCount: authUser.attemptCount + 1,
          deletedAt: now,
          lastErrorCode: null,
          nextRetryAt: null,
          updatedAt: now,
        }).where(and(
          eq(accountDeletionAuthUsers.jobId, job.id),
          eq(accountDeletionAuthUsers.authUserId, authUser.authUserId),
        ));
      }
      const rows = await this.database.db.update(accountDeletionJobs).set({
        authUsersDeletedAt: now,
        updatedAt: now,
      }).where(this.ownedLease(job.id, leaseToken)).returning();
      if (!rows[0]) return this.responseFor(await this.requireJob(jobId));
      job = rows[0];
    }

    if (!job.objectsDeletedAt) {
      const objectKeys = Array.isArray(job.objectKeys)
        ? job.objectKeys.filter((key): key is string => typeof key === 'string')
        : [];
      if (objectKeys.length > 0) {
        try {
          await this.feedback.removeObjects(objectKeys);
        } catch {
          if (!await this.ownsLease(job.id, leaseToken)) return this.responseFor(await this.requireJob(jobId));
          await this.database.db.update(accountDeletionJobs).set({
            objectCleanupStatus: 'retryable',
            updatedAt: now,
          }).where(this.ownedLease(job.id, leaseToken));
          return this.markRetryable(job, leaseToken, 'object_cleanup_failed', now);
        }
      }
      const rows = await this.database.db.update(accountDeletionJobs).set({
        objectCleanupStatus: objectKeys.length === 0 ? 'not_applicable' : 'completed',
        objectsDeletedAt: now,
        updatedAt: now,
      }).where(this.ownedLease(job.id, leaseToken)).returning();
      if (!rows[0]) return this.responseFor(await this.requireJob(jobId));
      job = rows[0];
    }

    try {
      return await this.finalize(job, leaseToken, now);
    } catch (error) {
      if (error instanceof AppleCredentialStateUnresolvedError) {
        return this.reopenProviderStep(job, leaseToken, now);
      }
      return this.markRetryable(job, leaseToken, 'account_data_finalize_failed', now);
    }
  }

  private async finalize(job: typeof accountDeletionJobs.$inferSelect, leaseToken: string, now: Date) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${job.accountId}`}, 0))`);
      const [account] = await transaction.select({ status: accounts.status }).from(accounts)
        .where(eq(accounts.id, job.accountId)).limit(1).for('update');
      if (!account || account.status !== 'deleting') throw new Error('account_deletion_state_invalid');
      const [current] = await transaction.select().from(accountDeletionJobs)
        .where(eq(accountDeletionJobs.id, job.id)).limit(1).for('update');
      if (!current) throw new Error('account_deletion_job_not_found');
      if (current.status === 'completed') return this.responseFor(current);
      if (current.status !== 'processing' || current.leaseToken !== leaseToken) return this.responseFor(current);
      if (!current.identityProvidersRevokedAt || !current.authUsersDeletedAt || !current.objectsDeletedAt) {
        throw new Error('account_deletion_steps_incomplete');
      }
      const intakes = await transaction.select({ status: appleCredentialIntakes.status })
        .from(appleCredentialIntakes)
        .where(eq(appleCredentialIntakes.accountId, job.accountId))
        .for('update');
      const credentials = await transaction.select({ status: appleRevocableCredentials.status })
        .from(appleRevocableCredentials)
        .where(eq(appleRevocableCredentials.accountId, job.accountId))
        .for('update');
      if (
        intakes.some(({ status }) => !['revoked', 'manual_action_required'].includes(status))
        || credentials.some(({ status }) => !['revoked', 'manual_action_required'].includes(status))
      ) throw new AppleCredentialStateUnresolvedError('apple_credential_state_unresolved');

      await this.commerce.revokeAccountBenefits(transaction, {
        accountId: job.accountId,
        deletionJobId: job.id,
        revokedAt: now,
      });
      const ticketRows = await transaction.select({ id: feedbackTickets.id }).from(feedbackTickets)
        .where(eq(feedbackTickets.userId, job.accountId));
      const ticketIds = ticketRows.map(({ id }) => id);
      if (ticketIds.length > 0) {
        await transaction.delete(feedbackAttachments).where(inArray(feedbackAttachments.ticketId, ticketIds));
      }
      await transaction.delete(feedbackTickets).where(eq(feedbackTickets.userId, job.accountId));
      await transaction.delete(userCardStates).where(eq(userCardStates.userId, job.accountId));
      await transaction.delete(learningRecords).where(eq(learningRecords.userId, job.accountId));
      await transaction.delete(syncMutations).where(eq(syncMutations.userId, job.accountId));
      await transaction.delete(userDocuments).where(eq(userDocuments.userId, job.accountId));
      await transaction.delete(syncChanges).where(eq(syncChanges.userId, job.accountId));
      await transaction.delete(privacyActionReceipts).where(eq(privacyActionReceipts.accountId, job.accountId));
      await transaction.delete(aiAllowanceAccounts).where(eq(aiAllowanceAccounts.accountId, job.accountId));
      await transaction.delete(aiConsents).where(eq(aiConsents.userId, job.accountId));
      await transaction.delete(productClickEvents).where(eq(productClickEvents.accountId, job.accountId));
      await transaction.delete(aiUsageLogs).where(eq(aiUsageLogs.userId, job.accountId));
      await transaction.delete(aiQuotaBuckets).where(eq(aiQuotaBuckets.userId, job.accountId));
      await transaction.delete(aiWordCache).where(eq(aiWordCache.userId, job.accountId));
      await transaction.delete(profiles).where(eq(profiles.userId, job.accountId));
      await transaction.delete(recentAuthGrants).where(eq(recentAuthGrants.accountId, job.accountId));
      await transaction.delete(recentAuthChallenges).where(eq(recentAuthChallenges.accountId, job.accountId));
      const authUserRows = await transaction.select({ authUserId: accountDeletionAuthUsers.authUserId })
        .from(accountDeletionAuthUsers).where(eq(accountDeletionAuthUsers.jobId, job.id));
      if (authUserRows.length > 0) {
        // Keep the mapping until the account is atomically finalized as deleted:
        // login can then reject an in-progress deletion instead of registering early.
        await transaction.delete(wechatAuthPrincipals)
          .where(inArray(wechatAuthPrincipals.authUserId, authUserRows.map(({ authUserId }) => authUserId)));
        await transaction.update(inviteAccounts).set({
          status: 'deleted',
          userId: null,
          deletedAt: now,
        }).where(inArray(inviteAccounts.userId, authUserRows.map(({ authUserId }) => authUserId)));
      }
      await transaction.delete(accountIdentities).where(eq(accountIdentities.accountId, job.accountId));
      await transaction.delete(appleCredentialIntakes)
        .where(and(
          eq(appleCredentialIntakes.accountId, job.accountId),
          inArray(appleCredentialIntakes.status, ['revoked', 'manual_action_required']),
        ));
      await transaction.delete(appleRevocableCredentials)
        .where(and(
          eq(appleRevocableCredentials.accountId, job.accountId),
          inArray(appleRevocableCredentials.status, ['revoked', 'manual_action_required']),
        ));
      await transaction.update(accounts).set({ status: 'deleted', updatedAt: now })
        .where(eq(accounts.id, job.accountId));
      await transaction.update(accountDeletionTombstones).set({
        status: 'completed',
        benefitsRevokedAt: now,
        activeDataDeletedAt: now,
        completedAt: now,
        updatedAt: now,
      }).where(eq(accountDeletionTombstones.jobId, job.id));
      const [completed] = await transaction.update(accountDeletionJobs).set({
        status: 'completed',
        activeDataDeletedAt: now,
        completedAt: now,
        lastErrorCode: null,
        nextRetryAt: null,
        leaseToken: null,
        objectKeys: [],
        requestedByAuthUserId: null,
        updatedAt: now,
      }).where(this.ownedLease(job.id, leaseToken)).returning();
      if (!completed) throw new Error('account_deletion_lease_lost');
      await transaction.insert(accountSecurityEvents).values({
        accountDigest: this.accountDigest(job.accountId),
        createdAt: now,
        eventType: 'account_deletion_completed',
        outcome: 'succeeded',
        metadata: {
          deletionJobId: job.id,
          identityProviderOutcome: completed!.identityProviderOutcome,
        },
        retentionAt: new Date(now.getTime() + SECURITY_EVENT_RETENTION_MS),
      });
      await transaction.delete(accountDeletionAuthUsers).where(eq(accountDeletionAuthUsers.jobId, job.id));
      return this.responseFor(completed!);
    });
  }

  private async markRetryable(job: typeof accountDeletionJobs.$inferSelect, leaseToken: string, code: string, now: Date) {
    const [updated] = await this.database.db.update(accountDeletionJobs).set({
      status: 'retryable',
      leaseToken: null,
      lastErrorCode: code,
      nextRetryAt: this.nextRetryAt(job.attemptCount, now),
      updatedAt: now,
    }).where(this.ownedLease(job.id, leaseToken)).returning();
    return this.responseFor(updated ?? await this.requireJob(job.id));
  }

  private async reopenProviderStep(
    job: typeof accountDeletionJobs.$inferSelect,
    leaseToken: string,
    now: Date,
  ) {
    const [updated] = await this.database.db.update(accountDeletionJobs).set({
      status: 'retryable',
      leaseToken: null,
      identityProviderOutcome: 'pending',
      identityProvidersRevokedAt: null,
      lastErrorCode: 'apple_credential_state_unresolved',
      nextRetryAt: this.nextRetryAt(job.attemptCount, now),
      updatedAt: now,
    }).where(this.ownedLease(job.id, leaseToken)).returning();
    return this.responseFor(updated ?? await this.requireJob(job.id));
  }

  async purgeExpiredRecords(now = new Date()) {
    await this.database.db.delete(accountSecurityEvents).where(lte(accountSecurityEvents.retentionAt, now));
    await this.database.db.delete(accountDeletionStatusRateLimits)
      .where(lte(accountDeletionStatusRateLimits.expiresAt, now));
    const expired = await this.database.db.select({ jobId: accountDeletionTombstones.jobId })
      .from(accountDeletionTombstones)
      .where(and(
        eq(accountDeletionTombstones.status, 'completed'),
        lte(accountDeletionTombstones.legalRetentionUntil, now),
      )).limit(100);
    if (expired.length === 0) return;
    const jobIds = expired.map(({ jobId }) => jobId);
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(accountContentCredentialRevocations).set({ deletionJobId: null })
        .where(inArray(accountContentCredentialRevocations.deletionJobId, jobIds));
      await transaction.delete(accountDeletionTombstones).where(inArray(accountDeletionTombstones.jobId, jobIds));
      await transaction.delete(accountDeletionJobs).where(inArray(accountDeletionJobs.id, jobIds));
    });
  }

  private async assertStatusRateLimit(idempotencyKey: string, sourceIp: string, now: Date) {
    const windowMs = 60_000;
    const rules = [
      { limit: 60, scope: `ip:${sourceIp}` },
      { limit: 30, scope: `capability:${idempotencyKey}` },
    ].map(({ limit, scope }) => ({ limit, digest: this.securityDigest('account-deletion-status-v1', scope) }));
    await this.database.db.transaction(async (transaction) => {
      for (const rule of [...rules].sort((a, b) => a.digest.localeCompare(b.digest))) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`deletion-status:${rule.digest}`}, 0))`);
        const [current] = await transaction.select().from(accountDeletionStatusRateLimits)
          .where(eq(accountDeletionStatusRateLimits.scopeDigest, rule.digest)).limit(1);
        if (current && current.expiresAt > now && current.count >= rule.limit) {
          throw new HttpException('account_deletion_status_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
        }
        await transaction.insert(accountDeletionStatusRateLimits).values({
          scopeDigest: rule.digest,
          count: 1,
          windowStartedAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
          updatedAt: now,
        }).onConflictDoUpdate({
          target: accountDeletionStatusRateLimits.scopeDigest,
          set: {
            count: sql`case when ${accountDeletionStatusRateLimits.expiresAt} <= ${now.toISOString()}::timestamptz then 1 else ${accountDeletionStatusRateLimits.count} + 1 end`,
            windowStartedAt: sql`case when ${accountDeletionStatusRateLimits.expiresAt} <= ${now.toISOString()}::timestamptz then ${now.toISOString()}::timestamptz else ${accountDeletionStatusRateLimits.windowStartedAt} end`,
            expiresAt: sql`case when ${accountDeletionStatusRateLimits.expiresAt} <= ${now.toISOString()}::timestamptz then ${new Date(now.getTime() + windowMs).toISOString()}::timestamptz else ${accountDeletionStatusRateLimits.expiresAt} end`,
            updatedAt: now,
          },
        });
      }
    });
  }

  private ownedLease(jobId: string, leaseToken: string) {
    return and(
      eq(accountDeletionJobs.id, jobId),
      eq(accountDeletionJobs.status, 'processing'),
      eq(accountDeletionJobs.leaseToken, leaseToken),
    );
  }

  private async ownsLease(jobId: string, leaseToken: string) {
    const [owned] = await this.database.db.select({ id: accountDeletionJobs.id }).from(accountDeletionJobs)
      .where(this.ownedLease(jobId, leaseToken)).limit(1);
    return Boolean(owned);
  }

  private nextRetryAt(attempt: number, now: Date) {
    const delay = Math.min(24 * 60 * 60 * 1_000, 60_000 * (2 ** Math.min(Math.max(attempt - 1, 0), 10)));
    return new Date(now.getTime() + delay);
  }

  private async requireJob(jobId: string) {
    const [job] = await this.database.db.select().from(accountDeletionJobs)
      .where(eq(accountDeletionJobs.id, jobId)).limit(1);
    if (!job) throw new Error('account_deletion_job_not_found');
    return job;
  }

  private responseFor(job: typeof accountDeletionJobs.$inferSelect): DeleteAccountResponse {
    const status = job.status as DeleteAccountResponse['status'];
    const identityProviderOutcome = job.identityProviderOutcome as DeleteAccountResponse['identityProviderOutcome'];
    if (!['pending', 'processing', 'retryable', 'completed'].includes(status)) {
      throw new Error('account_deletion_status_invalid');
    }
    if (!['pending', 'revoked', 'manual_action_required', 'not_applicable'].includes(identityProviderOutcome)) {
      throw new Error('account_deletion_provider_outcome_invalid');
    }
    return {
      jobId: job.id,
      status,
      identityProviderOutcome,
    };
  }

  private updatedJob(rows: Array<typeof accountDeletionJobs.$inferSelect>) {
    const [job] = rows;
    if (!job) throw new Error('account_deletion_job_update_failed');
    return job;
  }

  private accountDigest(accountId: string) {
    return this.securityDigest('account-security-event-v1', accountId);
  }

  private securityDigest(context: string, value: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`${context}\0${value}`)
      .digest('hex');
  }

  private isUniqueViolation(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
      if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
      current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
    }
    return false;
  }
}
