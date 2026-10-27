-- Catalog metadata only: no request/response rows, query texts, environment
-- values or signing keys. This report does not change any privileges.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH target AS (SELECT oid FROM pg_roles WHERE rolname = 'ops_vocabulary_storage'),
tables AS (
  SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
    pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,
    has_schema_privilege(t.oid,n.oid,'USAGE') AS schema_usage,
    (SELECT jsonb_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type)
      FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE has_table_privilege(t.oid,c.oid,a.privilege_type)) AS privileges,
    (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC'
        ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),
        'privilege',a.privilege_type,'grantable',a.is_grantable)
        ORDER BY a.grantee,a.privilege_type)
      FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE a.grantee=0 OR a.grantee=t.oid OR
        CASE WHEN a.grantee>0 THEN pg_has_role(t.oid,a.grantee,'USAGE') ELSE false END) AS sources
  FROM target t CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_%' AND has_table_privilege(t.oid,c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
), sequences AS (
  SELECT n.nspname AS schema,c.relname AS name,
    has_schema_privilege(t.oid,n.oid,'USAGE') AS schema_usage,
    has_sequence_privilege(t.oid,c.oid,'USAGE') AS usage,
    has_sequence_privilege(t.oid,c.oid,'SELECT') AS select,
    has_sequence_privilege(t.oid,c.oid,'UPDATE') AS update,
    (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC'
        ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type)
        ORDER BY a.grantee,a.privilege_type)
      FROM aclexplode(COALESCE(c.relacl,acldefault('S',c.relowner))) a
      WHERE a.grantee=0 OR a.grantee=t.oid) AS sources
  FROM target t CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='S' AND n.nspname NOT LIKE 'pg_%'
    AND has_sequence_privilege(t.oid,c.oid,'USAGE,SELECT,UPDATE')
), functions AS (
  SELECT n.nspname AS schema,p.oid::regprocedure::text AS name,
    pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
    has_schema_privilege(t.oid,n.oid,'USAGE') AS schema_usage,
    (SELECT jsonb_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
      FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR a.grantee=t.oid)) AS sources
  FROM target t CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
    AND has_function_privilege(t.oid,p.oid,'EXECUTE')
)
SELECT jsonb_pretty(jsonb_build_object(
  'postgresVersion',current_setting('server_version'),
  'role','ops_vocabulary_storage',
  'roleExists',EXISTS (SELECT 1 FROM target),
  'schemas',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,
      'usage',has_schema_privilege(t.oid,n.oid,'USAGE'),
      'create',has_schema_privilege(t.oid,n.oid,'CREATE')) ORDER BY n.nspname)
    FROM target t CROSS JOIN pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_%'),
  'tables',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.schema,x.name) FROM tables x),'[]'::jsonb),
  'sequences',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.schema,x.name) FROM sequences x),'[]'::jsonb),
  'functions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.schema,x.name) FROM functions x),'[]'::jsonb)
));
COMMIT;
