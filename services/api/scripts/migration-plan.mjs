import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  buildMigrationPlan,
  formatMigrationPlan,
  isMigrationPlanCurrent,
  loadLocalMigrations,
} from './migration-plan-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');

const jsonOutput = process.argv.includes('--json');
const requireCurrent = process.argv.includes('--require-current');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const parsedUrl = new URL(databaseUrl);
const targetLabel = `${parsedUrl.hostname}:${parsedUrl.port || '5432'}/${parsedUrl.pathname.slice(1) || '(default)'}`;
const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    application_name: 'icao_migration_plan_readonly',
    default_transaction_read_only: true,
    statement_timeout: 10_000,
  },
});

try {
  const localMigrations = await loadLocalMigrations(migrationsFolder);
  const databaseState = await client.begin('read only', async (transaction) => {
    const [registration] = await transaction`
      select to_regclass('drizzle.__drizzle_migrations')::text as table_name
    `;
    if (!registration?.table_name) return { tableExists: false, rows: [] };

    const rows = await transaction`
      select id, hash, created_at
      from "drizzle"."__drizzle_migrations"
      order by created_at asc, id asc
    `;
    return { tableExists: true, rows };
  });
  const plan = buildMigrationPlan(localMigrations, databaseState.rows, {
    tableExists: databaseState.tableExists,
  });

  if (jsonOutput) {
    console.log(JSON.stringify({
      target: targetLabel,
      readOnly: true,
      requireCurrent,
      current: isMigrationPlanCurrent(plan),
      ...plan,
    }, null, 2));
  } else {
    console.log(formatMigrationPlan(plan, targetLabel));
    if (requireCurrent) {
      console.log(isMigrationPlanCurrent(plan)
        ? 'Deployment schema check: CURRENT'
        : 'Deployment schema check: BLOCKED_PENDING_OR_DRIFT');
    }
  }
  if (!plan.safe || (requireCurrent && !isMigrationPlanCurrent(plan))) process.exitCode = 1;
} catch (error) {
  console.error(`migration_plan_failed:${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
