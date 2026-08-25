#!/bin/sh

set -eu
umask 077

content_key_fail() {
  printf '%s\n' "content_signing_key_provision:$1" >&2
  return 1
}

content_key_read_uid() {
  stat -Lc %u "$1" 2>/dev/null || stat -f %u "$1"
}

content_key_read_mode() {
  stat -Lc %a "$1" 2>/dev/null || stat -f %Lp "$1"
}

content_key_read_identity() {
  stat -Lc '%d:%i' "$1" 2>/dev/null || stat -f '%d:%i' "$1"
}

content_key_read_inode() {
  stat -Lc '%i' "$1" 2>/dev/null || stat -f '%i' "$1"
}

content_key_validate_owner() {
  case "$1" in
    ''|*[!0-9]*) content_key_fail invalid_expected_owner; return 1 ;;
  esac
}

content_key_validate_release_identity() {
  case "$1" in
    ''|*[!A-Za-z0-9._-]*) content_key_fail invalid_release_id; return 1 ;;
  esac
  case "$2" in
    ''|*[!A-Fa-f0-9]*|?????????????????????????????????*)
      content_key_fail invalid_upload_token
      return 1
      ;;
  esac
  if [ "${#2}" -ne 32 ]; then
    content_key_fail invalid_upload_token
    return 1
  fi
}

content_key_validate_release_root() {
  release_root=$1
  expected_owner=$2
  case "$release_root" in
    /*) ;;
    *) content_key_fail release_root_must_be_absolute; return 1 ;;
  esac
  if [ ! -d "$release_root" ] || [ -L "$release_root" ]; then
    content_key_fail release_root_not_real_directory
    return 1
  fi
  if [ "$(content_key_read_uid "$release_root")" != "$expected_owner" ]; then
    content_key_fail release_root_wrong_owner
    return 1
  fi
  case "$(content_key_read_mode "$release_root")" in
    700|710|711|750|751|755) ;;
    *) content_key_fail release_root_unsafe_mode; return 1 ;;
  esac
}

content_key_validate_private_directory() {
  checked_directory=$1
  expected_owner=$2
  if [ ! -d "$checked_directory" ] || [ -L "$checked_directory" ]; then
    content_key_fail private_directory_not_real
    return 1
  fi
  if [ "$(content_key_read_uid "$checked_directory")" != "$expected_owner" ]; then
    content_key_fail private_directory_wrong_owner
    return 1
  fi
  if [ "$(content_key_read_mode "$checked_directory")" != 700 ]; then
    content_key_fail private_directory_mode_must_be_0700
    return 1
  fi
}

content_key_validate_private_file() {
  checked_file=$1
  expected_owner=$2
  if [ ! -f "$checked_file" ] || [ -L "$checked_file" ]; then
    content_key_fail private_file_not_regular
    return 1
  fi
  if [ "$(content_key_read_uid "$checked_file")" != "$expected_owner" ]; then
    content_key_fail private_file_wrong_owner
    return 1
  fi
  if [ "$(content_key_read_mode "$checked_file")" != 600 ]; then
    content_key_fail private_file_mode_must_be_0600
    return 1
  fi
}

content_key_set_stage_paths() {
  release_root=$1
  release_id=$2
  upload_token=$3
  CONTENT_KEY_UPLOAD_ROOT=$release_root/api-secret-uploads
  CONTENT_KEY_STAGE_DIRECTORY=$CONTENT_KEY_UPLOAD_ROOT/stage-$release_id-$upload_token
  CONTENT_KEY_PRIVATE_FILE=$CONTENT_KEY_STAGE_DIRECTORY/content-credential-signing-private-key.pem
  CONTENT_KEY_CANDIDATE_ENV=$CONTENT_KEY_STAGE_DIRECTORY/runtime-env-candidate
}

content_key_validate_pem() {
  checked_file=$1
  private_key_bytes=$(wc -c < "$checked_file" | tr -d '[:space:]')
  case "$private_key_bytes" in
    ''|*[!0-9]*) content_key_fail private_key_size_invalid; return 1 ;;
  esac
  if [ "$private_key_bytes" -lt 80 ] || [ "$private_key_bytes" -gt 4096 ]; then
    content_key_fail private_key_size_invalid
    return 1
  fi
  if ! LC_ALL=C awk '
    NR == 1 {
      if ($0 != "-----BEGIN PRIVATE KEY-----") exit 1
      next
    }
    $0 == "-----END PRIVATE KEY-----" {
      if (ended || body_lines == 0) exit 1
      ended = 1
      next
    }
    ended { exit 1 }
    $0 !~ /^[A-Za-z0-9+\/=]+$/ { exit 1 }
    { body_lines += 1 }
    END { if (!ended) exit 1 }
  ' "$checked_file"; then
    content_key_fail private_key_pem_shape_invalid
    return 1
  fi
}

content_key_validate_stage() {
  release_root=$1
  release_id=$2
  upload_token=$3
  expected_owner=$4
  key_state=$5
  candidate_state=$6

  content_key_validate_owner "$expected_owner" || return 1
  content_key_validate_release_identity "$release_id" "$upload_token" || return 1
  content_key_validate_release_root "$release_root" "$expected_owner" || return 1
  content_key_set_stage_paths "$release_root" "$release_id" "$upload_token"
  content_key_validate_private_directory "$CONTENT_KEY_UPLOAD_ROOT" "$expected_owner" || return 1
  content_key_validate_private_directory "$CONTENT_KEY_STAGE_DIRECTORY" "$expected_owner" || return 1
  content_key_validate_private_file "$CONTENT_KEY_PRIVATE_FILE" "$expected_owner" || return 1

  case "$key_state" in
    empty)
      if [ -s "$CONTENT_KEY_PRIVATE_FILE" ]; then
        content_key_fail staged_key_expected_empty
        return 1
      fi
      ;;
    pem) content_key_validate_pem "$CONTENT_KEY_PRIVATE_FILE" || return 1 ;;
    *) content_key_fail invalid_key_state; return 1 ;;
  esac

  case "$candidate_state" in
    absent)
      if [ -e "$CONTENT_KEY_CANDIDATE_ENV" ] || [ -L "$CONTENT_KEY_CANDIDATE_ENV" ]; then
        content_key_fail unexpected_candidate_env
        return 1
      fi
      if ! unexpected_entry=$(find "$CONTENT_KEY_STAGE_DIRECTORY" -mindepth 1 -maxdepth 1 \
        ! -name content-credential-signing-private-key.pem -print -quit); then
        content_key_fail stage_inspection_failed
        return 1
      fi
      ;;
    required)
      content_key_validate_private_file "$CONTENT_KEY_CANDIDATE_ENV" "$expected_owner" || return 1
      if ! unexpected_entry=$(find "$CONTENT_KEY_STAGE_DIRECTORY" -mindepth 1 -maxdepth 1 \
        ! -name content-credential-signing-private-key.pem \
        ! -name runtime-env-candidate -print -quit); then
        content_key_fail stage_inspection_failed
        return 1
      fi
      ;;
    *) content_key_fail invalid_candidate_state; return 1 ;;
  esac

  if [ -n "$unexpected_entry" ]; then
    content_key_fail stage_contains_unexpected_entry
    return 1
  fi
}

content_key_stage_create() {
  release_root=$1
  release_id=$2
  upload_token=$3
  expected_owner=$4

  content_key_validate_owner "$expected_owner" || return 1
  content_key_validate_release_identity "$release_id" "$upload_token" || return 1
  content_key_validate_release_root "$release_root" "$expected_owner" || return 1
  content_key_set_stage_paths "$release_root" "$release_id" "$upload_token"

  if [ -e "$CONTENT_KEY_UPLOAD_ROOT" ] || [ -L "$CONTENT_KEY_UPLOAD_ROOT" ]; then
    content_key_validate_private_directory "$CONTENT_KEY_UPLOAD_ROOT" "$expected_owner" || return 1
  else
    mkdir -m 700 "$CONTENT_KEY_UPLOAD_ROOT" || return 1
    content_key_validate_private_directory "$CONTENT_KEY_UPLOAD_ROOT" "$expected_owner" || return 1
  fi
  if [ -e "$CONTENT_KEY_STAGE_DIRECTORY" ] || [ -L "$CONTENT_KEY_STAGE_DIRECTORY" ]; then
    content_key_fail stage_already_exists
    return 1
  fi
  mkdir -m 700 "$CONTENT_KEY_STAGE_DIRECTORY" || return 1
  if ! (set -C; : > "$CONTENT_KEY_PRIVATE_FILE") 2>/dev/null; then
    rmdir "$CONTENT_KEY_STAGE_DIRECTORY" 2>/dev/null || true
    content_key_fail private_file_create_failed
    return 1
  fi
  chmod 600 "$CONTENT_KEY_PRIVATE_FILE" || return 1
  content_key_validate_stage \
    "$release_root" "$release_id" "$upload_token" "$expected_owner" empty absent || return 1
  printf '%s\n' "$CONTENT_KEY_PRIVATE_FILE"
}

content_key_validate_runtime_parent() {
  runtime_parent=$1
  expected_owner=$2
  if [ ! -d "$runtime_parent" ] || [ -L "$runtime_parent" ]; then
    content_key_fail runtime_parent_not_real_directory
    return 1
  fi
  if [ "$(content_key_read_uid "$runtime_parent")" != "$expected_owner" ]; then
    content_key_fail runtime_parent_wrong_owner
    return 1
  fi
  case "$(content_key_read_mode "$runtime_parent")" in
    700|710|711|750|751|755) ;;
    *) content_key_fail runtime_parent_unsafe_mode; return 1 ;;
  esac
}

content_key_validate_runtime_env() {
  runtime_env=$1
  expected_owner=$2
  case "$runtime_env" in
    /*) ;;
    *) content_key_fail runtime_env_must_be_absolute; return 1 ;;
  esac
  content_key_validate_runtime_parent "$(dirname "$runtime_env")" "$expected_owner" || return 1
  content_key_validate_private_file "$runtime_env" "$expected_owner" || return 1
  if [ ! -s "$runtime_env" ]; then
    content_key_fail runtime_env_empty
    return 1
  fi
  if ! LC_ALL=C awk '
    /\r/ { exit 1 }
    /^$/ || /^#/ { next }
    !/^[A-Za-z_][A-Za-z0-9_]*=/ { exit 1 }
    {
      key = $0
      sub(/=.*/, "", key)
      if (seen[key]++) exit 1
    }
  ' "$runtime_env"; then
    content_key_fail runtime_env_invalid_or_duplicate_entry
    return 1
  fi
}

content_key_prepare_candidate_env() (
  set -eu
  release_root=$1
  release_id=$2
  upload_token=$3
  expected_owner=$4
  runtime_env=$5

  content_key_validate_stage \
    "$release_root" "$release_id" "$upload_token" "$expected_owner" pem absent || return 1
  content_key_validate_runtime_env "$runtime_env" "$expected_owner" || return 1
  candidate_temp=$(mktemp "$CONTENT_KEY_STAGE_DIRECTORY/.runtime-env-candidate.XXXXXX") || return 1
  chmod 600 "$candidate_temp" || return 1
  cleanup_candidate_temp() {
    rm -f "$candidate_temp"
  }
  trap cleanup_candidate_temp EXIT
  trap 'exit 1' HUP INT TERM
  if ! LC_ALL=C awk -v key_file="$CONTENT_KEY_PRIVATE_FILE" -v release_id="$release_id" '
    BEGIN {
      while ((status = getline key_line < key_file) > 0) {
        key_material = key_material key_line "\\n"
      }
      close(key_file)
      if (status < 0 || key_material == "") exit 1
    }
    /^API_RELEASE_ID=/ {
      if (!release_written) print "API_RELEASE_ID=" release_id
      release_written = 1
      next
    }
    /^CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=/ {
      if (!key_written) print "CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=" key_material
      key_written = 1
      next
    }
    { print }
    END {
      if (!release_written) print "API_RELEASE_ID=" release_id
      if (!key_written) print "CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=" key_material
    }
  ' "$runtime_env" > "$candidate_temp"; then
    content_key_fail candidate_env_render_failed
    return 1
  fi
  chmod 600 "$candidate_temp" || return 1
  content_key_validate_private_file "$candidate_temp" "$expected_owner" || return 1
  content_key_validate_runtime_env "$candidate_temp" "$expected_owner" || return 1
  if [ "$(grep -c '^API_RELEASE_ID=' "$candidate_temp" || true)" != 1 ]; then
    content_key_fail candidate_release_id_count_invalid
    return 1
  fi
  if [ "$(grep -c '^CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=' "$candidate_temp" || true)" != 1 ]; then
    content_key_fail candidate_private_key_count_invalid
    return 1
  fi
  mv "$candidate_temp" "$CONTENT_KEY_CANDIDATE_ENV" || return 1
  candidate_temp=
  trap - EXIT HUP INT TERM
  content_key_validate_stage \
    "$release_root" "$release_id" "$upload_token" "$expected_owner" pem required || return 1
)

content_key_validate_backup_directory() {
  backup_directory=$1
  expected_owner=$2
  case "$backup_directory" in
    /*) ;;
    *) content_key_fail backup_directory_must_be_absolute; return 1 ;;
  esac
  content_key_validate_private_directory "$backup_directory" "$expected_owner" || return 1
}

content_key_copy_new_private_file() (
  set -eu
  source_file=$1
  target_file=$2
  expected_owner=$3
  target_parent=$(dirname "$target_file")
  content_key_validate_private_directory "$target_parent" "$expected_owner" || return 1
  if [ -e "$target_file" ] || [ -L "$target_file" ]; then
    content_key_fail target_already_exists
    return 1
  fi
  temporary=$(mktemp "$target_parent/.content-key-copy.XXXXXX") || return 1
  cleanup_copy() {
    rm -f "$temporary"
  }
  trap cleanup_copy EXIT
  trap 'exit 1' HUP INT TERM
  cp "$source_file" "$temporary" || return 1
  chmod 600 "$temporary" || return 1
  content_key_validate_private_file "$temporary" "$expected_owner" || return 1
  if ! cmp -s "$source_file" "$temporary"; then
    content_key_fail private_copy_mismatch
    return 1
  fi
  mv "$temporary" "$target_file" || return 1
  temporary=
  trap - EXIT HUP INT TERM
  content_key_validate_private_file "$target_file" "$expected_owner" || return 1
  if ! cmp -s "$source_file" "$target_file"; then
    content_key_fail private_copy_mismatch
    return 1
  fi
)

content_key_atomic_replace_private_file() (
  set -eu
  source_file=$1
  target_file=$2
  expected_owner=$3
  target_parent=$(dirname "$target_file")
  content_key_validate_runtime_parent "$target_parent" "$expected_owner" || return 1
  temporary=$(mktemp "$target_parent/.content-key-runtime-env.XXXXXX") || return 1
  cleanup_replace() {
    rm -f "$temporary"
  }
  trap cleanup_replace EXIT
  trap 'exit 1' HUP INT TERM
  cp "$source_file" "$temporary" || return 1
  chmod 600 "$temporary" || return 1
  content_key_validate_private_file "$temporary" "$expected_owner" || return 1
  if ! cmp -s "$source_file" "$temporary"; then
    content_key_fail private_copy_mismatch
    return 1
  fi
  mv "$temporary" "$target_file" || return 1
  temporary=
  trap - EXIT HUP INT TERM
  content_key_validate_private_file "$target_file" "$expected_owner" || return 1
  if ! cmp -s "$source_file" "$target_file"; then
    content_key_fail private_copy_mismatch
    return 1
  fi
)

content_key_install_candidate_env() {
  release_root=$1
  release_id=$2
  upload_token=$3
  expected_owner=$4
  runtime_env=$5
  backup_directory=$6

  content_key_validate_stage \
    "$release_root" "$release_id" "$upload_token" "$expected_owner" pem required || return 1
  content_key_validate_runtime_env "$runtime_env" "$expected_owner" || return 1
  content_key_validate_backup_directory "$backup_directory" "$expected_owner" || return 1
  backup_env=$backup_directory/runtime-env-before
  content_key_copy_new_private_file "$runtime_env" "$backup_env" "$expected_owner" || return 1
  content_key_atomic_replace_private_file \
    "$CONTENT_KEY_CANDIDATE_ENV" "$runtime_env" "$expected_owner" || return 1
}

content_key_restore_runtime_env() {
  backup_env=$1
  runtime_env=$2
  expected_owner=$3
  content_key_validate_private_file "$backup_env" "$expected_owner" || return 1
  content_key_atomic_replace_private_file "$backup_env" "$runtime_env" "$expected_owner" || return 1
  content_key_validate_runtime_env "$runtime_env" "$expected_owner" || return 1
  if ! cmp -s "$backup_env" "$runtime_env"; then
    content_key_fail runtime_env_restore_mismatch
    return 1
  fi
}

content_key_cleanup_stage() {
  release_root=$1
  release_id=$2
  upload_token=$3
  expected_owner=$4
  content_key_validate_owner "$expected_owner" || return 1
  content_key_validate_release_identity "$release_id" "$upload_token" || return 1
  content_key_validate_release_root "$release_root" "$expected_owner" || return 1
  content_key_set_stage_paths "$release_root" "$release_id" "$upload_token"
  if [ ! -e "$CONTENT_KEY_STAGE_DIRECTORY" ] && [ ! -L "$CONTENT_KEY_STAGE_DIRECTORY" ]; then
    if [ -e "$CONTENT_KEY_UPLOAD_ROOT" ] || [ -L "$CONTENT_KEY_UPLOAD_ROOT" ]; then
      content_key_validate_private_directory "$CONTENT_KEY_UPLOAD_ROOT" "$expected_owner" || return 1
      rmdir "$CONTENT_KEY_UPLOAD_ROOT" 2>/dev/null || true
    fi
    return 0
  fi
  content_key_validate_private_directory "$CONTENT_KEY_UPLOAD_ROOT" "$expected_owner" || return 1
  content_key_validate_private_directory "$CONTENT_KEY_STAGE_DIRECTORY" "$expected_owner" || return 1
  if ! linked_entry=$(find "$CONTENT_KEY_STAGE_DIRECTORY" -mindepth 1 -type l -print -quit); then
    content_key_fail cleanup_inspection_failed
    return 1
  fi
  if [ -n "$linked_entry" ]; then
    content_key_fail cleanup_rejected_symlink
    return 1
  fi
  rm -rf "$CONTENT_KEY_STAGE_DIRECTORY" || return 1
  if [ -e "$CONTENT_KEY_STAGE_DIRECTORY" ] || [ -L "$CONTENT_KEY_STAGE_DIRECTORY" ]; then
    content_key_fail stage_cleanup_failed
    return 1
  fi
  rmdir "$CONTENT_KEY_UPLOAD_ROOT" 2>/dev/null || true
}

content_key_validate_image_id() {
  image_id=$1
  case "$image_id" in
    sha256:*) image_digest=${image_id#sha256:} ;;
    *) content_key_fail rollback_image_id_invalid; return 1 ;;
  esac
  case "$image_digest" in
    ''|*[!a-f0-9]*) content_key_fail rollback_image_id_invalid; return 1 ;;
  esac
  if [ "${#image_digest}" -ne 64 ]; then
    content_key_fail rollback_image_id_invalid
    return 1
  fi
}

content_key_rollback_release() {
  rollback_image=$1
  runtime_env=$2
  backup_env=$3
  expected_owner=$4
  runtime_compose=$5
  backup_compose=$6
  runtime_source=$7
  backup_source=$8
  source_next=$9
  expected_release_id=${10}
  runtime_source_existed=${11}
  expected_image_id=${12}
  rollback_failed=0

  case "$runtime_source_existed" in
    0|1) ;;
    *) content_key_fail rollback_source_state_invalid; return 1 ;;
  esac
  content_key_validate_image_id "$expected_image_id" || return 1
  backup_directory=$(dirname "$backup_env")
  content_key_validate_backup_directory "$backup_directory" "$expected_owner" || return 1
  if [ "$(dirname "$backup_compose")" != "$backup_directory" ]; then
    content_key_fail rollback_backup_paths_must_share_private_directory
    return 1
  fi
  content_key_validate_private_file "$backup_env" "$expected_owner" || return 1
  content_key_validate_private_file "$backup_compose" "$expected_owner" || return 1

  if ! docker tag "$rollback_image" icao-api:phase2a; then
    content_key_fail rollback_image_restore_failed || true
    rollback_failed=1
  fi
  if ! content_key_restore_runtime_env "$backup_env" "$runtime_env" "$expected_owner"; then
    content_key_fail rollback_runtime_env_restore_failed || true
    rollback_failed=1
  fi
  if ! content_key_validate_private_file "$backup_compose" "$expected_owner" \
    || ! content_key_atomic_replace_private_file \
      "$backup_compose" "$runtime_compose" "$expected_owner"; then
    content_key_fail rollback_compose_restore_failed || true
    rollback_failed=1
  fi

  rm -rf "$source_next" || rollback_failed=1
  if [ -e "$backup_source" ] || [ -L "$backup_source" ]; then
    if [ -d "$backup_source" ] && [ ! -L "$backup_source" ]; then
      rm -rf "$runtime_source" || rollback_failed=1
      if ! mv "$backup_source" "$runtime_source"; then
        content_key_fail rollback_source_restore_failed || true
        rollback_failed=1
      fi
    else
      content_key_fail rollback_source_backup_invalid || true
      rollback_failed=1
    fi
  elif [ "$runtime_source_existed" = 0 ]; then
    rm -rf "$runtime_source" || rollback_failed=1
  fi

  if ! docker compose -f "$runtime_compose" up -d --force-recreate api; then
    content_key_fail rollback_container_restart_failed || true
    rollback_failed=1
  fi
  restored_image_id=$(docker inspect -f '{{.Image}}' icao-api 2>/dev/null || true)
  if [ "$restored_image_id" != "$expected_image_id" ]; then
    content_key_fail rollback_image_identity_mismatch || true
    rollback_failed=1
  fi
  rollback_ready=0
  rollback_attempt=1
  while [ "$rollback_attempt" -le 30 ]; do
    if curl -fsS http://127.0.0.1:3101/health/ready >/dev/null; then
      rollback_ready=1
      break
    fi
    rollback_attempt=$((rollback_attempt + 1))
    sleep 2
  done
  if [ "$rollback_ready" != 1 ]; then
    content_key_fail rollback_readiness_failed || true
    rollback_failed=1
  fi
  restored_release_id=$(
    docker exec icao-api sh -lc 'printf "%s" "${API_RELEASE_ID:-unversioned}"' 2>/dev/null \
      || true
  )
  if [ "$restored_release_id" != "$expected_release_id" ]; then
    content_key_fail rollback_release_identity_mismatch || true
    rollback_failed=1
  fi
  [ "$rollback_failed" = 0 ] || return 1
}

content_key_lock_fd_path() {
  lock_fd=$1
  if [ -e "/proc/$$/fd/$lock_fd" ]; then
    printf '%s\n' "/proc/$$/fd/$lock_fd"
  elif [ -e "/dev/fd/$lock_fd" ]; then
    printf '%s\n' "/dev/fd/$lock_fd"
  else
    content_key_fail lock_file_descriptor_unavailable
    return 1
  fi
}

content_key_validate_open_lock() {
  lock_file=$1
  expected_owner=$2
  lock_fd=$3
  if [ ! -f "$lock_file" ] || [ -L "$lock_file" ]; then
    content_key_fail lock_file_not_regular
    return 1
  fi
  lock_fd_path=$(content_key_lock_fd_path "$lock_fd") || return 1
  case "$lock_fd_path" in
    /proc/*)
      lock_path_identity=$(content_key_read_identity "$lock_file") || return 1
      lock_fd_identity=$(content_key_read_identity "$lock_fd_path") || return 1
      ;;
    /dev/fd/*)
      # macOS exposes an open descriptor through fdesc with a synthetic device
      # number, while retaining the underlying inode, owner, and mode.
      lock_path_identity=$(content_key_read_inode "$lock_file") || return 1
      lock_fd_identity=$(content_key_read_inode "$lock_fd_path") || return 1
      ;;
    *) content_key_fail lock_file_descriptor_unavailable; return 1 ;;
  esac
  if [ "$lock_path_identity" != "$lock_fd_identity" ]; then
    content_key_fail lock_file_opened_inode_mismatch
    return 1
  fi
  if [ "$(content_key_read_uid "$lock_file")" != "$expected_owner" ] \
    || [ "$(content_key_read_uid "$lock_fd_path")" != "$expected_owner" ]; then
    content_key_fail lock_file_wrong_owner
    return 1
  fi
  if [ "$(content_key_read_mode "$lock_file")" != 600 ] \
    || [ "$(content_key_read_mode "$lock_fd_path")" != 600 ]; then
    content_key_fail lock_file_mode_must_be_0600
    return 1
  fi
}

content_key_validate_lock_parent() {
  lock_parent=$1
  expected_owner=$2
  if [ ! -d "$lock_parent" ] || [ -L "$lock_parent" ]; then
    content_key_fail lock_parent_not_real_directory
    return 1
  fi
  if [ "$(content_key_read_uid "$lock_parent")" != "$expected_owner" ]; then
    content_key_fail lock_parent_wrong_owner
    return 1
  fi
  lock_parent_mode=$(content_key_read_mode "$lock_parent") || return 1
  case "$lock_parent_mode" in
    ''|*[!0-7]*) content_key_fail lock_parent_unsafe_mode; return 1 ;;
  esac
  lock_parent_mode_value=$((0$lock_parent_mode))
  if [ $((lock_parent_mode_value & 0022)) -ne 0 ] \
    && [ $((lock_parent_mode_value & 01000)) -eq 0 ]; then
    content_key_fail lock_parent_unsafe_mode
    return 1
  fi
}

content_key_validate_lock_path() {
  lock_file=$1
  expected_owner=$2
  if [ ! -f "$lock_file" ] || [ -L "$lock_file" ]; then
    content_key_fail lock_file_not_regular
    return 1
  fi
  if [ "$(content_key_read_uid "$lock_file")" != "$expected_owner" ]; then
    content_key_fail lock_file_wrong_owner
    return 1
  fi
  if [ "$(content_key_read_mode "$lock_file")" != 600 ]; then
    content_key_fail lock_file_mode_must_be_0600
    return 1
  fi
}

content_key_acquire_lock() {
  lock_file=$1
  expected_owner=$2
  case "$lock_file" in
    /*) ;;
    *) content_key_fail lock_file_must_be_absolute; return 1 ;;
  esac
  content_key_validate_lock_parent "$(dirname "$lock_file")" "$expected_owner" || return 1
  if [ -L "$lock_file" ]; then
    content_key_fail lock_file_symlink_rejected
    return 1
  fi
  if [ ! -e "$lock_file" ]; then
    if ! (umask 077; set -C; : > "$lock_file") 2>/dev/null; then
      content_key_fail lock_file_create_failed
      return 1
    fi
  fi
  content_key_validate_lock_path "$lock_file" "$expected_owner" || return 1
  exec 9>>"$lock_file" || return 1
  content_key_validate_open_lock "$lock_file" "$expected_owner" 9 || return 1
  if ! flock -n 9; then
    content_key_fail release_lock_busy
    return 1
  fi
  content_key_validate_open_lock "$lock_file" "$expected_owner" 9 || return 1
}

content_key_cli_boundary() {
  release_root=$1
  expected_owner=$2
  lock_file=$3
  if [ "$release_root" = /opt/icao/runtime/releases ]; then
    if [ "$expected_owner" != 0 ] || [ "$lock_file" != /run/lock/icao-api-release.lock ]; then
      content_key_fail production_override_forbidden
      return 1
    fi
  fi
}

content_key_main() {
  command_name=${1:-}
  release_id=${2:-}
  upload_token=${3:-}
  release_root=${4:-}
  expected_owner=${5:-}
  lock_file=${6:-}
  if [ "$#" -ne 6 ]; then
    content_key_fail usage_stage_validate_cleanup
    return 1
  fi
  case "$command_name" in
    stage|validate|cleanup) ;;
    *) content_key_fail usage_stage_validate_cleanup; return 1 ;;
  esac
  for required_command in awk chmod cmp find flock grep mkdir mktemp stat; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      content_key_fail missing_required_command
      return 1
    fi
  done
  content_key_validate_owner "$expected_owner" || return 1
  content_key_cli_boundary "$release_root" "$expected_owner" "$lock_file" || return 1
  content_key_acquire_lock "$lock_file" "$expected_owner" || return 1
  case "$command_name" in
    stage) content_key_stage_create "$release_root" "$release_id" "$upload_token" "$expected_owner" || return 1 ;;
    validate)
      content_key_validate_stage \
        "$release_root" "$release_id" "$upload_token" "$expected_owner" pem absent || return 1
      ;;
    cleanup) content_key_cleanup_stage "$release_root" "$release_id" "$upload_token" "$expected_owner" || return 1 ;;
  esac
}

if [ "${ICAO_CONTENT_KEY_PROVISION_LIBRARY:-0}" != 1 ]; then
  content_key_main "$@"
fi
