import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, inArray, lte, ne, or } from 'drizzle-orm';

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
    const intents = await this.database.db.select({ id: phoneOtpIntents.id })
      .from(phoneOtpIntents)
      .where(lte(phoneOtpIntents.expiresAt, now))
      .limit(CLEANUP_BATCH_SIZE);
    if (intents.length > 0) {
      await this.database.db.delete(phoneOtpIntents)
        .where(inArray(phoneOtpIntents.id, intents.map(({ id }) => id)));
    }

    const deliveries = await this.database.db.select({ dedupeKey: smsDeliveryAttempts.dedupeKey })
      .from(smsDeliveryAttempts)
      .where(and(
        lte(smsDeliveryAttempts.expiresAt, now),
        or(
          ne(smsDeliveryAttempts.status, 'processing'),
          lte(smsDeliveryAttempts.leaseUntil, now),
        ),
      ))
      .limit(CLEANUP_BATCH_SIZE);
    if (deliveries.length > 0) {
      await this.database.db.delete(smsDeliveryAttempts)
        .where(inArray(smsDeliveryAttempts.dedupeKey, deliveries.map(({ dedupeKey }) => dedupeKey)));
    }

    const counters = await this.database.db.select({ scopeKey: smsUsageCounters.scopeKey })
      .from(smsUsageCounters)
      .where(lte(smsUsageCounters.expiresAt, now))
      .limit(CLEANUP_BATCH_SIZE);
    if (counters.length > 0) {
      await this.database.db.delete(smsUsageCounters)
        .where(inArray(smsUsageCounters.scopeKey, counters.map(({ scopeKey }) => scopeKey)));
    }
  }
}
