-- Explicit production preparation, NOT an application migration or startup hook.
-- Run only from approved main with psql -X -v ON_ERROR_STOP=1 -f this-file.
-- No credentials are created or read here. Other roles/policies are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('ops_vocabulary_storage_provision'));

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    RAISE EXCEPTION 'vocabulary_storage_connection_roles_missing';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
      AND c.relkind = 'r' AND c.relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'vocabulary_storage_rls_required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_vocabulary_storage') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles r
      WHERE r.rolname = 'ops_vocabulary_storage'
      AND shobj_description(r.oid, 'pg_authid') = 'ICAO Ops immutable vocabulary audio v1'
      AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcanlogin OR r.rolinherit
        OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)) THEN
      RAISE EXCEPTION 'vocabulary_storage_existing_role_conflict';
    END IF;
  ELSE
    CREATE ROLE ops_vocabulary_storage NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
    COMMENT ON ROLE ops_vocabulary_storage IS 'ICAO Ops immutable vocabulary audio v1';
  END IF;
  -- Fail rather than silently removing or inheriting unrelated access.
  IF EXISTS (SELECT 1 FROM pg_auth_members a
    WHERE a.member = 'ops_vocabulary_storage'::regrole) OR
    EXISTS (SELECT 1 FROM pg_auth_members a
    WHERE a.roleid = 'ops_vocabulary_storage'::regrole
      AND (a.member <> 'authenticator'::regrole OR a.admin_option)) THEN
    RAISE EXCEPTION 'vocabulary_storage_unexpected_role_membership';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_table_privilege('ops_vocabulary_storage', c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
    RAISE EXCEPTION 'vocabulary_storage_unexpected_business_access';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'auth') AND p.prosecdef
      AND has_function_privilege('ops_vocabulary_storage', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'vocabulary_storage_unexpected_definer_access';
  END IF;
END
$guard$;

-- Storage connects as supabase_storage_admin, already a member of authenticator.
-- NOINHERIT on the connection roles requires Storage's per-request SET ROLE.
GRANT ops_vocabulary_storage TO authenticator;
GRANT USAGE ON SCHEMA storage TO ops_vocabulary_storage;
REVOKE ALL ON storage.objects, storage.buckets FROM ops_vocabulary_storage;
GRANT SELECT, INSERT ON storage.objects TO ops_vocabulary_storage;
GRANT SELECT ON storage.buckets TO ops_vocabulary_storage;

DROP POLICY IF EXISTS ops_vocabulary_scope ON storage.objects;
CREATE POLICY ops_vocabulary_scope ON storage.objects AS RESTRICTIVE FOR ALL
  TO ops_vocabulary_storage
  USING (bucket_id = 'question-bank-assets'
    AND name ~ '^vocabulary/[a-f0-9]{64}-[a-f0-9]{64}[.]mp3$')
  WITH CHECK (bucket_id = 'question-bank-assets'
    AND name ~ '^vocabulary/[a-f0-9]{64}-[a-f0-9]{64}[.]mp3$');
DROP POLICY IF EXISTS ops_vocabulary_read ON storage.objects;
CREATE POLICY ops_vocabulary_read ON storage.objects FOR SELECT
  TO ops_vocabulary_storage USING (true);
DROP POLICY IF EXISTS ops_vocabulary_insert ON storage.objects;
CREATE POLICY ops_vocabulary_insert ON storage.objects FOR INSERT
  TO ops_vocabulary_storage WITH CHECK (true);
-- Also deny mutation if a pre-existing/future PUBLIC policy/grant is broad.
DROP POLICY IF EXISTS ops_vocabulary_no_update ON storage.objects;
CREATE POLICY ops_vocabulary_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE
  TO ops_vocabulary_storage USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS ops_vocabulary_no_delete ON storage.objects;
CREATE POLICY ops_vocabulary_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE
  TO ops_vocabulary_storage USING (false);

DROP POLICY IF EXISTS ops_vocabulary_bucket_scope ON storage.buckets;
CREATE POLICY ops_vocabulary_bucket_scope ON storage.buckets AS RESTRICTIVE FOR ALL
  TO ops_vocabulary_storage USING (id = 'question-bank-assets')
  WITH CHECK (false);
DROP POLICY IF EXISTS ops_vocabulary_bucket_read ON storage.buckets;
CREATE POLICY ops_vocabulary_bucket_read ON storage.buckets FOR SELECT
  TO ops_vocabulary_storage USING (true);
DROP POLICY IF EXISTS ops_vocabulary_bucket_no_update ON storage.buckets;
CREATE POLICY ops_vocabulary_bucket_no_update ON storage.buckets AS RESTRICTIVE FOR UPDATE
  TO ops_vocabulary_storage USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS ops_vocabulary_bucket_no_delete ON storage.buckets;
CREATE POLICY ops_vocabulary_bucket_no_delete ON storage.buckets AS RESTRICTIVE FOR DELETE
  TO ops_vocabulary_storage USING (false);

DO $connection$
BEGIN
  IF NOT pg_has_role('supabase_storage_admin', 'ops_vocabulary_storage', 'MEMBER') THEN
    RAISE EXCEPTION 'vocabulary_storage_connection_cannot_set_role';
  END IF;
END
$connection$;
COMMIT;
