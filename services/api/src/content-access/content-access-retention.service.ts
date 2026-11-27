import { observeBackground } from '../performance/request-performance';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { contentAccessCredentials, contentEnvironmentSessionGrants } from '../database/schema';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 1_000;

@Injectable()
export class ContentAccessRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentAccessRetentionService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void observeBackground('content_retention', () => this.cleanup(), this.logger).catch(() => this.logger.error('content_access_retention_cleanup_failed'));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async cleanup(now = new Date()) {
    const nowIso = now.toISOString();
    await this.database.db.execute(sql`
      DELETE FROM ${contentAccessCredentials}
      WHERE ${contentAccessCredentials.id} IN (
        SELECT ${contentAccessCredentials.id} FROM ${contentAccessCredentials}
        WHERE ${contentAccessCredentials.retentionAt} <= ${nowIso}::timestamptz
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      AND ${contentAccessCredentials.retentionAt} <= ${nowIso}::timestamptz
    `);
    await this.database.db.execute(sql`
      DELETE FROM ${contentEnvironmentSessionGrants}
      WHERE ${contentEnvironmentSessionGrants.id} IN (
        SELECT ${contentEnvironmentSessionGrants.id} FROM ${contentEnvironmentSessionGrants}
        WHERE ${contentEnvironmentSessionGrants.retentionAt} <= ${nowIso}::timestamptz
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      AND ${contentEnvironmentSessionGrants.retentionAt} <= ${nowIso}::timestamptz
    `);
  }
}
