-- OPTIONAL, separately approved system ACL change. Never called by app/deploy.
-- Review the current callers/ACL snapshot and approve this exact scope first.
-- Execute as the existing supabase_admin superuser from approved clean main.
-- No table/function ACL, RLS, data, or existing explicit schema grant is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('ops_vocabulary_net_scope'));
DO $guard$
DECLARE
  name text;
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'vocabulary_storage_superuser_executor_required';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 OR
     current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'vocabulary_net_reviewed_pg17_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace
    WHERE nspname = 'net' AND nspowner = to_regrole('supabase_admin')) OR
    to_regrole('ops_vocabulary_storage') IS NULL THEN
    RAISE EXCEPTION 'vocabulary_net_reviewed_owners_required';
  END IF;
  -- All five already have direct USAGE in the reviewed production snapshot.
  -- Do not manufacture access for unverified callers or grant every role.
  FOREACH name IN ARRAY ARRAY['postgres','anon','authenticated','service_role',
    'supabase_functions_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
      aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
      WHERE n.nspname = 'net' AND acl.grantee = to_regrole(name)
        AND acl.privilege_type = 'USAGE') THEN
      RAISE EXCEPTION 'vocabulary_net_existing_explicit_usage_missing: %', name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_auth_members
      WHERE member = 'ops_vocabulary_storage'::regrole) OR
    EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
      aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
      WHERE n.nspname = 'net' AND acl.grantee = 'ops_vocabulary_storage'::regrole) THEN
    RAISE EXCEPTION 'vocabulary_net_unexpected_vocabulary_access';
  END IF;
END
$guard$;
SELECT 'before' AS phase,nspname,nspacl FROM pg_namespace WHERE nspname = 'net';

REVOKE USAGE ON SCHEMA net FROM PUBLIC;

DO $verify$
DECLARE
  name text;
BEGIN
  IF has_schema_privilege('ops_vocabulary_storage','net','USAGE') THEN
    RAISE EXCEPTION 'vocabulary_net_scope_not_closed';
  END IF;
  FOREACH name IN ARRAY ARRAY['postgres','anon','authenticated','service_role',
    'supabase_functions_admin','supabase_admin'] LOOP
    IF NOT has_schema_privilege(name,'net','USAGE') THEN
      RAISE EXCEPTION 'vocabulary_net_existing_caller_lost_usage: %', name;
    END IF;
  END LOOP;
END
$verify$;
SELECT 'after' AS phase,nspname,nspacl FROM pg_namespace WHERE nspname = 'net';
COMMIT;
-- Next run verify-vocabulary-storage-role.sql and the approved HTTP/Ops checks.
-- If verification fails, do not sign a JWT. Explicit rollback for this one
-- reviewed delta is GRANT USAGE ON SCHEMA net TO PUBLIC (separately authorized).
