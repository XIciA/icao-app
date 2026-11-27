import { observeBackground } from '../performance/request-performance';
import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { eq, inArray, lte } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { feedbackAttachments, feedbackTickets } from '../database/schema';
import { FeedbackAttachmentStorage } from './feedback-attachment-storage';

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 100;
const ORPHAN_BATCH_SIZE = 1_000;

type CleanupFailureStage = 'cycle' | 'ticket';

function cleanupFailureCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const value = typeof response === 'string'
      ? response
      : response && typeof response === 'object' && 'message' in response
        ? (response as { message?: unknown }).message
        : undefined;
    if (typeof value === 'string' && /^feedback_[a-z_]+$/u.test(value)) return value;
  }
  return 'feedback_cleanup_unexpected';
}

@Injectable()
export class FeedbackCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly storage: FeedbackAttachmentStorage,
  ) {}

  onModuleInit() {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => { void observeBackground('feedback_cleanup', () => this.runScheduled(), this.logger); }, DAY_MILLISECONDS);
    this.timer.unref();
    void observeBackground('feedback_cleanup', () => this.runScheduled(), this.logger);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runScheduled(now = new Date()) {
    try {
      return await this.run(now);
    } catch (error) {
      this.logFailure('cycle', error);
      return { ticketsDeleted: 0, ticketFailures: 1, orphanObjectsDeleted: 0 };
    }
  }

  async run(now = new Date()) {
    const expiredTickets = await this.database.db.select({ id: feedbackTickets.id })
      .from(feedbackTickets)
      .where(lte(feedbackTickets.retentionAt, now))
      .limit(CLEANUP_BATCH_SIZE);

    let ticketsDeleted = 0;
    let ticketFailures = 0;
    for (const ticket of expiredTickets) {
      try {
        const attachments = await this.database.db.select({ objectKey: feedbackAttachments.objectKey })
          .from(feedbackAttachments)
          .where(eq(feedbackAttachments.ticketId, ticket.id))
          .limit(ORPHAN_BATCH_SIZE);
        const objectKeys = attachments.map((attachment) => attachment.objectKey);
        if (objectKeys.length > 0) await this.storage.remove(objectKeys);
        // The FK uses ON DELETE CASCADE, so deleting the ticket removes its attachment rows
        // and its diagnostics in one database operation after object deletion has succeeded.
        await this.database.db.delete(feedbackTickets).where(eq(feedbackTickets.id, ticket.id));
        ticketsDeleted += 1;
      } catch (error) {
        // Keep the ticket and attachment rows eligible for the next daily pass.
        ticketFailures += 1;
        this.logFailure('ticket', error);
      }
    }

    const orphanCutoff = new Date(now.getTime() - DAY_MILLISECONDS);
    const oldObjects = (await this.storage.listOldest(ORPHAN_BATCH_SIZE))
      .filter((object) => object.createdAt <= orphanCutoff);
    if (oldObjects.length === 0) return { ticketsDeleted, ticketFailures, orphanObjectsDeleted: 0 };
    const keys = oldObjects.map((object) => object.objectKey);
    const referenced = await this.database.db.select({ objectKey: feedbackAttachments.objectKey })
      .from(feedbackAttachments)
      .where(inArray(feedbackAttachments.objectKey, keys))
      .limit(ORPHAN_BATCH_SIZE);
    const referencedKeys = new Set(referenced.map((row) => row.objectKey));
    const orphaned = keys.filter((key) => !referencedKeys.has(key));
    if (orphaned.length > 0) await this.storage.remove(orphaned);
    return { ticketsDeleted, ticketFailures, orphanObjectsDeleted: orphaned.length };
  }

  private logFailure(stage: CleanupFailureStage, error: unknown) {
    this.logger.error({
      event: 'feedback_cleanup_failed',
      failureCode: cleanupFailureCode(error),
      retryable: true,
      stage,
    });
  }
}
