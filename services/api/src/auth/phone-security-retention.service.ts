import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { phoneOtpIntents, smsDeliveryAttempts, smsUsageCounters } from '../database/schema';
import { DatabaseService } from '../database/database.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 500;

@Injectable()
export class PhoneSecurityRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PhoneSecurityRetentionService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.cleanup().catch(() => this.logger.error('phone_security_retention_cleanup_failed'));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async cleanup(now = new Date()) {
    const nowIso = now.toISOString();
    await this.database.db.execute(sql`
      DELETE FROM ${phoneOtpIntents}
      WHERE ${phoneOtpIntents.id} IN (
        SELECT ${phoneOtpIntents.id} FROM ${phoneOtpIntents}
        WHERE ${phoneOtpIntents.expiresAt} <= ${nowIso}::timestamptz
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      AND ${phoneOtpIntents.expiresAt} <= ${nowIso}::timestamptz
    `);
    await this.database.db.execute(sql`
      DELETE FROM ${smsDeliveryAttempts}
      WHERE ${smsDeliveryAttempts.dedupeKey} IN (
        SELECT ${smsDeliveryAttempts.dedupeKey} FROM ${smsDeliveryAttempts}
        WHERE ${smsDeliveryAttempts.expiresAt} <= ${nowIso}::timestamptz
          AND (${smsDeliveryAttempts.status} <> 'processing' OR ${smsDeliveryAttempts.leaseUntil} <= ${nowIso}::timestamptz)
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      AND ${smsDeliveryAttempts.expiresAt} <= ${nowIso}::timestamptz
      AND (${smsDeliveryAttempts.status} <> 'processing' OR ${smsDeliveryAttempts.leaseUntil} <= ${nowIso}::timestamptz)
    `);
    await this.database.db.execute(sql`
      DELETE FROM ${smsUsageCounters}
      WHERE ${smsUsageCounters.scopeKey} IN (
        SELECT ${smsUsageCounters.scopeKey} FROM ${smsUsageCounters}
        WHERE ${smsUsageCounters.expiresAt} <= ${nowIso}::timestamptz
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      AND ${smsUsageCounters.expiresAt} <= ${nowIso}::timestamptz
    `);
  }
}
