import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { API_CONFIG, type ApiConfig } from '../config';
import * as schema from './schema';

// This API requires the account, content, AI allowance and payment tables through
// 0048_ai_trial_eligibility_reason. Bind startup to the exact migration, not a table-count guess.
export const MINIMUM_DATABASE_SCHEMA_VERSION = 48;
export const MINIMUM_DATABASE_MIGRATION = {
  createdAt: 1_789_279_104_465,
  hash: '83cc267e7ac2a4ed9d2a8805f53a67eff195173a33f230807166de5a4f952d3f',
} as const;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(@Inject(API_CONFIG) config: Pick<ApiConfig, 'databaseUrl'>) {
    this.client = postgres(config.databaseUrl, { max: 5, prepare: false });
    this.db = drizzle(this.client, { schema });
  }

  async ping() {
    await this.client`select 1`;
  }

  async assertMinimumSchemaVersion() {
    try {
      const [migration] = await this.client<{ applied: boolean }[]>`
        select exists (
          select 1
          from drizzle.__drizzle_migrations
          where created_at = ${MINIMUM_DATABASE_MIGRATION.createdAt}
            and hash = ${MINIMUM_DATABASE_MIGRATION.hash}
        ) as applied
      `;
      if (migration?.applied !== true) throw new Error('database_schema_too_old');
    } catch (error) {
      if (error instanceof Error && error.message === 'database_schema_too_old') throw error;
      throw new Error('database_schema_version_unavailable', { cause: error });
    }
  }

  async onModuleDestroy() {
    await this.client.end({ timeout: 5 });
  }
}
