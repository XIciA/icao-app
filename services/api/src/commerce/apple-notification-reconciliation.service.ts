import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { appleNotificationEvents } from '../database/schema';
import { CommerceService } from './commerce.service';

const RETRY_INTERVAL_MS = 60_000;
const RETRY_BATCH_SIZE = 50;

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
    this.timer = setInterval(() => { void this.runScheduled(); }, RETRY_INTERVAL_MS);
    this.timer.unref();
    void this.runScheduled();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runScheduled(now = new Date()) {
    if (this.running) return { attempted: 0, processed: 0 };
    this.running = true;
    try {
      return await this.reconcileFailedNotifications(
        new Date(now.getTime() - RETRY_INTERVAL_MS),
      );
    } catch {
      this.logger.error('apple_notification_reconciliation_cycle_failed');
      return { attempted: 0, processed: 0 };
    } finally {
      this.running = false;
    }
  }

  async reconcileFailedNotifications(retryBefore: Date) {
    const events = await this.database.db.select({
      signedPayload: appleNotificationEvents.signedPayload,
    }).from(appleNotificationEvents).where(and(
      eq(appleNotificationEvents.status, 'failed'),
      eq(appleNotificationEvents.errorCode, 'apple_notification_transaction_unresolved'),
      isNotNull(appleNotificationEvents.signedPayload),
      lte(appleNotificationEvents.processedAt, retryBefore),
    )).orderBy(appleNotificationEvents.receivedAt).limit(RETRY_BATCH_SIZE);

    let processed = 0;
    for (const event of events) {
      if (!event.signedPayload) continue;
      try {
        await this.commerce.processAppleNotification(event.signedPayload);
        processed += 1;
      } catch {
        // The event remains failed with a refreshed processedAt timestamp and
        // is eligible for a later pass. Never log the signed payload.
      }
    }
    return { attempted: events.length, processed };
  }
}
