import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { API_CONFIG, type ApiConfig } from '../config';
import * as schema from './schema';

// This API requires the account, content, AI allowance and payment tables through
// 0052_content_work_orders. Bind startup to the exact migration, not a table-count guess.
export const MINIMUM_DATABASE_SCHEMA_VERSION = 52;
export const MINIMUM_DATABASE_MIGRATION = {
  createdAt: 1792171270695,
  hash: '90c0738a63aba882d401433fa6102508712f83e33687341282198851425eac99',
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
