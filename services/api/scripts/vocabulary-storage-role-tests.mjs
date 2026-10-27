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
const provision = readFileSync(new URL('../../../infra/ops/vocabulary-storage-role.sql', import.meta.url), 'utf8');
const verify = readFileSync(new URL('../../../infra/ops/verify-vocabulary-storage-role.sql', import.meta.url), 'utf8');
const valid = `vocabulary/${'a'.repeat(64)}-${'b'.repeat(64)}.mp3`;
let port;

function psql(sql) {
  return spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-h', socket, '-p', String(port), '-U', 'postgres', '-d', 'postgres'],
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
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -k ${socket} -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
  success(`
    CREATE ROLE authenticator NOINHERIT LOGIN;
    CREATE ROLE supabase_storage_admin NOINHERIT LOGIN;
    CREATE ROLE anon; CREATE ROLE authenticated;
    GRANT authenticator TO supabase_storage_admin;
    CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
    CREATE SCHEMA auth;
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
  if (existsSync(data)) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
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
