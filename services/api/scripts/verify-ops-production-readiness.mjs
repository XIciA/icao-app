import postgres from 'postgres';

import { assertActiveOpsAdminCount } from './ops-production-readiness-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    application_name: 'icao_ops_production_readiness_readonly',
    default_transaction_read_only: true,
    statement_timeout: 10_000,
  },
});

try {
  const [row] = await client.begin('read only', (transaction) => transaction`
    select count(*)::integer as active_admin_count
    from ops_staff_accounts
    where role = 'admin' and disabled_at is null
  `);
  const activeAdminCount = assertActiveOpsAdminCount(row?.active_admin_count);
  console.log(JSON.stringify({
    status: 'ready',
    readOnly: true,
    activeAdminCount,
  }));
} catch (error) {
  const knownFailure = error instanceof Error
    && ['active_ops_admin_required', 'invalid_active_ops_admin_count'].includes(error.message);
  console.error(`ops_production_readiness_failed:${knownFailure ? error.message : 'database_query_failed'}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
