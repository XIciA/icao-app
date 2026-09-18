#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$SCRIPT_DIR/lib/release-common.sh"

SOURCE_ROOT=${ICAO_MIGRATION_REHEARSAL_SOURCE_ROOT:-$PROJECT_ROOT}
SOURCE_ROOT=$(CDPATH= cd -- "$SOURCE_ROOT" && pwd)
SOURCE_GIT_ROOT=$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$SOURCE_GIT_ROOT" != "$SOURCE_ROOT" ]; then
  echo 'ICAO_MIGRATION_REHEARSAL_SOURCE_ROOT must be the root of a Git worktree.' >&2
  exit 1
fi
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"

require_command ssh
require_command scp
require_command gzip
require_command mktemp
require_command openssl
require_command shasum

ECS_HOST=${ICAO_ECS_HOST:-47.108.90.19}
ECS_USER=${ICAO_ECS_USER:-root}
SSH_KEY=${ICAO_ECS_SSH_KEY:-${HOME:?}/.ssh/icao_app_codex}
BUILD_NPM_REGISTRY=${ICAO_API_BUILD_NPM_REGISTRY:-https://registry.npmmirror.com}
require_public_https_url ICAO_API_BUILD_NPM_REGISTRY "$BUILD_NPM_REGISTRY"
if [ ! -r "$SSH_KEY" ]; then
  echo "Project SSH key is not readable: $SSH_KEY" >&2
  exit 1
fi

SOURCE_SHA=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
SOURCE_ID=$(printf '%.12s' "$SOURCE_SHA")
UPLOAD_TOKEN=$(openssl rand -hex 16)
case "$SOURCE_SHA:$UPLOAD_TOKEN" in
  *[!A-Fa-f0-9:]*) echo 'Migration rehearsal source or upload identity is invalid.' >&2; exit 1 ;;
esac

LOCAL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/icao-migration-rehearsal.XXXXXX")
ARCHIVE=$LOCAL_DIR/source.tar.gz
REMOTE_CLEANUP_ARMED=0
REMOTE_UPLOAD=
REMOTE_CHECKSUM=
cleanup_local_resources() (
  set +e
  cleanup_failed=0
  rm -rf "$LOCAL_DIR" || cleanup_failed=1
  if [ "$REMOTE_CLEANUP_ARMED" = 1 ]; then
    ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
      "rm -f '$REMOTE_UPLOAD' '$REMOTE_CHECKSUM'" >/dev/null 2>&1 || cleanup_failed=1
  fi
  exit "$cleanup_failed"
)
cleanup_local_on_exit() {
  original_status=$?
  trap - EXIT
  if ! cleanup_local_resources; then original_status=1; fi
  exit "$original_status"
}
trap cleanup_local_on_exit EXIT
trap 'exit 1' HUP INT TERM

(
  cd "$SOURCE_ROOT"
  git archive --format=tar "$SOURCE_SHA" \
    package.json pnpm-lock.yaml pnpm-workspace.yaml patches \
    modules/icao-distribution-environment modules/icao-wechat-auth \
    packages/contracts services/api \
    content/vocabulary content/app-content/text.json content/question-banks/opi-hotspots.json infra/api \
    | gzip -n > "$ARCHIVE"
)
node "$SOURCE_ROOT/tools/check-mainline-release.mjs" --root "$SOURCE_ROOT"
test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_SHA"
ARCHIVE_SHA=$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')

REMOTE_ROOT=/opt/icao/runtime/migration-rehearsals
REMOTE_UPLOAD=$REMOTE_ROOT/uploads/source-$SOURCE_ID-$UPLOAD_TOKEN.tar.gz
REMOTE_CHECKSUM=$REMOTE_UPLOAD.sha256
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$REMOTE_UPLOAD")" > "$ARCHIVE.sha256"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" \
  "install -d -m 700 '$REMOTE_ROOT' '$REMOTE_ROOT/uploads' '$REMOTE_ROOT/evidence'"
REMOTE_CLEANUP_ARMED=1
scp -i "$SSH_KEY" -q "$ARCHIVE" "$ECS_USER@$ECS_HOST:$REMOTE_UPLOAD"
scp -i "$SSH_KEY" -q "$ARCHIVE.sha256" "$ECS_USER@$ECS_HOST:$REMOTE_CHECKSUM"

ssh -i "$SSH_KEY" -o BatchMode=yes "$ECS_USER@$ECS_HOST" sh -s -- \
  "$SOURCE_SHA" "$ARCHIVE_SHA" "$UPLOAD_TOKEN" "$BUILD_NPM_REGISTRY" <<'REMOTE'
set -eu
umask 077

source_sha=$1
archive_sha=$2
upload_token=$3
build_npm_registry=$4
source_id=$(printf '%.12s' "$source_sha")
root=/opt/icao/runtime/migration-rehearsals
upload=$root/uploads/source-$source_id-$upload_token.tar.gz
checksum=$upload.sha256
work_dir=$root/.work-$source_id-$upload_token
evidence_dir=$root/evidence
database_name=icao_rehearsal_${source_id}_${upload_token}
image=icao-api:migration-rehearsal-$source_id
runtime_env=/opt/icao/runtime/api/.env
database_env=/run/icao-migration-rehearsal-$source_id-$upload_token.env
database_created=0
postgres_password_loaded=0
evidence_partial=
cleanup_verified=0
stage=prepare

case "$source_sha:$archive_sha:$upload_token" in
  *[!A-Fa-f0-9:]*) echo 'remote migration rehearsal identity is invalid' >&2; exit 1 ;;
esac
case "$database_name" in
  icao_rehearsal_*)
    database_suffix=${database_name#icao_rehearsal_}
    case "$database_suffix" in
      ''|*[!A-Fa-f0-9_]*) echo 'isolated database name escaped its protected prefix' >&2; exit 1 ;;
    esac
    ;;
  *) echo 'isolated database name escaped its protected prefix' >&2; exit 1 ;;
esac
case "$work_dir" in
  "$root"/.work-*) ;;
  *) echo 'migration rehearsal work path escaped its root' >&2; exit 1 ;;
esac
case "$database_env" in
  /run/icao-migration-rehearsal-*.env) ;;
  *) echo 'migration rehearsal environment path escaped tmpfs' >&2; exit 1 ;;
esac

exec 9>/run/lock/icao-production-migration-rehearsal.lock
if ! flock -n 9; then
  echo 'another production migration rehearsal is already running' >&2
  exit 1
fi

load_postgres_password() {
  if [ "$postgres_password_loaded" = 0 ]; then
    POSTGRES_PASSWORD=$(docker exec supabase-db printenv POSTGRES_PASSWORD)
    test -n "$POSTGRES_PASSWORD"
    PGPASSWORD=$POSTGRES_PASSWORD
    export POSTGRES_PASSWORD PGPASSWORD
    postgres_password_loaded=1
  fi
}

drop_created_database() {
  load_postgres_password
  if ! existing=$(docker run --rm --network supabase_default \
    -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'printf "%s\n" "select count(*) from pg_database where datname = :'\''db_name'\''" | psql -X -qAt -v ON_ERROR_STOP=1 -v db_name="$RESTORE_DB_NAME" -h db -U postgres -d postgres'); then
    echo "could not inspect isolated rehearsal database before cleanup: $database_name" >&2
    return 1
  fi
  case "$existing" in
    0) database_created=0; return 0 ;;
    1) ;;
    *) echo "isolated rehearsal database lookup returned an invalid count for: $database_name" >&2; return 1 ;;
  esac
  database_drop_attempt=1
  database_dropped=0
  while [ "$database_drop_attempt" -le 3 ]; do
    if docker run --rm --network supabase_default \
      -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
      supabase/postgres:17.6.1.136 \
      sh -ec 'dropdb -h db -U postgres --maintenance-db=postgres --if-exists --force "$RESTORE_DB_NAME"'; then
      database_dropped=1
      break
    fi
    echo "isolated rehearsal database cleanup attempt $database_drop_attempt failed for: $database_name" >&2
    database_drop_attempt=$((database_drop_attempt + 1))
    if [ "$database_drop_attempt" -le 3 ]; then sleep 1; fi
  done
  if [ "$database_dropped" != 1 ]; then
    echo "could not remove isolated rehearsal database after 3 attempts: $database_name" >&2
    return 1
  fi
  if ! remaining=$(docker run --rm --network supabase_default \
    -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'printf "%s\n" "select count(*) from pg_database where datname = :'\''db_name'\''" | psql -X -qAt -v ON_ERROR_STOP=1 -v db_name="$RESTORE_DB_NAME" -h db -U postgres -d postgres'); then
    echo "could not verify isolated rehearsal database cleanup: $database_name" >&2
    return 1
  fi
  if [ "$remaining" != 0 ]; then
    echo "isolated rehearsal database still exists after cleanup: $database_name" >&2
    return 1
  fi
  database_created=0
}

# BEGIN migration-rehearsal-image-cleanup
cleanup_rehearsal_image() {
  if ! listed_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image"); then
    echo "could not list the isolated rehearsal image during cleanup: $image" >&2
    return 1
  fi
  case "$listed_images" in
    '') return 0 ;;
    "$image") ;;
    *) echo "isolated rehearsal image lookup returned unexpected results for: $image" >&2; return 1 ;;
  esac
  if ! docker image inspect "$image" >/dev/null; then
    echo "could not inspect the existing isolated rehearsal image during cleanup: $image" >&2
    return 1
  fi
  if ! docker image rm "$image" >/dev/null; then
    echo "could not remove the isolated rehearsal image during cleanup: $image" >&2
    return 1
  fi
  if ! remaining_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image"); then
    echo "could not verify isolated rehearsal image cleanup: $image" >&2
    return 1
  fi
  if [ -n "$remaining_images" ]; then
    echo "isolated rehearsal image still exists after cleanup: $image" >&2
    return 1
  fi
}
# END migration-rehearsal-image-cleanup

cleanup_files() (
  set +e
  cleanup_failed=0
  rm -rf "$work_dir" || cleanup_failed=1
  rm -f "$database_env" || cleanup_failed=1
  if [ -n "$evidence_partial" ]; then rm -f "$evidence_partial" || cleanup_failed=1; fi
  rm -f "$upload" "$checksum" || cleanup_failed=1
  if ! cleanup_rehearsal_image; then cleanup_failed=1; fi
  for cleanup_path in "$work_dir" "$database_env" "$upload" "$checksum"; do
    if [ -e "$cleanup_path" ] || [ -L "$cleanup_path" ]; then
      echo "migration rehearsal path still exists after cleanup: $cleanup_path" >&2
      cleanup_failed=1
    fi
  done
  if [ -n "$evidence_partial" ] && { [ -e "$evidence_partial" ] || [ -L "$evidence_partial" ]; }; then
    echo "migration rehearsal partial evidence still exists after cleanup: $evidence_partial" >&2
    cleanup_failed=1
  fi
  exit "$cleanup_failed"
)

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  if [ "$original_status" -ne 0 ]; then
    printf 'migration_rehearsal_failed stage=%s exit=%s\n' "$stage" "$original_status" >&2
  fi
  cleanup_failed=0
  if ! drop_created_database; then cleanup_failed=1; fi
  if ! cleanup_files; then
    echo 'migration rehearsal file or image cleanup failed' >&2
    cleanup_failed=1
  fi
  if [ "$postgres_password_loaded" = 1 ]; then unset POSTGRES_PASSWORD PGPASSWORD; fi
  if [ "$cleanup_failed" -ne 0 ]; then
    echo 'migration rehearsal cleanup failed; success evidence was not emitted' >&2
    exit 1
  fi
  exit "$original_status"
}
trap cleanup_on_exit EXIT
trap 'exit 1' HUP INT TERM

# A previous SIGKILL cannot run traps. With the exclusive lock held there is no
# legitimate concurrent rehearsal, so every database with this private prefix
# is an orphan owned by this workflow and can be removed before proceeding.
load_postgres_password
orphan_databases=$(docker run --rm --network supabase_default \
  -e PGPASSWORD supabase/postgres:17.6.1.136 \
  sh -ec "psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d postgres -c \"select datname from pg_database where datname ~ '^icao_rehearsal_[0-9A-Fa-f_]+$' order by datname\"")
for orphan_database in $orphan_databases; do
  case "$orphan_database" in
    icao_rehearsal_*)
      orphan_suffix=${orphan_database#icao_rehearsal_}
      case "$orphan_suffix" in
        ''|*[!A-Fa-f0-9_]*) echo 'unsafe orphan rehearsal database name' >&2; exit 1 ;;
      esac
      ;;
    *) echo 'unsafe orphan rehearsal database prefix' >&2; exit 1 ;;
  esac
  docker run --rm --network supabase_default \
    -e PGPASSWORD -e RESTORE_DB_NAME="$orphan_database" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'dropdb -h db -U supabase_admin --if-exists --force "$RESTORE_DB_NAME"'
done
remaining_orphans=$(docker run --rm --network supabase_default \
  -e PGPASSWORD supabase/postgres:17.6.1.136 \
  sh -ec "psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d postgres -c \"select count(*) from pg_database where datname ~ '^icao_rehearsal_[0-9A-Fa-f_]+$'\"")
test "$remaining_orphans" = 0
find "$root/uploads" -maxdepth 1 -type f -name 'source-*.tar.gz*' -mtime +1 -delete
find "$root" -maxdepth 1 -type d -name '.work-*' -mtime +1 -exec rm -rf -- {} +
find /run -maxdepth 1 -type f -name 'icao-migration-rehearsal-*.env' -mmin +60 -delete
stale_images=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^icao-api:migration-rehearsal-' || true)
for stale_image in $stale_images; do
  case "$stale_image" in
    icao-api:migration-rehearsal-*)
      image_suffix=${stale_image#icao-api:migration-rehearsal-}
      case "$image_suffix" in
        ''|*[!A-Fa-f0-9]*) echo 'unsafe stale rehearsal image name' >&2; exit 1 ;;
      esac
      ;;
    *) echo 'unsafe stale rehearsal image prefix' >&2; exit 1 ;;
  esac
  docker image rm "$stale_image" >/dev/null
done

expected_checksum_line="$archive_sha  $(basename "$upload")"
actual_checksum_line=$(cat "$checksum")
test "$actual_checksum_line" = "$expected_checksum_line"
(
  cd "$(dirname "$upload")"
  sha256sum -c "$(basename "$checksum")"
)

test -x /opt/icao/runtime/backup-tools/current/backup-postgres.sh
backup=$(/bin/sh /opt/icao/runtime/backup-tools/current/backup-postgres.sh)
test -n "$backup"
test -f "$backup"
backup_name=$(basename "$backup")
case "$backup_name" in
  icao-*.dump) ;;
  *) echo 'fresh production backup name is invalid' >&2; exit 1 ;;
esac
backup_sha=$(sha256sum "$backup" | awk '{ print $1 }')
case "$backup_sha" in
  ''|*[!A-Fa-f0-9]*) echo 'production backup SHA is invalid' >&2; exit 1 ;;
esac
expected_backup_checksum_line="$backup_sha  $backup_name"
actual_backup_checksum_line=$(cat "$backup.sha256")
test "$actual_backup_checksum_line" = "$expected_backup_checksum_line"
backup_mtime=$(stat -c %Y "$backup")
backup_age=$(( $(date +%s) - backup_mtime ))
test "$backup_age" -ge 0
test "$backup_age" -le 900

load_postgres_password
backup_bytes=$(stat -c %s "$backup")
database_bytes=$(docker run --rm --network supabase_default \
  -e PGPASSWORD supabase/postgres:17.6.1.136 \
  sh -ec "psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d postgres -c 'select pg_database_size(current_database())'")
available_bytes=$(df -PB1 /opt/icao | awk 'NR == 2 { print $4 }')
required_bytes=$((database_bytes * 2 + backup_bytes * 2 + 8 * 1024 * 1024 * 1024))
test "$available_bytes" -ge "$required_bytes"

test -f "$runtime_env"
install -d -m 700 "$work_dir"
tar -xzf "$upload" -C "$work_dir"
stage=build
docker build \
  --build-arg "ICAO_API_RELEASE_ID=migration-rehearsal-$source_id" \
  --build-arg "ICAO_NPM_REGISTRY=$build_npm_registry" \
  -t "$image" -f "$work_dir/infra/api/Dockerfile" "$work_dir"

stage=create_isolated_database
docker run --rm --network supabase_default \
  -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec 'createdb -h db -U supabase_admin --maintenance-db=postgres --owner=postgres "$RESTORE_DB_NAME"'
database_created=1

stage=restore_backup
docker run --rm --network supabase_default \
  -v "$backup:/backup.dump:ro" -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec 'pg_restore -h db -U supabase_admin -d "$RESTORE_DB_NAME" --exit-on-error /backup.dump'

stage=restored_database_contract
database_contract=$(docker run --rm --network supabase_default \
  -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
  supabase/postgres:17.6.1.136 \
  sh -ec 'printf "%s\n" "select pg_get_userbyid(datdba), has_database_privilege('\''postgres'\'', datname, '\''CONNECT'\''), has_database_privilege('\''postgres'\'', datname, '\''CREATE'\''), has_database_privilege('\''postgres'\'', datname, '\''TEMPORARY'\''), (select pg_get_userbyid(nspowner) from pg_namespace where nspname = '\''drizzle'\'') from pg_database where datname = :'\''db_name'\''" | psql -X -qAt -v ON_ERROR_STOP=1 -v db_name="$RESTORE_DB_NAME" -h db -U postgres -d "$RESTORE_DB_NAME"')
test "$database_contract" = 'postgres|t|t|t|postgres'

stage=restored_database_disk_space
available_after_restore=$(df -PB1 /opt/icao | awk 'NR == 2 { print $4 }')
test "$available_after_restore" -ge $((5 * 1024 * 1024 * 1024))

docker run --rm --network supabase_default --env-file "$runtime_env" \
  -e RESTORE_DB_NAME="$database_name" "$image" \
  node -e '
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${process.env.RESTORE_DB_NAME}`;
    process.stdout.write(`DATABASE_URL=${url.toString()}\n`);
  ' > "$database_env"
chmod 600 "$database_env"

query_scalar() {
  sql=$1
  docker run --rm --network supabase_default \
    -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" -e REHEARSAL_SQL="$sql" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'psql -X -qAt -v ON_ERROR_STOP=1 -h db -U supabase_admin -d "$RESTORE_DB_NAME" -c "$REHEARSAL_SQL"'
}

run_sql_file() {
  sql_file=$1
  docker run --rm --network supabase_default \
    -v "$sql_file:/rehearsal.sql:ro" -e PGPASSWORD -e RESTORE_DB_NAME="$database_name" \
    -e APPLY_0042="$apply_0042" -e APPLY_0045="$apply_0045" -e APPLY_0050="$apply_0050" \
    supabase/postgres:17.6.1.136 \
    sh -ec 'psql -X -q -v ON_ERROR_STOP=1 -h db -U supabase_admin -d "$RESTORE_DB_NAME" -v apply_0042="$APPLY_0042" -v apply_0045="$APPLY_0045" -v apply_0050="$APPLY_0050" -f /rehearsal.sql'
}

stage=pre_plan
pre_plan=$work_dir/pre-plan.json
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json > "$pre_plan"
pre_summary=$(docker run --rm -v "$pre_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.safe || p.driftCount !== 0 || p.pendingCount < 1) { console.error("migration_rehearsal_pre_plan_mismatch"); process.exit(1); }
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')

preservation_flags=$(docker run --rm -v "$pre_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  const pending = tag => p.migrations.some(m => m.tag === tag && m.status === "pending");
  process.stdout.write(`${pending("0042_weekly_ai_allowance")}:${pending("0045_ai_operation_privacy")}:${pending("0050_wechat_day_pass")}`);
')
apply_0042=${preservation_flags%%:*}
remaining_preservation_flags=${preservation_flags#*:}
apply_0045=${remaining_preservation_flags%%:*}
apply_0050=${remaining_preservation_flags#*:}
for preservation_flag in "$apply_0042" "$apply_0045" "$apply_0050"; do
  case "$preservation_flag" in
    true|false) ;;
    *) echo 'migration_rehearsal_pending_transform_invalid' >&2; exit 1 ;;
  esac
done
stage=capture_expected_fingerprints
fingerprint_before_sql=$work_dir/fingerprint-before.sql
cat > "$fingerprint_before_sql" <<'SQL'
CREATE SCHEMA icao_rehearsal;
REVOKE ALL ON SCHEMA icao_rehearsal FROM PUBLIC;
-- Only migrations pending in this exact pre-plan may transform the expected rows.
CREATE TABLE icao_rehearsal.preservation_context (
  apply_0042 boolean NOT NULL,
  apply_0045 boolean NOT NULL,
  apply_0050 boolean NOT NULL,
  migration_started_at timestamptz,
  migration_finished_at timestamptz
);
INSERT INTO icao_rehearsal.preservation_context (apply_0042, apply_0045, apply_0050)
VALUES (:'apply_0042'::boolean, :'apply_0045'::boolean, :'apply_0050'::boolean);
-- Never exempt a pre-existing row from the preservation fingerprint.
DO $day_pass_before$
BEGIN
  IF (SELECT apply_0050 FROM icao_rehearsal.preservation_context)
      AND EXISTS (SELECT 1 FROM public.commerce_products WHERE product_key = 'membership_1d_v1') THEN
    RAISE EXCEPTION 'migration_rehearsal_day_pass_already_present';
  END IF;
END
$day_pass_before$;
CREATE TABLE icao_rehearsal.approved_ai_scrubs (reservation_id uuid PRIMARY KEY);
INSERT INTO icao_rehearsal.approved_ai_scrubs
SELECT r.id FROM public.ai_point_reservations r
JOIN public.accounts a ON a.id = r.account_id
WHERE a.ai_result_generation > 0
  AND (SELECT apply_0045 FROM icao_rehearsal.preservation_context);
CREATE TABLE icao_rehearsal.table_fingerprints_before (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  allowed_columns text[] NOT NULL,
  row_count bigint NOT NULL,
  content_digest text NOT NULL,
  PRIMARY KEY (schema_name, table_name)
);
CREATE FUNCTION icao_rehearsal.project_row(row_json jsonb, allowed_columns text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
AS $function$
  SELECT COALESCE(
    jsonb_object_agg(entry.key, entry.value ORDER BY entry.key),
    '{}'::jsonb
  )
  FROM jsonb_each(row_json) AS entry
  WHERE entry.key = ANY (allowed_columns)
$function$;
-- Preserve every original field. Only the BEFORE image receives the approved
-- deterministic value changes; the AFTER image must contain the actual values.
CREATE FUNCTION icao_rehearsal.preservation_row(
  schema_name text, table_name text, row_json jsonb, before_image boolean
) RETURNS jsonb LANGUAGE plpgsql STABLE STRICT AS $function$
DECLARE
  change_catalog boolean;
BEGIN
  SELECT apply_0042 INTO change_catalog FROM icao_rehearsal.preservation_context;
  IF schema_name = 'public' AND change_catalog
      AND table_name IN ('commerce_products', 'commerce_channel_products') THEN
    IF before_image THEN
      IF table_name = 'commerce_products' THEN
        row_json := row_json || jsonb_build_object(
          'active', (row_json->>'duration_days')::integer IN (7,31,93),
          'base_price_cny_fen', CASE (row_json->>'duration_days')::integer
            WHEN 31 THEN 15800 WHEN 93 THEN 35800
            ELSE (row_json->>'base_price_cny_fen')::integer END);
      ELSE
        row_json := row_json || jsonb_build_object('active', row_json->>'product_key'
          IN ('membership_7d_v1','membership_31d_v1','membership_93d_v1'));
      END IF;
    END IF;
    -- Actual timestamps are separately required to equal the migration's seed
    -- timestamp inside the database-clock migration window; never ignore them.
    row_json := jsonb_set(row_json, '{updated_at}', '"approved_0042_transaction"');
  END IF;
  IF before_image AND schema_name = 'public' AND table_name = 'ai_point_reservations'
      AND EXISTS (SELECT 1 FROM icao_rehearsal.approved_ai_scrubs
        WHERE reservation_id = (row_json->>'id')::uuid) THEN
    row_json := jsonb_set(row_json, '{result_payload}', 'null'::jsonb);
  END IF;
  RETURN row_json;
END
$function$;
DO $capture$
DECLARE
  item record;
  columns_to_preserve text[];
  captured_count bigint;
  captured_digest text;
BEGIN
  FOR item IN
    SELECT table_schema AS schema_name, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('public', 'auth', 'storage')
    ORDER BY table_schema, table_name
  LOOP
    SELECT array_agg(column_name ORDER BY ordinal_position)
    INTO columns_to_preserve
    FROM information_schema.columns
    WHERE table_schema = item.schema_name AND table_name = item.table_name;

    EXECUTE format(
      'SELECT count(*), md5(COALESCE(string_agg(row_hash, %L ORDER BY row_hash), %L))
       FROM (
         SELECT md5(icao_rehearsal.project_row(icao_rehearsal.preservation_row($2, $3, to_jsonb(t), true), $1)::text) AS row_hash
         FROM %I.%I AS t
       ) AS fingerprint_rows',
      '', '', item.schema_name, item.table_name
    )
    INTO captured_count, captured_digest
    USING columns_to_preserve, item.schema_name, item.table_name;

    INSERT INTO icao_rehearsal.table_fingerprints_before (
      schema_name, table_name, allowed_columns, row_count, content_digest
    ) VALUES (
      item.schema_name, item.table_name, columns_to_preserve, captured_count, captured_digest
    );
  END LOOP;
END
$capture$;
SQL
run_sql_file "$fingerprint_before_sql"
preexisting_table_count=$(query_scalar 'select count(*) from icao_rehearsal.table_fingerprints_before')
test "$preexisting_table_count" -gt 0

stage=before_data_counts
before_card_states=$(query_scalar 'select count(*) from public.user_card_states')
before_learning_records=$(query_scalar 'select count(*) from public.learning_records')
before_documents=$(query_scalar 'select count(*) from public.user_documents')
before_changes=$(query_scalar 'select count(*) from public.sync_changes')
before_auth_users=$(query_scalar 'select count(*) from auth.users')
before_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
before_business_rows=$((before_card_states + before_learning_records + before_documents + before_changes))
stage=before_business_rows
test "$before_business_rows" -gt 0
stage=before_auth_users
test "$before_auth_users" -gt 0
stage=before_migrations
test "$before_migrations" -gt 0

stage=apply_isolated_migrations
query_scalar 'update icao_rehearsal.preservation_context set migration_started_at = clock_timestamp()' >/dev/null

docker run --rm --network supabase_default --env-file "$database_env" \
  -e ICAO_PRODUCTION_MIGRATION_SOURCE_SHA="$source_sha" \
  -e ICAO_MIGRATION_REHEARSAL_DATABASE_NAME="$database_name" \
  -e ICAO_MIGRATION_REHEARSAL_AUTHORIZATION="rehearse:$source_sha:$database_name" \
  "$image" node services/api/scripts/migrate.mjs --isolated-rehearsal
query_scalar 'update icao_rehearsal.preservation_context set migration_finished_at = clock_timestamp()' >/dev/null
stage=post_plan
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --require-current

post_plan=$work_dir/post-plan.json
docker run --rm --network supabase_default --env-file "$database_env" "$image" \
  node services/api/scripts/migration-plan.mjs --json --require-current > "$post_plan"
post_summary=$(docker run --rm -v "$post_plan:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (!p.current || !p.safe || p.pendingCount !== 0 || p.driftCount !== 0) { console.error("migration_rehearsal_post_plan_mismatch"); process.exit(1); }
  process.stdout.write(`${p.appliedCount}:${p.pendingCount}:${p.driftCount}`);
')

stage=schema_contract
# BEGIN migration-rehearsal-schema-contract-verification
schema_contract=$work_dir/schema-contract.json
docker run --rm --network supabase_default --env-file "$database_env" \
  -e ICAO_PRODUCTION_DATABASE_NAME="$database_name" "$image" \
  node services/api/scripts/verify-production-schema-contract.mjs > "$schema_contract"
docker run --rm -v "$schema_contract:/evidence.json:ro" "$image" node -e '
  const p = require("/evidence.json");
  if (p.status !== "verified" || p.readOnly !== true
      || p.requiredTables !== p.expectedPublicTables
      || p.expectedPublicTables !== 65 || p.actualPublicTables !== 65
      || p.unclassifiedPublicTables !== 0 || p.missingPublicTables !== 0
      || p.commerceProducts !== 4 || p.appleProductMappings !== 5
      || p.unvalidatedConstraints !== 0 || p.serverOnlyClientGrants !== 0
      || p.unexpectedPublicTableOwners !== 0 || p.defaultAclOwners !== 1
      || p.serverOnlyClientDefaultTableGrants !== 0
      || p.deviceDigestColumns !== 0) {
    console.error("migration_rehearsal_schema_contract_mismatch");
    process.exit(1);
  }
'
schema_contract_sha=$(sha256sum "$schema_contract" | awk '{ print $1 }')
case "$schema_contract_sha" in
  ''|*[!a-f0-9]*) echo 'isolated rehearsal schema contract SHA is invalid' >&2; exit 1 ;;
esac
test "${#schema_contract_sha}" -eq 64
# END migration-rehearsal-schema-contract-verification

stage=verify_approved_transformations
fingerprint_after_sql=$work_dir/fingerprint-after.sql
cat > "$fingerprint_after_sql" <<'SQL'
-- The only time normalization below is bounded to rows touched by pending
-- migrations. A migrated/untouched future database receives no exemption.
DO $approved_changes$
DECLARE
  context icao_rehearsal.preservation_context%ROWTYPE;
  migration_time timestamptz;
BEGIN
  SELECT * INTO STRICT context FROM icao_rehearsal.preservation_context;
  IF context.migration_started_at IS NULL OR context.migration_finished_at IS NULL
      OR context.migration_finished_at < context.migration_started_at THEN
    RAISE EXCEPTION 'migration_rehearsal_time_window_invalid';
  END IF;
  IF context.apply_0042 THEN
    SELECT created_at INTO STRICT migration_time FROM public.ai_usage_rule_versions
    WHERE id = '00000000-0000-4000-8000-000000000500';
    IF NOT (migration_time BETWEEN context.migration_started_at AND context.migration_finished_at)
        OR EXISTS (SELECT 1 FROM public.commerce_products WHERE updated_at IS DISTINCT FROM migration_time
          AND NOT (context.apply_0050 AND product_key = 'membership_1d_v1'))
        OR EXISTS (SELECT 1 FROM public.commerce_channel_products WHERE updated_at IS DISTINCT FROM migration_time) THEN
      RAISE EXCEPTION 'migration_rehearsal_catalog_timestamp_mismatch';
    END IF;
  END IF;
  IF context.apply_0050 THEN
    IF (SELECT count(*) FROM public.commerce_products
        WHERE product_key = 'membership_1d_v1'
          AND display_name = '1天会员' AND duration_days = 1 AND base_price_cny_fen = 100
          AND ai_point_rule_version = 'ai-weekly-v1' AND ai_point_batch_count = 1
          AND ai_point_batch_interval_days = 7 AND ai_points_per_batch = 500 AND active
          AND created_at BETWEEN context.migration_started_at AND context.migration_finished_at
          AND updated_at = created_at) <> 1 THEN
      RAISE EXCEPTION 'migration_rehearsal_day_pass_insert_mismatch';
    END IF;
  END IF;
  IF context.apply_0045 THEN
    IF EXISTS (
      SELECT 1 FROM icao_rehearsal.approved_ai_scrubs target
      LEFT JOIN public.ai_point_reservations r ON r.id = target.reservation_id
      WHERE r.id IS NULL OR r.result_payload IS NOT NULL OR r.result_deleted_at IS NULL
        OR r.result_deleted_at NOT BETWEEN context.migration_started_at AND context.migration_finished_at
        OR (context.apply_0042 AND r.result_deleted_at IS DISTINCT FROM migration_time)
    ) OR EXISTS (
      SELECT 1 FROM public.ai_point_reservations r
      WHERE r.result_deleted_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM icao_rehearsal.approved_ai_scrubs target WHERE target.reservation_id = r.id)
    ) THEN
      RAISE EXCEPTION 'migration_rehearsal_ai_scrub_scope_mismatch';
    END IF;
  END IF;
END
$approved_changes$;
CREATE TABLE icao_rehearsal.table_fingerprints_after (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  content_digest text NOT NULL,
  PRIMARY KEY (schema_name, table_name)
);
DO $capture$
DECLARE
  item record;
  captured_count bigint;
  captured_digest text;
BEGIN
  FOR item IN
    SELECT schema_name, table_name, allowed_columns
    FROM icao_rehearsal.table_fingerprints_before
    ORDER BY schema_name, table_name
  LOOP
    IF to_regclass(format('%I.%I', item.schema_name, item.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*), md5(COALESCE(string_agg(row_hash, %L ORDER BY row_hash), %L))
       FROM (
         SELECT md5(icao_rehearsal.project_row(icao_rehearsal.preservation_row($2, $3, to_jsonb(t), false), $1)::text) AS row_hash
         FROM %I.%I AS t
         WHERE NOT ($2 = ''public'' AND $3 = ''commerce_products''
           AND (SELECT apply_0050 FROM icao_rehearsal.preservation_context)
           AND to_jsonb(t)->>''product_key'' = ''membership_1d_v1'')
       ) AS fingerprint_rows',
      '', '', item.schema_name, item.table_name
    )
    INTO captured_count, captured_digest
    USING item.allowed_columns, item.schema_name, item.table_name;

    INSERT INTO icao_rehearsal.table_fingerprints_after (
      schema_name, table_name, row_count, content_digest
    ) VALUES (
      item.schema_name, item.table_name, captured_count, captured_digest
    );
  END LOOP;
END
$capture$;
SQL
run_sql_file "$fingerprint_after_sql"
missing_preexisting_tables=$(query_scalar '
  select count(*)
  from icao_rehearsal.table_fingerprints_before before_state
  left join icao_rehearsal.table_fingerprints_after after_state
    using (schema_name, table_name)
  where after_state.table_name is null
')
preexisting_fingerprint_mismatches=$(query_scalar '
  select count(*)
  from icao_rehearsal.table_fingerprints_before before_state
  join icao_rehearsal.table_fingerprints_after after_state
    using (schema_name, table_name)
  where before_state.row_count is distinct from after_state.row_count
     or before_state.content_digest is distinct from after_state.content_digest
')
stage=preserved_tables
test "$missing_preexisting_tables" = 0
stage=preserved_row_fingerprints
if [ "$preexisting_fingerprint_mismatches" != 0 ]; then
  echo "migration_rehearsal_fingerprint_mismatches count=$preexisting_fingerprint_mismatches" >&2
  query_scalar "select before_state.schema_name || chr(46) || before_state.table_name from icao_rehearsal.table_fingerprints_before before_state join icao_rehearsal.table_fingerprints_after after_state using (schema_name, table_name) where before_state.row_count is distinct from after_state.row_count or before_state.content_digest is distinct from after_state.content_digest" >&2
  exit 1
fi

stage=after_data_counts
after_card_states=$(query_scalar 'select count(*) from public.user_card_states')
after_learning_records=$(query_scalar 'select count(*) from public.learning_records')
after_documents=$(query_scalar 'select count(*) from public.user_documents')
after_changes=$(query_scalar 'select count(*) from public.sync_changes')
after_auth_users=$(query_scalar 'select count(*) from auth.users')
after_migrations=$(query_scalar 'select count(*) from drizzle.__drizzle_migrations')
test "$after_card_states" = "$before_card_states"
test "$after_learning_records" = "$before_learning_records"
test "$after_documents" = "$before_documents"
test "$after_changes" = "$before_changes"
test "$after_auth_users" = "$before_auth_users"
test "$after_migrations" -gt "$before_migrations"

stage=remaining_schema_contracts
missing_contracts=$(query_scalar "
  select count(*) from (values
    (to_regclass('public.commerce_products')),
    (to_regclass('public.phone_otp_intents')),
    (to_regclass('public.apple_notification_events')),
    (to_regclass('public.ai_consent_authorities')),
    (to_regclass('public.content_access_credentials')),
    (to_regclass('public.ops_staff_accounts'))
  ) as required(regclass) where regclass is null
")
unvalidated_constraints=$(query_scalar "
  select count(*) from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname in ('public', 'auth') and not c.convalidated
")
device_digest_columns=$(query_scalar "
  select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'content_access_credentials'
    and column_name = 'device_digest'
")
test "$missing_contracts" = 0
test "$unvalidated_constraints" = 0
test "$device_digest_columns" = 0

stage=cleanup
drop_created_database
test "$database_created" = 0
cleanup_files
cleanup_verified=1
if [ "$postgres_password_loaded" = 1 ]; then unset POSTGRES_PASSWORD PGPASSWORD; fi

evidence=$evidence_dir/rehearsal-$source_id-$(date -u +%Y%m%dT%H%M%SZ).txt
evidence_partial=$evidence.partial.$$
test "$cleanup_verified" = 1
{
  printf 'source_sha=%s\n' "$source_sha"
  printf 'archive_sha256=%s\n' "$archive_sha"
  printf 'backup_name=%s\n' "$backup_name"
  printf 'backup_sha256=%s\n' "$backup_sha"
  printf 'pre_plan=%s\n' "$pre_summary"
  printf 'post_plan=%s\n' "$post_summary"
  printf 'business_rows_preserved=%s\n' "$before_business_rows"
  printf 'auth_users_preserved=%s\n' "$before_auth_users"
  printf 'preexisting_tables_fingerprinted=%s\n' "$preexisting_table_count"
  printf 'missing_preexisting_tables=%s\n' "$missing_preexisting_tables"
  printf 'preexisting_fingerprint_mismatches=%s\n' "$preexisting_fingerprint_mismatches"
  printf 'migration_rows_before=%s\n' "$before_migrations"
  printf 'migration_rows_after=%s\n' "$after_migrations"
  printf 'missing_contracts=%s\n' "$missing_contracts"
  printf 'unvalidated_constraints=%s\n' "$unvalidated_constraints"
  printf 'device_digest_columns=%s\n' "$device_digest_columns"
  printf 'schema_contract_verified=1\n'
  printf 'schema_contract_sha256=%s\n' "$schema_contract_sha"
  printf 'isolated_database_contract=%s\n' "$database_contract"
  printf 'isolated_database_removed=1\n'
  printf 'cleanup_verified=%s\n' "$cleanup_verified"
  printf 'capacity_required_bytes=%s\n' "$required_bytes"
  printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$evidence_partial"
chmod 600 "$evidence_partial"
mv "$evidence_partial" "$evidence"
evidence_partial=

trap - EXIT HUP INT TERM
printf 'production_migration_rehearsal_ok source=%s backup=%s pre=%s post=%s evidence=%s\n' \
  "$source_sha" "$backup_name" "$pre_summary" "$post_summary" "$evidence"
REMOTE

REMOTE_CLEANUP_ARMED=0
cleanup_local_resources
trap - EXIT HUP INT TERM
