import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'icao-vocab-storage-'));
const data = join(root, 'data');
const socket = join(root, 'socket');
const binary = name => process.env.VOCABULARY_TEST_PG_BIN ? join(process.env.VOCABULARY_TEST_PG_BIN,name) : name;
const provision = readFileSync(new URL('../../../infra/ops/vocabulary-storage-role.sql', import.meta.url), 'utf8');
const verify = readFileSync(new URL('../../../infra/ops/verify-vocabulary-storage-role.sql', import.meta.url), 'utf8');
const narrowNet = readFileSync(new URL('../../../infra/ops/narrow-vocabulary-net-public-usage.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../../infra/ops/audit-vocabulary-storage-access.sql', import.meta.url), 'utf8');
const valid = `vocabulary/${'a'.repeat(64)}-${'b'.repeat(64)}.mp3`;
let port;

function psql(sql) {
  return spawnSync(binary('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-h', socket, '-p', String(port), '-U', 'supabase_admin', '-d', 'postgres'],
  { input: sql, encoding: 'utf8' });
}
function success(sql) {
  const result = psql(sql);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function asRole(sql, role = 'ops_vocabulary_storage') {
  return psql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL row_security = on; ${sql}; ROLLBACK;`);
}

before(async () => {
  assert.match(execFileSync(binary('postgres'), ['--version'], {encoding:'utf8'}), /PostgreSQL\) 17[.]/,
    'PG17 required: set VOCABULARY_TEST_PG_BIN to its bin directory');
  port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  mkdirSync(socket);
  execFileSync(binary('initdb'), ['-D', data, '-A', 'trust', '-U', 'supabase_admin', '--no-locale'], { stdio: 'ignore' });
  execFileSync(binary('pg_ctl'), ['-D', data, '-o', `-F -k ${socket} -p ${port} -c shared_preload_libraries=pg_stat_statements`, '-w', 'start'], { stdio: 'ignore' });
  success(`
    CREATE ROLE postgres NOINHERIT LOGIN CREATEROLE BYPASSRLS;
    CREATE ROLE authenticator NOINHERIT LOGIN;
    CREATE ROLE supabase_storage_admin NOINHERIT LOGIN;
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_functions_admin NOINHERIT LOGIN;
    GRANT authenticator TO supabase_storage_admin;
    CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
    CREATE SCHEMA auth;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pg_stat_statements SCHEMA extensions;
    CREATE TABLE public.learning_records(id integer);
    CREATE TABLE storage.buckets(id text PRIMARY KEY);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id), name text, UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
    ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated;
    INSERT INTO storage.buckets VALUES ('question-bank-assets'),('feedback');
    INSERT INTO storage.objects(bucket_id,name) VALUES
      ('question-bank-assets','${valid}'),
      ('question-bank-assets','pronunciations/existing.mp3'),
      ('feedback','${valid}');
  `);
});
after(() => {
  if (existsSync(data)) spawnSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

test('provision is transactional, idempotent, and satisfies read-only verification', () => {
  success(provision);
  success(provision);
  assert.equal(success(verify), 'vocabulary_storage_role_verified_read_only');
});
test('Storage connection can SET ROLE without inheriting or bypassing RLS', () => {
  const result = psql(`BEGIN; SET SESSION AUTHORIZATION supabase_storage_admin;
    SET LOCAL ROLE ops_vocabulary_storage;
    SELECT current_user, (SELECT count(*) FROM storage.objects),
      (SELECT count(*) FROM storage.buckets); ROLLBACK;`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'ops_vocabulary_storage|1|1');
});
test('only a new immutable vocabulary key in the intended bucket can be inserted', () => {
  const next = `vocabulary/${'c'.repeat(64)}-${'d'.repeat(64)}.mp3`;
  assert.equal(asRole(`INSERT INTO storage.objects(bucket_id,name)
    VALUES ('question-bank-assets','${next}')`).status, 0);
  for (const [bucket, name] of [
    ['feedback', next], ['question-bank-assets', 'pronunciations/other.mp3'],
    ['question-bank-assets', 'vocabulary/../other.mp3'],
    ['question-bank-assets', next.toUpperCase()],
    ['question-bank-assets', `${next}.exe`],
  ]) {
    const result = asRole(`INSERT INTO storage.objects(bucket_id,name) VALUES ('${bucket}','${name}')`);
    assert.notEqual(result.status, 0, `${bucket}/${name}`);
    assert.match(result.stderr, /row-level security/);
  }
});
test('overwrite, delete, bucket mutation, and learning table access are denied', () => {
  for (const query of [
    `UPDATE storage.objects SET name='changed' WHERE name='${valid}'`,
    `DELETE FROM storage.objects WHERE name='${valid}'`,
    'TRUNCATE storage.objects',
    `INSERT INTO storage.buckets VALUES ('new-bucket')`,
    `UPDATE storage.buckets SET id='renamed'`, 'DELETE FROM storage.buckets',
    'SELECT * FROM public.learning_records', 'INSERT INTO public.learning_records VALUES (1)',
  ]) {
    const result = asRole(query);
    assert.notEqual(result.status, 0, query);
    assert.match(result.stderr, /permission denied/);
  }
  const conflict = asRole(`INSERT INTO storage.objects(bucket_id,name)
    VALUES ('question-bank-assets','${valid}') ON CONFLICT(bucket_id,name)
    DO UPDATE SET name=EXCLUDED.name`);
  assert.notEqual(conflict.status, 0);
});
test('ordinary authenticated and anon roles gain no new upload access', () => {
  for (const role of ['anon', 'authenticated']) {
    assert.notEqual(asRole(`INSERT INTO storage.objects(bucket_id,name)
      VALUES ('question-bank-assets','vocabulary/${'e'.repeat(64)}-${'f'.repeat(64)}.mp3')`, role).status, 0);
  }
});
test('restrictive boundaries survive unrelated broad PUBLIC storage policies', () => {
  success(`GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects, storage.buckets TO PUBLIC;
    CREATE POLICY unrelated_objects_all ON storage.objects TO PUBLIC USING (true) WITH CHECK (true);
    CREATE POLICY unrelated_buckets_all ON storage.buckets TO PUBLIC USING (true) WITH CHECK (true);`);
  try {
    assert.equal(asRole('SELECT count(*) FROM storage.objects').stdout.trim(), '1');
    assert.equal(asRole('SELECT count(*) FROM storage.buckets').stdout.trim(), '1');
    assert.notEqual(asRole(`INSERT INTO storage.objects(bucket_id,name)
      VALUES ('feedback','outside.mp3')`).status, 0);
    assert.equal(asRole(`UPDATE storage.objects SET name='changed' RETURNING name`).stdout.trim(), '');
    assert.equal(asRole('DELETE FROM storage.objects RETURNING name').stdout.trim(), '');
    assert.equal(asRole('DELETE FROM storage.buckets RETURNING id').stdout.trim(), '');
    assert.match(psql(verify).stderr, /vocabulary_storage_extra_privilege/);
  } finally {
    success(`DROP POLICY unrelated_objects_all ON storage.objects;
      DROP POLICY unrelated_buckets_all ON storage.buckets;
      REVOKE ALL ON storage.objects, storage.buckets FROM PUBLIC;`);
  }
});
test('existing elevated role, inherited business access, and SECURITY DEFINER access fail closed', () => {
  success('ALTER ROLE ops_vocabulary_storage BYPASSRLS');
  assert.match(psql(provision).stderr, /existing_role_conflict/);
  success('ALTER ROLE ops_vocabulary_storage NOBYPASSRLS');
  success('GRANT SELECT ON public.learning_records TO PUBLIC');
  assert.match(psql(provision).stderr, /unexpected_business_access/);
  assert.match(psql(verify).stderr, /extra_privilege/);
  success('REVOKE SELECT ON public.learning_records FROM PUBLIC');
  success(`CREATE FUNCTION public.test_definer() RETURNS integer LANGUAGE sql
    SECURITY DEFINER AS 'SELECT 1'`);
  assert.match(psql(provision).stderr, /unexpected_definer_access/);
  assert.match(psql(verify).stderr, /unexpected_definer_access/);
  success('DROP FUNCTION public.test_definer()');
  assert.equal(success(verify), 'vocabulary_storage_role_verified_read_only');
});
test('read-only verification rejects a renamed-in-place permissive or expanded policy', () => {
  success('ALTER POLICY ops_vocabulary_scope ON storage.objects WITH CHECK (true)');
  assert.match(psql(verify).stderr, /policy_definition_invalid/);
  success(provision);
  success('ALTER POLICY ops_vocabulary_no_delete ON storage.objects USING (true)');
  assert.match(psql(verify).stderr, /policy_definition_invalid/);
  success(provision);
  assert.equal(success(verify), 'vocabulary_storage_role_verified_read_only');
});
test('PG17 CREATEROLE automatically creates admin membership; only existing superuser may provision', () => {
  const creation = psql(`BEGIN; SET SESSION AUTHORIZATION postgres;
    CREATE ROLE fixture_created NOLOGIN NOINHERIT NOBYPASSRLS;
    SELECT admin_option,inherit_option,set_option FROM pg_auth_members
      WHERE roleid='fixture_created'::regrole AND member='postgres'::regrole;
    ROLLBACK;`);
  assert.equal(creation.status,0,creation.stderr);
  assert.equal(creation.stdout.trim(),'t|f|f');
  const ordinary = psql(`SET SESSION AUTHORIZATION postgres; ${provision}`);
  assert.notEqual(ordinary.status,0);
  assert.match(ordinary.stderr,/superuser_executor_required/);
  assert.equal(success('SELECT to_regrole(\'fixture_created\') IS NULL'),'t');
  success(provision);
});
test('real pg_stat_statements PUBLIC SELECT without schema USAGE is dormant, never a schema exemption', () => {
  assert.equal(success(`SELECT has_table_privilege('ops_vocabulary_storage',
    'extensions.pg_stat_statements','SELECT'),
    has_schema_privilege('ops_vocabulary_storage','extensions','USAGE')`),'t|f');
  const dormant = psql(verify);
  assert.equal(dormant.status,0,dormant.stderr);
  assert.match(dormant.stderr,/dormant_public_acl: extensions.pg_stat_statements SELECT/);
  success('GRANT USAGE ON SCHEMA extensions TO ops_vocabulary_storage');
  assert.match(psql(verify).stderr,/extra_privilege: extensions.pg_stat_statements SELECT/);
  success('REVOKE USAGE ON SCHEMA extensions FROM ops_vocabulary_storage');
  success('CREATE VIEW extensions.sensitive_fixture AS SELECT 1 AS secret; GRANT SELECT ON extensions.sensitive_fixture TO ops_vocabulary_storage');
  assert.match(psql(verify).stderr,/extra_privilege: extensions.sensitive_fixture SELECT/);
  success('DROP VIEW extensions.sensitive_fixture');
});
test('production-like pg_net PUBLIC ACL really blocks until separately approved USAGE narrowing', () => {
  success(`CREATE SCHEMA net AUTHORIZATION supabase_admin;
    CREATE TABLE net.http_request_queue(id bigserial,url text,headers jsonb,body bytea);
    CREATE TABLE net._http_response(id bigint,headers jsonb,content text);
    CREATE FUNCTION net.http_get(url text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
    GRANT USAGE ON SCHEMA net TO PUBLIC,postgres,anon,authenticated,service_role,supabase_functions_admin;
    GRANT ALL ON net.http_request_queue,net._http_response TO PUBLIC;
    GRANT ALL ON SEQUENCE net.http_request_queue_id_seq TO PUBLIC;
    INSERT INTO net._http_response VALUES (1,'{}','fixture only');`);
  const blocked = psql(verify);
  assert.notEqual(blocked.status,0);
  assert.match(blocked.stderr,/extra_privilege: net[.]/);
  assert.equal(asRole('SELECT count(*) FROM net._http_response').stdout.trim(),'1');
  const aclSnapshot = `SELECT jsonb_agg(jsonb_build_object('grantee',a.grantee,
    'grantor',a.grantor,'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY a.grantee,a.grantor,a.privilege_type) FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='net'`;
  const before = success(aclSnapshot);
  success(narrowNet);
  success(narrowNet);
  assert.equal(success(verify),'vocabulary_storage_role_verified_read_only');
  for (const role of ['postgres','anon','authenticated','service_role','supabase_functions_admin']) {
    assert.equal(asRole("SELECT net.http_get('fixture://no-network')",role).stdout.trim(),'1');
    assert.equal(asRole('SELECT count(*) FROM net._http_response',role).stdout.trim(),'1');
  }
  for (const query of ['SELECT * FROM net._http_response','SELECT * FROM net.http_request_queue',
    "INSERT INTO net.http_request_queue(url) VALUES ('fixture://no-network')",
    'DELETE FROM net._http_response',"SELECT nextval('net.http_request_queue_id_seq')",
    "SELECT net.http_get('fixture://no-network')"]) {
    const result = asRole(query);
    assert.notEqual(result.status,0,query);
    assert.match(result.stderr,/permission denied for schema net/);
  }
  // Table/sequence/function ACLs are intentionally unchanged. This is only a
  // namespace-boundary delta, so rollout also requires the dependency guard.
  assert.equal(success("SELECT has_table_privilege('ops_vocabulary_storage','net._http_response','SELECT')"),'t');
  success('GRANT USAGE ON SCHEMA net TO PUBLIC');
  assert.equal(success(aclSnapshot),before);
  assert.notEqual(psql(verify).status,0);
  success(narrowNet);
});
test('prebound SQL function chains cannot hide net reads behind a revoked schema', () => {
  success(`CREATE FUNCTION public.fixture_net_inner() RETURNS bigint LANGUAGE sql
    BEGIN ATOMIC SELECT count(*) FROM net._http_response; END;
    CREATE FUNCTION public.fixture_net_outer() RETURNS bigint LANGUAGE sql
    BEGIN ATOMIC SELECT public.fixture_net_inner(); END;`);
  try {
    // PG17 binds relation OIDs at CREATE FUNCTION: USAGE alone does not close
    // this route. The verifier must reject it rather than report a clean scope.
    assert.equal(asRole('SELECT public.fixture_net_outer()').stdout.trim(),'1');
    assert.match(psql(verify).stderr,/callable_relation_bypass: net._http_response/);
  } finally {
    success('DROP FUNCTION public.fixture_net_outer(); DROP FUNCTION public.fixture_net_inner()');
  }
  assert.equal(success(verify),'vocabulary_storage_role_verified_read_only');
});
test('optional net operation fails closed when an existing caller lacks an explicit preserved grant', () => {
  success('REVOKE USAGE ON SCHEMA net FROM anon; GRANT USAGE ON SCHEMA net TO PUBLIC');
  assert.match(psql(narrowNet).stderr,/existing_explicit_usage_missing: anon/);
  assert.equal(success("SELECT has_schema_privilege('ops_vocabulary_storage','net','USAGE')"),'t');
  success('GRANT USAGE ON SCHEMA net TO anon');
  success(narrowNet);
});
test('OID-bound network calls or inaccessible SECURITY DEFINER helpers still block verification', () => {
  success(`CREATE FUNCTION public.fixture_network_wrapper() RETURNS integer LANGUAGE sql
    BEGIN ATOMIC SELECT net.http_get('fixture://no-network'); END;`);
  assert.equal(asRole('SELECT public.fixture_network_wrapper()').stdout.trim(),'1');
  assert.match(psql(verify).stderr,/callable_network_bypass: net.http_get/);
  success('DROP FUNCTION public.fixture_network_wrapper()');
  success(`CREATE SCHEMA fixture_private;
    CREATE FUNCTION fixture_private.definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
    CREATE FUNCTION public.fixture_definer_wrapper() RETURNS integer LANGUAGE sql
    BEGIN ATOMIC SELECT fixture_private.definer(); END;`);
  assert.match(psql(verify).stderr,/unexpected_definer_access/);
  success(`DROP FUNCTION public.fixture_definer_wrapper(); DROP SCHEMA fixture_private CASCADE`);
  assert.equal(success(verify),'vocabulary_storage_role_verified_read_only');
});
test('metadata audit distinguishes PUBLIC ACL sources from effective schema access without reading content', () => {
  const report = JSON.parse(success(audit));
  const response = report.tables.find(row=>row.schema==='net' && row.name==='_http_response');
  assert.equal(response.schema_usage,false);
  assert.ok(response.sources.some(row=>row.grantee==='PUBLIC' && row.privilege==='SELECT'));
  assert.equal(report.schemas.find(row=>row.schema==='net').usage,false);
  assert.ok(report.functions.some(row=>row.schema==='net' && row.schema_usage===false));
  assert.ok(!JSON.stringify(report).includes('fixture only'));
});
