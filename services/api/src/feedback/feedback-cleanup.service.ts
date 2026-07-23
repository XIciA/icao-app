import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, inArray, isNull, lte } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { feedbackAttachments } from '../database/schema';
import { FeedbackAttachmentStorage } from './feedback-attachment-storage';

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

@Injectable()
export class FeedbackCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly storage: FeedbackAttachmentStorage,
  ) {}

  onModuleInit() {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => { void this.run().catch(() => undefined); }, DAY_MILLISECONDS);
    this.timer.unref();
    void this.run().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()) {
    const expired = await this.database.db.select({
      id: feedbackAttachments.id,
      objectKey: feedbackAttachments.objectKey,
    }).from(feedbackAttachments).where(and(
      isNull(feedbackAttachments.deletedAt),
      lte(feedbackAttachments.expiresAt, now),
    )).limit(100);

    for (const attachment of expired) {
      try {
        await this.storage.remove([attachment.objectKey]);
        await this.database.db.update(feedbackAttachments)
          .set({ deletedAt: now })
          .where(inArray(feedbackAttachments.id, [attachment.id]));
      } catch {
        // Keep the row eligible so the next daily pass retries the deletion.
      }
    }

    const orphanCutoff = new Date(now.getTime() - DAY_MILLISECONDS);
    const oldObjects = (await this.storage.listOldest()).filter((object) => object.createdAt <= orphanCutoff);
    if (oldObjects.length === 0) return;
    const keys = oldObjects.map((object) => object.objectKey);
    const referenced = await this.database.db.select({ objectKey: feedbackAttachments.objectKey })
      .from(feedbackAttachments)
      .where(inArray(feedbackAttachments.objectKey, keys));
    const referencedKeys = new Set(referenced.map((row) => row.objectKey));
    const orphaned = keys.filter((key) => !referencedKeys.has(key));
    if (orphaned.length > 0) await this.storage.remove(orphaned);
  }
}

