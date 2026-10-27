-- Read-only production verification. Contains no signing keys or object writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
DO $verify$
DECLARE
  target oid := to_regrole('ops_vocabulary_storage');
  item record;
  privilege text;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'vocabulary_storage_role_missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = target
    AND shobj_description(r.oid, 'pg_authid') = 'ICAO Ops immutable vocabulary audio v1'
    AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcanlogin OR r.rolinherit
      OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)) THEN
    RAISE EXCEPTION 'vocabulary_storage_role_attributes_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = target) OR
    EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = target
      AND (member <> 'authenticator'::regrole OR admin_option)) OR
    NOT pg_has_role('supabase_storage_admin', target, 'MEMBER') THEN
    RAISE EXCEPTION 'vocabulary_storage_role_membership_invalid';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('storage.objects'::regclass,
      'storage.buckets'::regclass) AND relrowsecurity AND relowner <> target) <> 2 THEN
    RAISE EXCEPTION 'vocabulary_storage_rls_invalid';
  END IF;
  FOR item IN SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE',
      'TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(target, item.oid, privilege) AND NOT
        (item.nspname = 'storage' AND
          ((item.relname = 'objects' AND privilege IN ('SELECT','INSERT')) OR
           (item.relname = 'buckets' AND privilege = 'SELECT'))) THEN
        RAISE EXCEPTION 'vocabulary_storage_extra_privilege: %.% %',
          item.nspname, item.relname, privilege;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_schema_privilege(target, 'storage', 'USAGE') OR
    NOT has_table_privilege(target, 'storage.objects', 'SELECT') OR
    NOT has_table_privilege(target, 'storage.objects', 'INSERT') OR
    NOT has_table_privilege(target, 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'vocabulary_storage_required_privilege_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','auth') AND p.prosecdef
      AND has_function_privilege(target, p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'vocabulary_storage_unexpected_definer_access';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
    AND polname IN ('ops_vocabulary_scope','ops_vocabulary_read','ops_vocabulary_insert',
      'ops_vocabulary_no_update','ops_vocabulary_no_delete') AND target = ANY(polroles)) <> 5 OR
     (SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.buckets'::regclass
    AND polname IN ('ops_vocabulary_bucket_scope','ops_vocabulary_bucket_read',
      'ops_vocabulary_bucket_no_update','ops_vocabulary_bucket_no_delete')
    AND target = ANY(polroles)) <> 4 THEN
    RAISE EXCEPTION 'vocabulary_storage_policies_missing';
  END IF;
  -- Compare command, permissive/restrictive mode and expressions, rather than
  -- accepting policies merely because their names still exist.
  FOR item IN SELECT * FROM (VALUES
    ('objects','ops_vocabulary_scope','*',false,
      'bucket_id=''question-bank-assets''::textANDname~''^vocabulary/[a-f0-9]{64}-[a-f0-9]{64}[.]mp3$''::text',
      'bucket_id=''question-bank-assets''::textANDname~''^vocabulary/[a-f0-9]{64}-[a-f0-9]{64}[.]mp3$''::text'),
    ('objects','ops_vocabulary_read','r',true,'true',NULL),
    ('objects','ops_vocabulary_insert','a',true,NULL,'true'),
    ('objects','ops_vocabulary_no_update','w',false,'false','false'),
    ('objects','ops_vocabulary_no_delete','d',false,'false',NULL),
    ('buckets','ops_vocabulary_bucket_scope','*',false,'id=''question-bank-assets''::text','false'),
    ('buckets','ops_vocabulary_bucket_read','r',true,'true',NULL),
    ('buckets','ops_vocabulary_bucket_no_update','w',false,'false','false'),
    ('buckets','ops_vocabulary_bucket_no_delete','d',false,'false',NULL)
  ) AS expected(table_name,policy_name,command,permissive,qual,check_expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy p
      WHERE p.polrelid = to_regclass('storage.' || item.table_name)
        AND p.polname = item.policy_name AND p.polcmd::text = item.command
        AND p.polpermissive = item.permissive AND p.polroles = ARRAY[target]
        AND regexp_replace(pg_get_expr(p.polqual,p.polrelid), '[[:space:]()]', '', 'g')
          IS NOT DISTINCT FROM item.qual
        AND regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid), '[[:space:]()]', '', 'g')
          IS NOT DISTINCT FROM item.check_expr) THEN
      RAISE EXCEPTION 'vocabulary_storage_policy_definition_invalid: %', item.policy_name;
    END IF;
  END LOOP;
END
$verify$;
SET LOCAL ROLE ops_vocabulary_storage;
SET LOCAL row_security = on;
DO $visibility$
BEGIN
  IF (SELECT count(*) FROM storage.buckets) <> 1 OR
    EXISTS (SELECT 1 FROM storage.buckets WHERE id <> 'question-bank-assets') THEN
    RAISE EXCEPTION 'vocabulary_storage_bucket_scope_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id <> 'question-bank-assets'
      OR name !~ '^vocabulary/[a-f0-9]{64}-[a-f0-9]{64}[.]mp3$') THEN
    RAISE EXCEPTION 'vocabulary_storage_object_scope_invalid';
  END IF;
END
$visibility$;
RESET ROLE;
SELECT 'vocabulary_storage_role_verified_read_only' AS result;
COMMIT;
