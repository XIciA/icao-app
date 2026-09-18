import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { before, after } from 'node:test';

const source = readFileSync(new URL('../scripts/rehearse-production-migrations.sh', import.meta.url), 'utf8');
const extractSql = name => {
  const start = `cat > "$${name}" <<'SQL'\n`;
  const body = source.split(start)[1]?.split('\nSQL')[0];
  assert.ok(body, `missing_actual_rehearsal_sql:${name}`);
  return body;
};
const beforeSql = extractSql('fingerprint_before_sql');
const afterSql = extractSql('fingerprint_after_sql');
const migration42 = readFileSync(new URL('../services/api/drizzle/0042_weekly_ai_allowance.sql', import.meta.url), 'utf8');
const migration45 = readFileSync(new URL('../services/api/drizzle/0045_ai_operation_privacy.sql', import.meta.url), 'utf8');
const migration50 = readFileSync(new URL('../services/api/drizzle/0050_wechat_day_pass.sql', import.meta.url), 'utf8');
// macOS TMPDIR can exceed PostgreSQL's Unix socket path limit.
const root = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'icao-preserve-'));
const data = join(root, 'data');
const socket = join(root, 'socket');
let port;
let started = false;

function psql(sql, flags = { apply42: true, apply45: true }) {
  return spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-v', `apply_0042=${flags.apply42}`, '-v', `apply_0045=${flags.apply45}`, '-v', `apply_0050=${flags.apply50 ?? false}`,
    '-h', socket, '-p', String(port), '-U', 'postgres', '-d', 'postgres'],
  { input: sql, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
}

before(async () => {
  port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  mkdirSync(socket);
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  const serverLog = join(root, 'postgres.log');
  const start = spawnSync('pg_ctl', ['-D', data, '-l', serverLog, '-o', `-F -k ${socket} -p ${port} -h 127.0.0.1`, '-w', 'start'], { encoding: 'utf8' });
  assert.equal(start.status, 0, `${start.stderr}\n${readFileSync(serverLog, 'utf8')}`);
  started = true;
  const roles = psql('CREATE ROLE anon; CREATE ROLE authenticated;');
  assert.equal(roles.status, 0, roles.stderr);
});
after(() => {
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

// Small pre-0042 fixtures execute the unmodified migration SQL, not a mock of it.
const fixture = `
DROP SCHEMA IF EXISTS icao_rehearsal CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
CREATE TABLE accounts (id uuid PRIMARY KEY, ai_result_generation integer NOT NULL, note text);
INSERT INTO accounts VALUES
 ('00000000-0000-4000-8000-000000000001',1,'already cleared'),
 ('00000000-0000-4000-8000-000000000002',0,'must keep');
CREATE TABLE ai_point_reservations (id uuid PRIMARY KEY, account_id uuid, result_payload jsonb, reserved_points integer);
INSERT INTO ai_point_reservations VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','{"text":"previously deleted"}',5),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','{"text":"retain this answer"}',8);
CREATE TABLE ops_staff_accounts (id uuid PRIMARY KEY);
CREATE TABLE commerce_orders (id uuid PRIMARY KEY, amount_fen integer NOT NULL);
INSERT INTO commerce_orders VALUES ('00000000-0000-4000-8000-000000000021',16800);
CREATE TABLE ai_point_batches (id uuid PRIMARY KEY, source_type text CONSTRAINT ai_point_batches_source_check CHECK (source_type IN ('trial','membership','compensation')));
CREATE TABLE commerce_products (product_key text PRIMARY KEY, duration_days integer, base_price_cny_fen integer, active boolean, updated_at timestamptz, title text);
INSERT INTO commerce_products VALUES
 ('membership_7d_v1',7,6800,true,'2026-01-01','seven'),
 ('membership_15d_v1',15,9800,true,'2026-01-01','legacy fifteen'),
 ('membership_31d_v1',31,16800,true,'2026-01-01','thirty one'),
 ('membership_62d_v1',62,29800,true,'2026-01-01','legacy sixty two'),
 ('membership_93d_v1',93,39800,true,'2026-01-01','ninety three');
CREATE TABLE commerce_channel_products (product_key text PRIMARY KEY, active boolean, updated_at timestamptz, provider_product_id text);
INSERT INTO commerce_channel_products SELECT product_key,true,updated_at,'apple.' || product_key FROM commerce_products;
ALTER TABLE commerce_products
  ADD display_name text,
  ADD ai_point_rule_version text,
  ADD ai_point_batch_count integer,
  ADD ai_point_batch_interval_days integer,
  ADD ai_points_per_batch integer,
  ADD created_at timestamptz DEFAULT now(),
  ALTER active SET DEFAULT true,
  ALTER updated_at SET DEFAULT now();
`;
const assertFingerprints = `
DO $verify$ BEGIN
  IF EXISTS (
    SELECT 1 FROM icao_rehearsal.table_fingerprints_before b
    LEFT JOIN icao_rehearsal.table_fingerprints_after a USING (schema_name, table_name)
    WHERE a.table_name IS NULL OR b.row_count IS DISTINCT FROM a.row_count
      OR b.content_digest IS DISTINCT FROM a.content_digest
  ) THEN RAISE EXCEPTION 'preserved_row_fingerprints_mismatch'; END IF;
END $verify$;
`;
function scenario({ apply42 = true, apply45 = true, apply50 = false, preApplied50 = false, mutation = '', migrationOverride } = {}) {
  const preApplied = `${apply42 ? '' : migration42}\n${apply45 ? '' : migration45}\n${preApplied50 ? migration50 : ''}`;
  const pending = migrationOverride ?? `${apply42 ? migration42 : ''}\n${apply45 ? migration45 : ''}\n${apply50 ? migration50 : ''}`;
  return psql(`${fixture}
    BEGIN; ${preApplied} COMMIT;
    ${beforeSql}
    UPDATE icao_rehearsal.preservation_context SET migration_started_at=clock_timestamp();
    BEGIN; ${pending} COMMIT;
    UPDATE icao_rehearsal.preservation_context SET migration_finished_at=clock_timestamp();
    ${mutation}
    ${afterSql}
    ${assertFingerprints}
  `, { apply42, apply45, apply50 });
}
function passes(result) { assert.equal(result.status, 0, result.stderr); }
function fails(result, reason = /preserved_row_fingerprints_mismatch/u) {
  assert.notEqual(result.status, 0, 'unexpected migration preservation success');
  assert.match(result.stderr, reason);
}

test('actual pending 0042 and 0045 pass with all unchanged fields retained', () => passes(scenario()));
test('a wrong new catalog price fails', () => fails(scenario({ mutation: "UPDATE commerce_products SET base_price_cny_fen=1 WHERE duration_days=31;" })));
test('a wrong active channel mapping fails', () => fails(scenario({ mutation: "UPDATE commerce_channel_products SET active=true WHERE product_key='membership_15d_v1';" })));
test('changing a non-target AI answer fails', () => fails(scenario({ mutation: "UPDATE ai_point_reservations SET result_payload=NULL WHERE account_id='00000000-0000-4000-8000-000000000002';" })));
test('changing an unrelated field fails', () => fails(scenario({ mutation: "UPDATE commerce_orders SET amount_fen=1;" })));
test('the scrub exception does not hide other changes to the target reservation', () => fails(scenario({ mutation: "UPDATE ai_point_reservations SET reserved_points=1 WHERE account_id='00000000-0000-4000-8000-000000000001';" })));
test('deleting an existing row fails', () => fails(scenario({ mutation: "DELETE FROM commerce_products WHERE duration_days=15;" })));
test('deleting an existing table fails', () => fails(scenario({ mutation: 'DROP TABLE commerce_orders;' })));
test('catalog time outside the exact migration transaction fails', () => fails(scenario({ mutation: "UPDATE commerce_products SET updated_at='2000-01-01' WHERE duration_days=7;" }), /catalog_timestamp_mismatch/u));
test('failing to scrub a target AI answer fails', () => fails(scenario({ mutation: "UPDATE ai_point_reservations SET result_payload='{}' WHERE account_id='00000000-0000-4000-8000-000000000001';" }), /ai_scrub_scope_mismatch/u));
test('marking a non-target AI answer as deleted fails', () => fails(scenario({ mutation: "UPDATE ai_point_reservations SET result_deleted_at=now() WHERE account_id='00000000-0000-4000-8000-000000000002';" }), /ai_scrub_scope_mismatch/u));
test('0045-only pending works without re-normalizing an already-applied 0042', () => passes(scenario({ apply42: false })));
test('already-applied catalog timestamp remains protected', () => fails(scenario({ apply42: false, mutation: 'UPDATE commerce_products SET updated_at=now();' })));
test('neither previously-applied migration grants a continuing exception', () => {
  passes(scenario({ apply42: false, apply45: false }));
  fails(scenario({ apply42: false, apply45: false, mutation: 'UPDATE commerce_products SET base_price_cny_fen=1;' }));
  fails(scenario({ apply42: false, apply45: false, mutation: "UPDATE ai_point_reservations SET result_payload='{}' WHERE result_payload IS NOT NULL;" }));
});
test('pending flags come from the exact safe migration plan rather than schema guesses', () => {
  assert.match(source, /m\.tag === tag && m\.status === "pending"/u);
  assert.ok(source.indexOf('pre_plan=$work_dir/pre-plan.json') < source.indexOf('fingerprint_before_sql='));
  assert.match(source, /p\.safe \|\| p\.driftCount !== 0 \|\| p\.pendingCount < 1/u);
});

test('failed rehearsal log survives outer cleanup privately with a safe phase marker', () => {
  const apply = readFileSync(new URL('../scripts/apply-production-migrations.sh', import.meta.url), 'utf8');
  const start = '# BEGIN production-migration-preserve-rehearsal-log';
  const end = '# END production-migration-preserve-rehearsal-log';
  const functionSource = apply.split(start)[1]?.split(end)[0];
  assert.ok(functionSource);
  assert.match(apply, /rehearse-production-migrations\.sh" > "\$REHEARSAL_LOG" 2>&1/u);
  const cleanupStart = apply.indexOf('cleanup_local_on_exit() {');
  const cleanupHook = apply.slice(cleanupStart, apply.indexOf('trap cleanup_local_on_exit EXIT', cleanupStart));
  const scratch = mkdtempSync(join(tmpdir(), 'icao-preservation-log-'));
  try {
    const original = join(scratch, 'rehearsal.log');
    writeFileSync(original, 'private fixture diagnostic\nmigration_rehearsal_failed stage=preserved_row_fingerprints exit=1\n');
    const result = spawnSync('/bin/sh', ['-c', `set -eu\n${functionSource}\n${cleanupHook}\ncleanup_local_resources() { rm "$REHEARSAL_LOG"; }\ntrap cleanup_local_on_exit EXIT\nexit 17`], {
      encoding: 'utf8', env: { ...process.env, TMPDIR: scratch, REHEARSAL_LOG: original, SOURCE_ID: 'a'.repeat(12), LOCAL_STAGE: 'rehearsal' },
    });
    assert.equal(result.status, 17, result.stderr);
    const retainedPath = /rehearsal_log=(.+)/u.exec(result.stderr)?.[1];
    assert.ok(retainedPath, result.stderr);
    assert.throws(() => statSync(original), /ENOENT/u);
    assert.equal(readFileSync(retainedPath, 'utf8'), 'private fixture diagnostic\nmigration_rehearsal_failed stage=preserved_row_fingerprints exit=1\n');
    assert.equal(statSync(retainedPath).mode & 0o777, 0o600);
    assert.match(result.stderr, /stage=preserved_row_fingerprints exit=1/u);
    assert.doesNotMatch(result.stderr, /private fixture diagnostic/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

const dayPassOnly = { apply42: false, apply45: false, apply50: true };
test('0050 permits only its verified new row while preserving all existing rows', () => {
  passes(scenario(dayPassOnly));
  passes(scenario({ apply50: true }));
  fails(scenario({ ...dayPassOnly, mutation: "UPDATE commerce_products SET base_price_cny_fen=1 WHERE duration_days=31;" }));
});
test('0050 rejects malformed or missing inserted product data and timestamps', () => {
  for (const mutation of [
    "UPDATE commerce_products SET base_price_cny_fen=2 WHERE duration_days=1;",
    "UPDATE commerce_products SET display_name='wrong' WHERE duration_days=1;",
    "UPDATE commerce_products SET created_at='2000-01-01' WHERE duration_days=1;",
    "DELETE FROM commerce_products WHERE duration_days=1;",
  ]) fails(scenario({ ...dayPassOnly, mutation }), /day_pass_insert_mismatch/u);
});
test('0050 does not exempt any additional inserted row or Apple mapping', () => {
  fails(scenario({ ...dayPassOnly, mutation: "INSERT INTO commerce_products(product_key) VALUES ('unapproved');" }));
  fails(scenario({ ...dayPassOnly, mutation: "INSERT INTO commerce_channel_products(product_key,active) VALUES ('membership_1d_v1',true);" }));
});
test('0050 never exempts a pre-existing day pass or subsequent mutations', () => {
  fails(scenario({ ...dayPassOnly, preApplied50: true }), /day_pass_already_present/u);
  passes(scenario({ apply42: false, apply45: false, preApplied50: true }));
  fails(scenario({ apply42: false, apply45: false, preApplied50: true,
    mutation: "UPDATE commerce_products SET base_price_cny_fen=2 WHERE duration_days=1;" }));
});
