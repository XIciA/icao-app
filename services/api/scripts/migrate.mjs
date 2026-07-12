import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');

const client = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('database_migrations_applied');
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (error && typeof error === 'object' && 'cause' in error) console.error(error.cause);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
