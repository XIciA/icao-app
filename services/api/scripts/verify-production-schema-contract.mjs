import postgres from 'postgres';

import { SERVER_ONLY_PUBLIC_TABLES } from './production-schema-contract-data.mjs';

const databaseUrl = process.env.DATABASE_URL;
const expectedDatabase = process.env.ICAO_PRODUCTION_DATABASE_NAME;
if (!databaseUrl) throw new Error('missing_DATABASE_URL');
if (!expectedDatabase || !/^[a-z][a-z0-9_]{0,62}$/u.test(expectedDatabase)) {
  throw new Error('missing_or_invalid_ICAO_PRODUCTION_DATABASE_NAME');
}

const parsedUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
  throw new Error('production_database_protocol_invalid');
}
if (
  parsedUrl.hostname !== 'db'
  || parsedUrl.pathname !== `/${expectedDatabase}`
  || parsedUrl.search !== ''
  || parsedUrl.hash !== ''
) {
  throw new Error('production_database_target_invalid');
}

const serverOnlyTables = SERVER_ONLY_PUBLIC_TABLES;
const requiredTables = serverOnlyTables.map((value) => `public.${value}`);
const expectedProducts = [
  ['membership_7d_v1', 7, 6800, 'ai-points-v1', 1, 31, 250],
  ['membership_15d_v1', 15, 10800, 'ai-points-v1', 1, 31, 500],
  ['membership_31d_v1', 31, 16800, 'ai-points-v1', 1, 31, 1000],
  ['membership_62d_v1', 62, 29800, 'ai-points-v1', 2, 31, 1000],
  ['membership_93d_v1', 93, 39800, 'ai-points-v1', 3, 31, 1000],
];
const expectedAppleProducts = expectedProducts.map(([productKey]) => [
  `com.readyoufife.ios.membership.${productKey.match(/membership_(\d+)d/u)?.[1]}d.v1`,
  productKey,
]);

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    application_name: 'icao_production_schema_contract_readonly',
    default_transaction_read_only: true,
    statement_timeout: 15_000,
  },
});

try {
  const result = await client.begin('read only', async (transaction) => {
    const [identity] = await transaction`
      select current_database() as database_name,
             current_setting('transaction_read_only') as transaction_read_only
    `;
    assert(identity?.database_name === expectedDatabase, 'production_database_name_mismatch');
    assert(identity?.transaction_read_only === 'on', 'production_schema_verifier_not_read_only');

    const tableRows = await transaction`
      select required_name, to_regclass(required_name)::text as resolved_name
      from unnest(${transaction.array(requiredTables)}::text[]) as required(required_name)
      order by required_name
    `;
    const missingTables = tableRows.filter((row) => !row.resolved_name).map((row) => row.required_name);
    assert(missingTables.length === 0, `production_schema_missing_tables:${missingTables.join(',')}`);

    const [unvalidated] = await transaction`
      select count(*)::integer as count
      from pg_constraint constraint_state
      join pg_namespace namespace_state on namespace_state.oid = constraint_state.connamespace
      where namespace_state.nspname in ('public', 'auth')
        and not constraint_state.convalidated
    `;
    assert(unvalidated?.count === 0, 'production_schema_has_unvalidated_constraints');

    const [disabledRls] = await transaction`
      select count(*)::integer as count
      from pg_class table_state
      join pg_namespace namespace_state on namespace_state.oid = table_state.relnamespace
      where namespace_state.nspname = 'public'
        and table_state.relname = any(${transaction.array(serverOnlyTables)}::text[])
        and not table_state.relrowsecurity
    `;
    assert(disabledRls?.count === 0, 'production_schema_required_rls_disabled');

    const [clientGrants] = await transaction`
      select count(*)::integer as count
      from unnest(${transaction.array(serverOnlyTables)}::text[]) as protected_table(table_name)
      cross join (values ('anon'), ('authenticated')) as client_role(role_name)
      where has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'SELECT')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'INSERT')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'UPDATE')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'DELETE')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'TRUNCATE')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'REFERENCES')
         or has_table_privilege(client_role.role_name, format('public.%I', protected_table.table_name), 'TRIGGER')
    `;
    assert(clientGrants?.count === 0, 'production_schema_server_only_table_grant_present');

    const [privacyColumns] = await transaction`
      select count(*)::integer as count
      from information_schema.columns
      where table_schema = 'public'
        and (
          (table_name = 'accounts' and column_name in ('learning_data_generation', 'ai_result_generation'))
          or (table_name = 'privacy_action_receipts' and column_name in (
            'account_id', 'action', 'idempotency_key', 'request_hash', 'result', 'created_at'
          ))
        )
    `;
    assert(privacyColumns?.count === 8, 'production_privacy_schema_columns_incomplete');

    const [deviceDigest] = await transaction`
      select count(*)::integer as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'content_access_credentials'
        and column_name = 'device_digest'
    `;
    assert(deviceDigest?.count === 0, 'production_content_device_digest_still_present');

    const products = await transaction`
      select product_key, duration_days, base_price_cny_fen, ai_point_rule_version,
             ai_point_batch_count, ai_point_batch_interval_days, ai_points_per_batch
      from commerce_products
      where active = true
      order by duration_days
    `;
    assert(JSON.stringify(products.map((row) => [
      row.product_key,
      row.duration_days,
      row.base_price_cny_fen,
      row.ai_point_rule_version,
      row.ai_point_batch_count,
      row.ai_point_batch_interval_days,
      row.ai_points_per_batch,
    ])) === JSON.stringify(expectedProducts), 'production_commerce_product_catalog_mismatch');

    const appleProducts = await transaction`
      select external_product_id, product_key
      from commerce_channel_products
      where channel = 'apple_app_store'
      order by product_key
    `;
    const normalizedAppleProducts = appleProducts
      .map((row) => [row.external_product_id, row.product_key])
      .sort((left, right) => left[1].localeCompare(right[1]));
    const normalizedExpectedAppleProducts = [...expectedAppleProducts]
      .sort((left, right) => left[1].localeCompare(right[1]));
    assert(
      JSON.stringify(normalizedAppleProducts) === JSON.stringify(normalizedExpectedAppleProducts),
      'production_apple_product_mapping_mismatch',
    );

    return {
      appleProductMappings: appleProducts.length,
      commerceProducts: products.length,
      deviceDigestColumns: deviceDigest.count,
      requiredTables: tableRows.length,
      serverOnlyClientGrants: clientGrants.count,
      unvalidatedConstraints: unvalidated.count,
    };
  });
  console.log(JSON.stringify({ status: 'verified', readOnly: true, ...result }));
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown';
  const safeReason = /^[A-Za-z0-9_:,.-]{1,1000}$/u.test(message) ? message : 'database_query_failed';
  console.error(`production_schema_contract_failed:${safeReason}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
