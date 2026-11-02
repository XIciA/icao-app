import { countStatement } from '../performance/request-performance';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { API_CONFIG, type ApiConfig } from '../config';
import * as schema from './schema';

// Membership-length offline credentials require the 0060 persistence constraint.
// Bind startup to the exact migration so an API cannot serve against the old 72-hour window.
export const MINIMUM_DATABASE_SCHEMA_VERSION = 60;
export const MINIMUM_DATABASE_MIGRATION = {
  createdAt: 1793614540349,
  hash: '34a60c1f037a6c6321ddffc6afff958ba1b0a2fa50fabab4923d3463d190d341',
} as const;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(@Inject(API_CONFIG) config: Pick<ApiConfig, 'databaseUrl'> & { databaseApplicationName?: 'icao-api' | 'icao-ops-api' }) {
    this.client = postgres(config.databaseUrl, { max: 5, prepare: false, connection: { application_name: config.databaseApplicationName ?? 'icao-api' } });
    this.db = drizzle(this.client, { schema, logger: { logQuery: () => countStatement() } });
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
