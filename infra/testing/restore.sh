#!/bin/sh
# Restore a snapshot into the separate testing PostgreSQL container only.
set -eu
umask 077
backup=${1:?usage: restore.sh /opt/icao/backups/.../icao-....dump}
case "$backup" in /opt/icao/backups/*/icao-*.dump) ;; *) echo 'unexpected backup path' >&2; exit 1 ;; esac
root=/opt/icao/testing
test ! -e "$root/restore-complete.json"
exec 9>/run/lock/icao-testing-restore.lock
flock -n 9
(cd "$(dirname "$backup")" && sha256sum -c "$(basename "$backup").sha256")
test "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' icao-testing-db)" = icao-testing
test "$(docker network inspect -f '{{.Internal}}' icao-testing)" = true
# Read only role NAMES needed by ownership ACLs; do not export role passwords.
python3 - <<'PYROLES'
import subprocess
q = ['psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', "SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%'"]
source = set(subprocess.check_output(['docker','exec','supabase-db',*q], text=True).splitlines())
target = set(subprocess.check_output(['docker','exec','icao-testing-db',*q], text=True).splitlines())
for role in sorted(source - target):
    sql = 'CREATE ROLE "' + role.replace('"', '""') + '" NOLOGIN;'
    subprocess.run(['docker','exec','-i','icao-testing-db','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'], input=sql, text=True, check=True)
PYROLES
# The base image does not initialize a password for every service role.
# Set fresh testing passwords without exporting production credentials.
python3 - <<'PYPASSWORD'
import json
import subprocess
from pathlib import Path
password = json.loads(Path('/opt/icao/testing/credentials.json').read_text())['postgresPassword']
assert len(password) == 64 and all(c in '0123456789abcdef' for c in password)
sql = '\n'.join("ALTER ROLE " + role + " LOGIN PASSWORD '" + password + "';" for role in
    ['postgres', 'authenticator', 'supabase_auth_admin', 'supabase_storage_admin'])
subprocess.run(['docker','exec','-i','icao-testing-db','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'], input=sql, text=True, check=True, stdout=subprocess.DEVNULL)
PYPASSWORD
# No production DB connection is used for restore. Refuse replacement of an existing target.
docker exec icao-testing-db createdb -U supabase_admin -T template0 icao_testing
docker exec -i icao-testing-db pg_restore -U supabase_admin -d icao_testing --exit-on-error < "$backup"
# Restored sessions and pending external dispatches must not be replayed.
# Only TESTING data is modified; production users keep their active sessions.
docker exec -i icao-testing-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d icao_testing <<'SQL'
GRANT authenticator TO supabase_storage_admin WITH INHERIT FALSE, SET TRUE;
GRANT anon, authenticated, service_role, ops_vocabulary_storage TO authenticator WITH INHERIT FALSE, SET TRUE;
TRUNCATE auth.sessions CASCADE;
TRUNCATE auth.refresh_tokens;
SQL
# Preserve a distinct file copy, never mount or hard-link the production tree.
install -d -m 700 "$root/storage"
cp -a /opt/icao/runtime/supabase/volumes/storage/. "$root/storage/"
# Runtime container uid must traverse its mounted root, host parent stays 0700.
chmod --reference=/opt/icao/runtime/supabase/volumes/storage "$root/storage"
docker exec icao-testing-db psql -U supabase_admin -d icao_testing -Atc "SELECT json_build_object('authUsers',(SELECT count(*) FROM auth.users),'learningRecords',(SELECT count(*) FROM public.learning_records),'cardStates',(SELECT count(*) FROM public.user_card_states),'migrations',(SELECT count(*) FROM drizzle.__drizzle_migrations),'database',current_database());" > "$root/restore-complete.json"
printf 'Independent database and storage restored; evidence: %s/restore-complete.json\n' "$root"
