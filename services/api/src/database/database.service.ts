import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { API_CONFIG, type ApiConfig } from '../config';
import * as schema from './schema';

// This API requires the feedback source/category expansion in migration 0055.
// Bind startup to the exact migration, not a table-count guess.
export const MINIMUM_DATABASE_SCHEMA_VERSION = 55;
export const MINIMUM_DATABASE_MIGRATION = {
  createdAt: 1793020000000,
  hash: 'b45e81f5b64e6b2cb262cd80c1cb52b3de0f602c1956128217740192460a7913',
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
