import { observeBackground } from '../performance/request-performance';
import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { appleNotificationEvents } from '../database/schema';
import type { CommerceEnvironment } from './product-catalog';
import { CommerceService } from './commerce.service';

const RETRY_INTERVAL_MS = 60_000;
const RETRY_BATCH_SIZE_PER_ENVIRONMENT = 25;
const RETRY_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 12;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

type ClaimedNotification = {
  attemptCount: number;
  id: string;
  leaseOwner: string;
  retentionAt: Date;
  signedPayload: string;
};

@Injectable()
export class AppleNotificationReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppleNotificationReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly commerce: CommerceService,
  ) {}

  onModuleInit() {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => { void observeBackground('apple_notification_retry', () => this.runScheduled(), this.logger); }, RETRY_INTERVAL_MS);
    this.timer.unref();
    void observeBackground('apple_notification_retry', () => this.runScheduled(), this.logger);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runScheduled(now = new Date()) {
    if (this.running) return { attempted: 0, expired: 0, processed: 0 };
    this.running = true;
    try {
      return await this.reconcileFailedNotifications(now);
    } catch {
      this.logger.error('apple_notification_reconciliation_cycle_failed');
      return { attempted: 0, expired: 0, processed: 0 };
    } finally {
      this.running = false;
    }
  }

  async reconcileFailedNotifications(now = new Date()) {
    let expired = await this.expireRetainedPayloads(now);
    const [production, sandbox] = await Promise.all([
      this.claimDue('production', now),
      this.claimDue('sandbox', now),
    ]);
    // Interleave environments so one slow or poisoned environment cannot
    // delay the first item in the other environment behind a full batch.
    const claimed: ClaimedNotification[] = [];
    for (let index = 0; index < Math.max(production.length, sandbox.length); index += 1) {
      const productionEvent = production[index];
      const sandboxEvent = sandbox[index];
      if (productionEvent) claimed.push(productionEvent);
      if (sandboxEvent) claimed.push(sandboxEvent);
    }

    let processed = 0;
    for (const event of claimed) {
      try {
        await this.commerce.processAppleNotification(event.signedPayload, now);
        processed += 1;
      } catch {
        if (await this.rescheduleOrExpire(event, now)) expired += 1;
      }
    }
    return { attempted: claimed.length, expired, processed };
  }

  private async claimDue(environment: CommerceEnvironment, now: Date) {
    const leaseOwner = randomUUID();
    const leaseUntil = new Date(now.getTime() + RETRY_LEASE_MS);
    return this.database.db.transaction(async (transaction) => {
      const rows = await transaction.execute(sql<{
        attempt_count: number;
        id: string;
        retention_at: Date;
        signed_payload: string;
      }>`
        with candidates as (
          select id
          from apple_notification_events
          where environment = ${environment}
            and status = 'failed'
            and signed_payload is not null
            and retention_at > ${now.toISOString()}::timestamptz
            and next_attempt_at <= ${now.toISOString()}::timestamptz
            and attempt_count < ${MAX_ATTEMPTS}
            and (lease_until is null or lease_until <= ${now.toISOString()}::timestamptz)
          order by next_attempt_at asc, received_at asc, id asc
          for update skip locked
          limit ${RETRY_BATCH_SIZE_PER_ENVIRONMENT}
        )
        update apple_notification_events event
        set attempt_count = event.attempt_count + 1,
          locked_at = ${now.toISOString()}::timestamptz,
          lease_owner = ${leaseOwner}::uuid,
          lease_until = ${leaseUntil.toISOString()}::timestamptz
        from candidates
        where event.id = candidates.id
        returning event.id, event.signed_payload, event.retention_at, event.attempt_count
      `);
      const claimedRows = rows as unknown as Array<{
        attempt_count: number;
        id: string;
        retention_at: Date;
        signed_payload: string;
      }>;
      return Array.from(claimedRows, (row): ClaimedNotification => ({
        attemptCount: row.attempt_count,
        id: row.id,
        leaseOwner,
        retentionAt: row.retention_at,
        signedPayload: row.signed_payload,
      }));
    });
  }

  private async rescheduleOrExpire(event: ClaimedNotification, now: Date) {
    const exhausted = event.attemptCount >= MAX_ATTEMPTS || event.retentionAt <= now;
    if (exhausted) {
      await this.database.db.update(appleNotificationEvents).set({
        status: 'expired',
        signedPayload: null,
        errorCode: 'apple_notification_reconciliation_exhausted',
        nextAttemptAt: null,
        lockedAt: null,
        leaseOwner: null,
        leaseUntil: null,
        retentionAt: null,
        processedAt: now,
      }).where(and(
        eq(appleNotificationEvents.id, event.id),
        eq(appleNotificationEvents.leaseOwner, event.leaseOwner),
      ));
      return true;
    }
    const backoffMs = Math.min(
      RETRY_INTERVAL_MS * (2 ** Math.max(0, event.attemptCount - 1)),
      MAX_BACKOFF_MS,
    );
    await this.database.db.update(appleNotificationEvents).set({
      errorCode: 'apple_notification_reconciliation_retry',
      nextAttemptAt: new Date(now.getTime() + backoffMs),
      lockedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      processedAt: now,
    }).where(and(
      eq(appleNotificationEvents.id, event.id),
      eq(appleNotificationEvents.leaseOwner, event.leaseOwner),
      eq(appleNotificationEvents.status, 'failed'),
    ));
    return false;
  }

  private async expireRetainedPayloads(now: Date) {
    const retainedRows = await this.database.db.update(appleNotificationEvents).set({
      status: 'expired',
      signedPayload: null,
      errorCode: 'apple_notification_reconciliation_retention_expired',
      nextAttemptAt: null,
      lockedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      retentionAt: null,
      processedAt: now,
    }).where(and(
      eq(appleNotificationEvents.status, 'failed'),
      sql`${appleNotificationEvents.retentionAt} <= ${now.toISOString()}::timestamptz`,
      or(
        isNull(appleNotificationEvents.leaseUntil),
        lte(appleNotificationEvents.leaseUntil, now),
      ),
    )).returning({ id: appleNotificationEvents.id });
    const exhaustedRows = await this.database.db.update(appleNotificationEvents).set({
      status: 'expired',
      signedPayload: null,
      errorCode: 'apple_notification_reconciliation_exhausted',
      nextAttemptAt: null,
      lockedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      retentionAt: null,
      processedAt: now,
    }).where(and(
      eq(appleNotificationEvents.status, 'failed'),
      sql`${appleNotificationEvents.attemptCount} >= ${MAX_ATTEMPTS}`,
      or(
        isNull(appleNotificationEvents.leaseUntil),
        lte(appleNotificationEvents.leaseUntil, now),
      ),
    )).returning({ id: appleNotificationEvents.id });
    return retainedRows.length + exhaustedRows.length;
  }
}
