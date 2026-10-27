import { readFile } from 'node:fs/promises';

import {
  PUBLIC_TABLE_ACCESS_CLASSIFICATION,
  SERVER_ONLY_PUBLIC_TABLES,
} from '../services/api/scripts/production-schema-contract-data.mjs';

const [
  applySource,
  migrateSource,
  rehearsalSource,
  databaseSchemaSource,
  clientTableGrantRevocationBase,
  clientTableGrantRevocationExtension,
  schemaVerifierSource,
  schemaContractLibSource,
  schemaContractTestSource,
  apiReleaseSource,
  opsReleaseSource,
  packageSource,
  apiPackageSource,
] = await Promise.all([
  readFile('scripts/apply-production-migrations.sh', 'utf8'),
  readFile('services/api/scripts/migrate.mjs', 'utf8'),
  readFile('scripts/rehearse-production-migrations.sh', 'utf8'),
  readFile('services/api/src/database/schema.ts', 'utf8'),
  readFile('services/api/drizzle/0034_revoke_client_table_grants.sql', 'utf8'),
  readFile('services/api/drizzle/0035_lowly_microbe.sql', 'utf8'),
  readFile('services/api/scripts/verify-production-schema-contract.mjs', 'utf8'),
  readFile('services/api/scripts/production-schema-contract-lib.mjs', 'utf8'),
  readFile('services/api/scripts/production-schema-contract-tests.mjs', 'utf8'),
  readFile('scripts/deploy-api-release.sh', 'utf8'),
  readFile('scripts/deploy-ops-release.sh', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('services/api/package.json', 'utf8'),
]);
const clientTableGrantRevocationSource = [
  clientTableGrantRevocationBase,
  clientTableGrantRevocationExtension,
  ...await Promise.all(['0042_weekly_ai_allowance', '0043_app_content_releases',
    '0044_account_login_methods', '0046_wechat_payment_attempts', '0047_local_admin_statistics', '0048_ai_trial_eligibility_reason', '0049_admin_global_allowances', '0052_content_work_orders', '0054_bouncy_xavin', '0056_vocabulary_live_releases']
    .map(tag => readFile(`services/api/drizzle/${tag}.sql`, 'utf8'))),
].join('\n');

for (const contract of [
  'check-mainline-release.mjs',
  '--print-confirmation',
  'ICAO_PRODUCTION_MIGRATION_CONFIRM',
  'APPLY_PRODUCTION_MIGRATIONS:',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN is required and must come from the read-only production ledger plan.',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN is derived from the immutable migration journal and must not be overridden.',
  'node "$CONTRACT_TOOL" derive-post',
  'services/api/drizzle/meta/_journal.json',
  'rehearse-production-migrations.sh',
  'parse-rehearsal',
  'characters unsafe for remote argument transport',
  'git archive --format=tar "$PAYLOAD_SOURCE_SHA"',
  '/opt/icao/runtime/production-migrations',
  '# BEGIN production-migration-upload-name-validation',
  '# END production-migration-upload-name-validation',
  '# BEGIN production-migration-remote-prepare',
  '# END production-migration-remote-prepare',
  'upload_identity=${upload#"$root"/uploads/source-}',
  'expected_upload=$root/uploads/source-$source_id-$upload_token.tar.gz',
  'expected_checksum=$expected_upload.sha256',
  '[ "${#source_id}" -ne 12 ]',
  '[ "${#upload_token}" -ne 32 ]',
  '# BEGIN production-migration-path-guard',
  '# END production-migration-path-guard',
  'stat -c \'%u:%a\'',
  'protected production migration path is a symlink:',
  'protected production lock path is a symlink:',
  'prepare_lock_file "$lock_path"',
  'icao-production-migration-apply.lock',
  'icao-production-migration-rehearsal.lock',
  'icao-postgres-backup.lock',
  'icao-production-release-change.lock',
  '# BEGIN production-migration-cutover-locks',
  '# END production-migration-cutover-locks',
  'backup_age',
  'rehearsal_age',
  'actual_backup_checksum_line=',
  'preexisting_fingerprint_mismatches',
  'cleanup_verified',
  'expected_image_release_id=production-migration-$source_id',
  'candidate_runtime_root=/run/icao-production-migrations',
  'candidate_runtime_env=$candidate_runtime_root/candidate-$source_id-$token_id.env',
  'candidate_runtime_env_created=1',
  'runtime_env_next=$runtime_api_dir/.env.next-$source_id-$token_id',
  'runtime_compose_next=$runtime_api_dir/docker-compose.yml.next-$source_id-$token_id',
  'runtime_source_next=$runtime_source.next',
  'install -m 600 "$candidate_runtime_env" "$runtime_env_next"',
  'install -m 600 "$work_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose_next"',
  'mv -- "$runtime_env_next" "$runtime_env"',
  'mv -- "$runtime_compose_next" "$runtime_compose"',
  'rm -f "$baked_image_env_file" "$pre_plan" "$post_plan" "$schema_contract"',
  'cp -a "$work_dir" "$runtime_source_next"',
  '# BEGIN production-migration-remote-cleanup',
  '# END production-migration-remote-cleanup',
  'could not remove protected candidate runtime environment:',
  'could not remove staged live runtime file:',
  'runtime source staging cleanup path is invalid',
  'trusted_python=/usr/bin/python3.10',
  '# BEGIN production-migration-trusted-python-guard',
  '# END production-migration-trusted-python-guard',
  '# BEGIN production-migration-trusted-python-runner',
  '# END production-migration-trusted-python-runner',
  '[ ! -f "$trusted_python" ] || [ -L "$trusted_python" ] || [ ! -x "$trusted_python" ]',
  "trusted_python_identity=$(stat -c '%u:%a' -- \"$trusted_python\")",
  '0:555|0:755',
  'run_trusted_python -I -c',
  '# BEGIN production-migration-image-identity-guard',
  '# END production-migration-image-identity-guard',
  "docker inspect --type image",
  "--format '{{json .Config.Env}}' \"$image\"",
  'run_trusted_python -I - "$baked_image_env_file" "$expected_image_release_id"',
  "entries = json.load(input_file)",
  "any(type(entry) is not str for entry in entries)",
  "entry.startswith('API_RELEASE_ID=')",
  'identities != [expected]',
  'production migration image baked identity is missing, duplicated, or mismatched',
  'test "$pre_summary" = "$expected_pre_plan"',
  'test "$post_summary" = "$expected_post_plan"',
  'scripts/migrate.mjs --production-apply',
  'ICAO_PRODUCTION_MIGRATION_APPLY="apply:$source_sha:$expected_pre_plan:$expected_post_plan"',
  'ICAO_PRODUCTION_MIGRATION_CONFIRM="$confirmation"',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN="$expected_pre_plan"',
  'ICAO_PRODUCTION_MIGRATION_EXPECTED_POST_PLAN="$expected_post_plan"',
  'migration-plan.mjs --require-current',
  'verify-production-schema-contract.mjs',
  'p.requiredTables !== p.expectedPublicTables',
  '!Number.isSafeInteger(p.expectedPublicTables)',
  'p.actualPublicTables !== p.expectedPublicTables',
  'production_migration_schema_contract_mismatch',
  'p.unclassifiedPublicTables !== 0',
  'p.missingPublicTables !== 0',
  'p.unexpectedPublicTableOwners !== 0',
  'p.defaultAclOwners !== 1',
  'p.serverOnlyClientDefaultTableGrants !== 0',
  'business_row_count_observation=non_authoritative_concurrent_activity_allowed',
  'auth_user_count_observation=non_authoritative_concurrent_activity_allowed',
  'data_preservation_authority=isolated_rehearsal_preexisting_table_fingerprint',
  'automatic_production_restore=forbidden',
  'after_migration_start_roll_forward_only_keep_old_api_closed',
  '# BEGIN production-migration-candidate-run-config-preflight',
  '# END production-migration-candidate-run-config-preflight',
  'services/api/dist/src/config-preflight.js',
  'stage=candidate_compose_preflight',
  'docker compose --env-file "$runtime_env_next" -f "$runtime_compose_next" config',
  '# BEGIN production-migration-cutover-drain-and-backup',
  '# END production-migration-cutover-drain-and-backup',
  'docker stop --time 60 icao-api',
  "test \"$old_api_state\" = 'true healthy'",
  'expected_old_image=$(docker image inspect --format',
  'test "$old_running_image" = "$expected_old_image"',
  'test "$observed_old_release_id" = "$old_running_release_id"',
  "'0 false'|'143 false'",
  'old API did not complete a graceful non-OOM drain:',
  'cutover_backup=$(/bin/sh "$backup_tool")',
  'test "$cutover_backup_mtime" -ge "$drain_completed_epoch"',
  '# BEGIN production-migration-cutover-failure-policy',
  '# END production-migration-cutover-failure-policy',
  'Apply a reviewed forward-fix from a newer origin/main.',
  '# BEGIN production-migration-cutover-cleanup-on-exit',
  '# END production-migration-cutover-cleanup-on-exit',
  "trap '' HUP INT TERM",
  'cleanup_in_progress=1',
  'post_cutover_housekeeping_failure_new_api_left_active',
  'post_migration_roll_forward_only_api_closed',
  'failure_origin_stage=$stage',
  '# BEGIN production-migration-cutover-new-api',
  '# END production-migration-cutover-new-api',
  'docker compose -f "$runtime_compose" up -d --force-recreate api',
  'cutover_committed=1',
  'restore-isolated.sh',
  'unavailable_post_drain_backup_not_created',
  'publish_evidence failed',
  'publish_evidence succeeded',
  'require_root_owned_path file "$partial" 600',
  'mv -- "$partial" "$evidence"',
  'publication_state=complete',
  'production_migration_apply_ok',
]) {
  if (!applySource.includes(contract)) {
    throw new Error(`production_migration_apply_contract_missing:${contract}`);
  }
}

for (const contract of [
  '# BEGIN migration-rehearsal-schema-contract-verification',
  '# END migration-rehearsal-schema-contract-verification',
  'services/api/scripts/verify-production-schema-contract.mjs',
  '-e ICAO_PRODUCTION_DATABASE_NAME="$database_name"',
  'p.requiredTables !== p.expectedPublicTables',
  '!Number.isSafeInteger(p.expectedPublicTables)',
  'p.actualPublicTables !== p.expectedPublicTables',
  'migration_rehearsal_schema_contract_mismatch',
  'p.serverOnlyClientGrants !== 0',
  'p.unexpectedPublicTableOwners !== 0',
  'p.defaultAclOwners !== 1',
  'p.serverOnlyClientDefaultTableGrants !== 0',
  "printf 'schema_contract_verified=1\\n'",
  "printf 'schema_contract_sha256=%s\\n' \"$schema_contract_sha\"",
]) {
  if (!rehearsalSource.includes(contract)) {
    throw new Error(`production_migration_rehearsal_schema_contract_missing:${contract}`);
  }
}
if (applySource.includes('p.requiredTables !== 56') || rehearsalSource.includes('p.requiredTables !== 56')) {
  throw new Error('production_migration_schema_contract_stale_required_table_count');
}
for (const contract of [
  'test "$(evidence_value schema_contract_verified)" = 1',
  'rehearsal_schema_contract_sha=$(evidence_value schema_contract_sha256)',
  'rehearsal_schema_contract_sha256=$rehearsal_schema_contract_sha',
]) {
  if (!applySource.includes(contract)) {
    throw new Error(`production_migration_apply_rehearsal_schema_evidence_missing:${contract}`);
  }
}

const trustedPythonRunnerStart = applySource.indexOf('# BEGIN production-migration-trusted-python-runner');
const trustedPythonRunnerEnd = applySource.indexOf('# END production-migration-trusted-python-runner');
const trustedPythonRunnerSource = applySource.slice(trustedPythonRunnerStart, trustedPythonRunnerEnd);
const trustedPythonClearedEnvironment = [
  'LD_AUDIT',
  'GLIBC_TUNABLES',
  'LD_ASSUME_KERNEL',
  'LD_BIND_NOW',
  'LD_BIND_NOT',
  'LD_DEBUG',
  'LD_DEBUG_OUTPUT',
  'LD_DYNAMIC_WEAK',
  'LD_HWCAP_MASK',
  'LD_LIBRARY_PATH',
  'LD_ORIGIN_PATH',
  'LD_POINTER_GUARD',
  'LD_PREFER_MAP_32BIT_EXEC',
  'LD_PRELOAD',
  'LD_PROFILE',
  'LD_PROFILE_OUTPUT',
  'LD_SHOW_AUXV',
  'LD_TRACE_LOADED_OBJECTS',
  'LD_USE_LOAD_BIAS',
  'LD_VERBOSE',
  'LD_WARN',
  'PYTHONBREAKPOINT',
  'PYTHONCOERCECLOCALE',
  'PYTHONDONTWRITEBYTECODE',
  'PYTHONHASHSEED',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONIOENCODING',
  'PYTHONNOUSERSITE',
  'PYTHONPATH',
  'PYTHONPLATLIBDIR',
  'PYTHONSAFEPATH',
  'PYTHONSTARTUP',
  'PYTHONUSERBASE',
  'PYTHONUTF8',
  'PYTHONWARNINGS',
];
if (trustedPythonRunnerStart < 0
  || trustedPythonRunnerEnd <= trustedPythonRunnerStart
  || applySource.lastIndexOf('# BEGIN production-migration-trusted-python-runner')
    !== trustedPythonRunnerStart
  || applySource.lastIndexOf('# END production-migration-trusted-python-runner')
    !== trustedPythonRunnerEnd
  || (applySource.match(/run_trusted_python -I /gu) ?? []).length !== 2
  || !trustedPythonRunnerSource.includes('run_trusted_python() (')
  || !trustedPythonRunnerSource.includes('  unset \\')
  || !trustedPythonRunnerSource.includes('  exec "$trusted_python" "$@"')
  || trustedPythonRunnerSource.includes('/usr/bin/env')
  || /^\s+(?:LD_|GLIBC_TUNABLES|PYTHON)[A-Z0-9_]*=/mu.test(trustedPythonRunnerSource)) {
  throw new Error('production_migration_trusted_python_runner_contract_invalid');
}
for (const [index, variable] of trustedPythonClearedEnvironment.entries()) {
  const suffix = index === trustedPythonClearedEnvironment.length - 1 ? '' : ' \\';
  const exactUnsetEntry = `    ${variable}${suffix}`;
  if (trustedPythonRunnerSource.split('\n').filter((line) => line === exactUnsetEntry).length !== 1) {
    throw new Error(`production_migration_trusted_python_environment_not_cleared:${variable}`);
  }
}

const extractMarkedBlock = (kind, name) => {
  const startMarker = `# BEGIN production-migration-${kind}-${name}`;
  const endMarker = `# END production-migration-${kind}-${name}`;
  const start = applySource.indexOf(startMarker);
  const end = applySource.indexOf(endMarker);
  if (start < 0 || end <= start
    || applySource.lastIndexOf(startMarker) !== start
    || applySource.lastIndexOf(endMarker) !== end) {
    throw new Error(`production_migration_marked_command_invalid:${kind}:${name}`);
  }
  return applySource.slice(start, end + endMarker.length);
};

const parseDockerRunPrefix = (block) => {
  const normalized = block
    .replace(/#[^\n]*(?:\n|$)/gu, ' ')
    .replace(/\\\n/gu, ' ')
    .replace(/["']/gu, ' ');
  const imageIndex = normalized.indexOf('$image');
  if (imageIndex < 0) throw new Error('production_migration_candidate_image_argument_missing');
  const tokens = normalized.slice(0, imageIndex).trim().split(/\s+/u);
  const env = [];
  const entrypoints = [];
  let envFileCount = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--env-file') {
      envFileCount += 1;
      index += 1;
    } else if (token.startsWith('--env-file=')) {
      envFileCount += 1;
    } else if (token === '-e' || token === '--env') {
      env.push(tokens[index + 1] ?? '');
      index += 1;
    } else if (token.startsWith('--env=')) {
      env.push(token.slice('--env='.length));
    } else if (token.startsWith('-e') && token !== '-e') {
      env.push(token.slice(2));
    } else if (token === '--entrypoint') {
      entrypoints.push(tokens[index + 1] ?? '');
      index += 1;
    } else if (token.startsWith('--entrypoint=')) {
      entrypoints.push(token.slice('--entrypoint='.length));
    }
  }
  return { entrypoints, env, envFileCount };
};

const assertNodeRuntimeContract = (block, requiresRuntimeBinding) => {
  const { entrypoints, env, envFileCount } = parseDockerRunPrefix(block);
  const valuesFor = (name) => env.filter((entry) => entry === name || entry.startsWith(`${name}=`));
  const expected = new Map([
    ['NODE_OPTIONS', 'NODE_OPTIONS='],
    ['NODE_PATH', 'NODE_PATH='],
    ['LD_PRELOAD', 'LD_PRELOAD='],
    ['LD_LIBRARY_PATH', 'LD_LIBRARY_PATH='],
  ]);
  if (requiresRuntimeBinding) expected.set('API_RELEASE_ID', 'API_RELEASE_ID=$expected_image_release_id');
  for (const [name, value] of expected) {
    const matches = valuesFor(name);
    if (matches.length !== 1 || matches[0] !== value) {
      throw new Error(`production_migration_candidate_env_override_invalid:${name}`);
    }
  }
  if (!requiresRuntimeBinding && valuesFor('API_RELEASE_ID').length !== 0) {
    throw new Error('production_migration_evidence_parser_identity_override_forbidden');
  }
  if (envFileCount !== (requiresRuntimeBinding ? 1 : 0)) {
    throw new Error('production_migration_candidate_env_file_contract_invalid');
  }
  if (entrypoints.length !== 1 || entrypoints[0] !== '/usr/local/bin/node') {
    throw new Error('production_migration_candidate_entrypoint_override_invalid');
  }
};

for (const name of ['config-preflight', 'target', 'pre-plan', 'apply', 'post-current', 'post-plan', 'schema']) {
  assertNodeRuntimeContract(extractMarkedBlock('candidate-run', name), true);
}
for (const name of ['pre-plan', 'post-plan', 'schema']) {
  assertNodeRuntimeContract(extractMarkedBlock('evidence-parser', name), false);
}
const canonicalApplyCommand = extractMarkedBlock('candidate-run', 'apply');
const exactIdentityOptionLine = '  -e "API_RELEASE_ID=$expected_image_release_id" \\\n';
const staticAdversarialCommands = [
  canonicalApplyCommand.replace(
    exactIdentityOptionLine,
    `${exactIdentityOptionLine}  -e \\\n    "API_RELEASE_ID=release-old" \\\n`,
  ),
  canonicalApplyCommand.replace(
    exactIdentityOptionLine,
    `${exactIdentityOptionLine}  "-e" "API_RELEASE_ID=release-old" \\\n`,
  ),
  canonicalApplyCommand.replace(
    exactIdentityOptionLine,
    `${exactIdentityOptionLine}  -e API_RELEASE_ID \\\n`,
  ),
];
for (const adversarial of staticAdversarialCommands) {
  if (adversarial === canonicalApplyCommand) {
    throw new Error('production_migration_static_argv_self_test_setup_failed');
  }
  let rejected = false;
  try {
    assertNodeRuntimeContract(adversarial, true);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('production_migration_static_argv_adversarial_not_rejected');
}
const canonicalEvidenceParser = extractMarkedBlock('evidence-parser', 'schema');
const unsafeEvidenceParser = canonicalEvidenceParser.replace(' -e LD_PRELOAD=', '');
let unsafeEvidenceParserRejected = false;
try {
  assertNodeRuntimeContract(unsafeEvidenceParser, false);
} catch {
  unsafeEvidenceParserRejected = true;
}
if (!unsafeEvidenceParserRejected) {
  throw new Error('production_migration_static_evidence_parser_adversarial_not_rejected');
}

const imageIdentityStart = applySource.indexOf('# BEGIN production-migration-image-identity-guard');
const imageIdentityEnd = applySource.indexOf('# END production-migration-image-identity-guard');
const imageIdentitySource = applySource.slice(imageIdentityStart, imageIdentityEnd);
if (
  imageIdentityStart < 0
  || imageIdentityEnd <= imageIdentityStart
  || imageIdentitySource.includes('{{println')
  || imageIdentitySource.includes('baked_release_id_count')
  || imageIdentitySource.includes('docker run')
) {
  throw new Error('production_migration_baked_image_env_array_boundary_not_preserved');
}
if (applySource.includes('"$image" node')) {
  throw new Error('production_migration_candidate_image_entrypoint_not_overridden');
}

if (
  !applySource.includes('PRINT_CONFIRMATION=1')
  || !applySource.includes('check-mainline-release.mjs" --root "$SOURCE_ROOT" >/dev/null')
) {
  throw new Error('production_migration_confirmation_stdout_not_unique');
}

for (const dangerousContract of [
  /dropdb[^\n]*\bpostgres\b/u,
  /pg_restore[^\n]*-d[ ="']+postgres\b/u,
  /psql[^\n]*\b(drop database|truncate|delete from)\b/iu,
  /automatic_production_restore=(?:enabled|true|1)/u,
]) {
  if (dangerousContract.test(applySource)) {
    throw new Error(`production_migration_apply_dangerous_contract:${dangerousContract}`);
  }
}

const migrateStart = applySource.indexOf('scripts/migrate.mjs --production-apply');
const confirmationCheck = applySource.indexOf('node "$CONTRACT_TOOL" confirm');
const rehearsalStart = applySource.indexOf('scripts/rehearse-production-migrations.sh');
const remoteStart = applySource.indexOf("<<'REMOTE'");
const configPreflight = applySource.indexOf('stage=candidate_configuration_preflight', remoteStart);
const composePreflight = applySource.indexOf('stage=candidate_compose_preflight', configPreflight);
const runtimeEnvStage = applySource.indexOf('install -m 600 "$candidate_runtime_env" "$runtime_env_next"', composePreflight);
const runtimeComposeStage = applySource.indexOf('install -m 600 "$work_dir/infra/api/docker-compose.runtime.yml" "$runtime_compose_next"', runtimeEnvStage);
const composeConfigValidation = applySource.indexOf('docker compose --env-file "$runtime_env_next" -f "$runtime_compose_next" config', runtimeComposeStage);
const drain = applySource.indexOf('stage=old_api_drain', composePreflight);
const recoveryBackup = applySource.indexOf('stage=post_drain_backup', drain);
const postCurrent = applySource.indexOf('migration-plan.mjs --require-current', migrateStart);
const schemaVerification = applySource.indexOf('verify-production-schema-contract.mjs', postCurrent);
const newApiCutover = applySource.indexOf('stage=new_api_cutover', schemaVerification);
const runtimeEnvCommit = applySource.indexOf('mv -- "$runtime_env_next" "$runtime_env"', newApiCutover);
const runtimeComposeCommit = applySource.indexOf('mv -- "$runtime_compose_next" "$runtime_compose"', runtimeEnvCommit);
const newApiLiveVerifier = applySource.indexOf('services/api/scripts/verify-live.mjs', newApiCutover);
const newApiReleaseHeader = applySource.indexOf('test "$active_release_id" = "$expected_image_release_id"', newApiLiveVerifier);
const cutoverCommit = applySource.indexOf('cutover_committed=1', newApiCutover);
const sourceHousekeeping = applySource.indexOf('stage=runtime_source_housekeeping', cutoverCommit);
const generatedArtifactCleanup = applySource.indexOf('rm -f "$baked_image_env_file" "$pre_plan" "$post_plan" "$schema_contract"', sourceHousekeeping);
const runtimeSourceCopy = applySource.indexOf('cp -a "$work_dir" "$runtime_source_next"', generatedArtifactCleanup);
const cleanup = applySource.indexOf('cleanup_remote_resources\ncleanup_verified=1', cutoverCommit);
const success = applySource.indexOf('publish_evidence succeeded', cleanup);
if ([confirmationCheck, rehearsalStart, remoteStart, configPreflight, composePreflight, runtimeEnvStage,
  runtimeComposeStage, composeConfigValidation, drain, recoveryBackup,
  migrateStart, postCurrent, schemaVerification, newApiCutover, newApiLiveVerifier, newApiReleaseHeader,
  runtimeEnvCommit, runtimeComposeCommit, cutoverCommit, sourceHousekeeping, generatedArtifactCleanup,
  runtimeSourceCopy, cleanup, success]
  .some((value) => value < 0)
    || !(confirmationCheck < rehearsalStart && rehearsalStart < remoteStart
      && remoteStart < configPreflight && configPreflight < composePreflight
      && composePreflight < runtimeEnvStage && runtimeEnvStage < runtimeComposeStage
      && runtimeComposeStage < composeConfigValidation && composeConfigValidation < drain
      && drain < recoveryBackup
      && recoveryBackup < migrateStart)
    || !(migrateStart < postCurrent && postCurrent < schemaVerification
      && schemaVerification < newApiCutover && newApiCutover < runtimeEnvCommit
      && runtimeEnvCommit < runtimeComposeCommit && runtimeComposeCommit < newApiLiveVerifier
      && newApiLiveVerifier < newApiReleaseHeader && newApiReleaseHeader < cutoverCommit
      && cutoverCommit < sourceHousekeeping && sourceHousekeeping < generatedArtifactCleanup
      && generatedArtifactCleanup < runtimeSourceCopy && runtimeSourceCopy < cleanup && cleanup < success)) {
  throw new Error('production_migration_apply_success_order_invalid');
}

if (
  !migrateSource.includes("'--development-apply'")
  || !migrateSource.includes("'--isolated-rehearsal'")
  || !migrateSource.includes("'--production-apply'")
  || !migrateSource.includes('migration_mode_required')
  || !migrateSource.includes('development_migration_forbidden_in_production')
  || !migrateSource.includes('production_migration_wrapper_authorization_missing')
  || !migrateSource.includes('production_migration_confirmation_binding_missing')
  || !migrateSource.includes('production_migration_image_identity_mismatch')
  || !migrateSource.includes('production_migration_database_target_invalid')
  || !migrateSource.includes('migration_rehearsal_wrapper_authorization_missing')
  || !migrateSource.includes('migration_rehearsal_image_identity_mismatch')
  || !migrateSource.includes('migration_rehearsal_database_target_invalid')
  || !migrateSource.includes('pg_try_advisory_lock')
  || !migrateSource.includes('pg_advisory_unlock')
  || !migrateSource.includes("lock_timeout: '15s'")
) {
  throw new Error('database_migrator_production_guard_incomplete');
}
if (
  !apiPackageSource.includes('"migration:apply": "node scripts/migrate.mjs --development-apply"')
  || !rehearsalSource.includes('scripts/migrate.mjs --isolated-rehearsal')
  || !rehearsalSource.includes('ICAO_MIGRATION_REHEARSAL_AUTHORIZATION="rehearse:$source_sha:$database_name"')
) {
  throw new Error('database_migrator_entrypoint_guard_incomplete');
}

for (const contract of [
  "default_transaction_read_only: true",
  "parsedUrl.hostname !== 'db'",
  "parsedUrl.search !== ''",
  "parsedUrl.pathname !== `/${expectedDatabase}`",
  'production_schema_has_unvalidated_constraints',
  "from information_schema.tables",
  "table_schema = 'public'",
  "table_type = 'BASE TABLE'",
  'actualTables: actualPublicTables',
  'expectedTables: serverOnlyTables',
  'assertPublicTableSecurityContract',
  'join pg_roles owner_role on owner_role.oid = table_state.relowner',
  "owner_role.rolname <> 'postgres'",
  'unexpectedOwnerCount: unexpectedPublicTableOwners?.count',
  'from pg_default_acl default_acl',
  'aclexplode(default_acl.defaclacl)',
  "owner_role.rolname = 'postgres'",
  'privilege.grantee = 0',
  "client_role.rolname in ('anon', 'authenticated')",
  'production_privacy_schema_columns_incomplete',
  'production_content_device_digest_still_present',
  'production_commerce_product_catalog_mismatch',
  'production_apple_product_mapping_mismatch',
]) {
  if (!schemaVerifierSource.includes(contract)) {
    throw new Error(`production_schema_verifier_contract_missing:${contract}`);
  }
}
if (!schemaVerifierSource.includes("expectedDatabase = process.env.ICAO_PRODUCTION_DATABASE_NAME")) {
  throw new Error('production_schema_verifier_database_binding_missing');
}
if ((schemaVerifierSource.match(/transaction\.array\(actualPublicTables\)/gu) ?? []).length < 3) {
  throw new Error('production_schema_verifier_must_check_all_actual_tables');
}
const assertSchemaVerifierOwnerScope = (source) => {
  if (
    (source.match(/owner_role\.rolname = 'postgres'/gu) ?? []).length !== 2
    || source.includes('supabase_admin')
    || !source.includes("owner_role.rolname <> 'postgres'")
    || !source.includes('unexpectedOwnerCount: unexpectedPublicTableOwners?.count')
    || !source.includes('assert(defaultAclOwners?.count === 1')
    || !source.includes('privilege.grantee = 0')
    || !source.includes("client_role.rolname in ('anon', 'authenticated')")
  ) {
    throw new Error('production_schema_verifier_default_acl_owner_scope_invalid');
  }
};
assertSchemaVerifierOwnerScope(schemaVerifierSource);
for (const unsafeMutation of [
  schemaVerifierSource.replace(
    "owner_role.rolname = 'postgres'",
    "owner_role.rolname in ('postgres', 'supabase_admin')",
  ),
  schemaVerifierSource.replace("owner_role.rolname <> 'postgres'", 'false'),
  schemaVerifierSource.replace('privilege.grantee = 0', 'false'),
]) {
  let rejected = false;
  try {
    assertSchemaVerifierOwnerScope(unsafeMutation);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('production_schema_verifier_owner_scope_mutation_accepted');
}
for (const failureCode of [
  'production_schema_unclassified_public_tables:',
  'production_schema_missing_public_tables:',
  'production_schema_required_rls_disabled',
  'production_schema_server_only_table_grant_present',
  'production_schema_server_only_default_table_grant_present',
  'production_schema_unexpected_public_table_owner',
]) {
  if (!schemaContractLibSource.includes(failureCode)) {
    throw new Error(`production_schema_contract_failure_missing:${failureCode}`);
  }
}
for (const liveFailureContract of [
  'unexpected_public_table',
  'production_schema_unclassified_public_tables:1',
  'clientGrantCount: 1',
  'production_schema_server_only_table_grant_present',
  'clientDefaultGrantCount: 1',
  'production_schema_server_only_default_table_grant_present',
  'unexpectedOwnerCount: 1',
  'production_schema_unexpected_public_table_owner',
]) {
  if (!schemaContractTestSource.includes(liveFailureContract)) {
    throw new Error(`production_schema_live_verifier_test_missing:${liveFailureContract}`);
  }
}
const schemaPublicTables = [...databaseSchemaSource.matchAll(/pgTable\('([^']+)'/gu)]
  .map((match) => match[1])
  .sort();
if (
  schemaPublicTables.length !== 68
  || JSON.stringify(schemaPublicTables) !== JSON.stringify(SERVER_ONLY_PUBLIC_TABLES)
  || JSON.stringify(Object.keys(PUBLIC_TABLE_ACCESS_CLASSIFICATION).sort())
    !== JSON.stringify(schemaPublicTables)
  || Object.values(PUBLIC_TABLE_ACCESS_CLASSIFICATION)
    .some((classification) => classification !== 'server_only')
) {
  throw new Error('production_schema_public_table_classification_incomplete');
}
if (!schemaVerifierSource.includes('SERVER_ONLY_PUBLIC_TABLES')) {
  throw new Error('production_schema_verifier_canonical_table_source_missing');
}
const postgresDefaultAclRevocation = 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;';
const assertClientTableGrantRevocationContract = (source) => {
  const revokedClientTables = [...new Set([...source.matchAll(
    /^REVOKE ALL(?: PRIVILEGES)? ON (?:TABLE )?([^;]+?) FROM anon, authenticated;/gmu,
  )].flatMap((match) => match[1].split(',').map(table => table.trim().replace(/^"?public"?\./u, '').replaceAll('"', ''))))].sort();
  const defaultAclStatements = source.match(/ALTER DEFAULT PRIVILEGES[^;]*;/gu) ?? [];
  if (
    JSON.stringify(revokedClientTables) !== JSON.stringify(SERVER_ONLY_PUBLIC_TABLES)
    || defaultAclStatements.length !== 1
    || defaultAclStatements[0] !== postgresDefaultAclRevocation
    || source.includes('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin')
    || source.includes('FROM service_role')
  ) {
    throw new Error('production_schema_client_table_grant_revocation_incomplete');
  }
};
assertClientTableGrantRevocationContract(clientTableGrantRevocationSource);
for (const unsafeMutation of [
  clientTableGrantRevocationSource.replace(
    postgresDefaultAclRevocation,
    `${postgresDefaultAclRevocation}\nALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;`,
  ),
  clientTableGrantRevocationSource.replace('FROM anon, authenticated;', 'FROM anon, authenticated, service_role;'),
]) {
  let rejected = false;
  try {
    assertClientTableGrantRevocationContract(unsafeMutation);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('production_schema_client_table_grant_revocation_mutation_accepted');
}

const imageCleanupStart = applySource.indexOf('# BEGIN production-migration-image-cleanup');
const imageCleanupEnd = applySource.indexOf('# END production-migration-image-cleanup');
const imageCleanupSource = applySource.slice(imageCleanupStart, imageCleanupEnd);
const evidenceStart = applySource.indexOf('# BEGIN production-migration-evidence-publication');
const evidenceEnd = applySource.indexOf('# END production-migration-evidence-publication');
const evidenceSource = applySource.slice(evidenceStart, evidenceEnd);
if (
  imageCleanupStart < 0
  || imageCleanupEnd <= imageCleanupStart
  || !imageCleanupSource.includes('if ! docker image inspect "$image"')
  || !imageCleanupSource.includes('if ! docker image rm "$image"')
  || !imageCleanupSource.includes('if ! remaining_images=$(docker image ls')
  || !imageCleanupSource.includes('production migration image still exists after cleanup:')
  || evidenceStart < 0
  || evidenceEnd <= evidenceStart
  || !evidenceSource.includes('if ! (set -C; : > "$partial")')
  || !evidenceSource.includes('if ! chmod 600 "$partial" "$confirmation_input"')
  || !evidenceSource.includes('if ! rm -f "$confirmation_input"')
  || !evidenceSource.includes('if ! require_root_owned_path file "$partial" 600')
  || !evidenceSource.includes('if ! mv -- "$partial" "$evidence"')
  || !evidenceSource.includes('production migration evidence staging cleanup failed')
  || evidenceSource.includes('ln "$partial" "$evidence"')
  || evidenceSource.includes('|| true')
) {
  throw new Error('production_migration_cleanup_or_evidence_guard_incomplete');
}

if (
  /test "\$after_(?:card_states|learning_records|documents|changes|auth_users)" -(?:eq|ge|gt|le|lt) /u
    .test(applySource)
  || !applySource.includes('business_row_count_observation=non_authoritative_concurrent_activity_allowed')
  || !applySource.includes('data_preservation_authority=isolated_rehearsal_preexisting_table_fingerprint')
) {
  throw new Error('production_migration_live_row_counts_must_be_non_authoritative');
}

const rollbackBlock = opsReleaseSource.match(/<<'REMOTE_ROLLBACK'\n([\s\S]*?)\nREMOTE_ROLLBACK/u)?.[1];
if (
  !rollbackBlock
  || !rollbackBlock.includes('/run/lock/icao-ops-release.lock')
  || !rollbackBlock.includes('/run/lock/icao-production-release-change.lock')
  || rollbackBlock.indexOf('/run/lock/icao-ops-release.lock')
    > rollbackBlock.indexOf('/run/lock/icao-production-release-change.lock')
) {
  throw new Error('ops_rollback_shared_release_lock_missing_or_misordered');
}

for (const releaseSource of [apiReleaseSource, opsReleaseSource]) {
  if (!releaseSource.includes('icao-production-release-change.lock')) {
    throw new Error('production_release_change_lock_missing');
  }
}
if (
  !packageSource.includes('check:production-migration')
  || !packageSource.includes('production-migration-apply-tests.mjs')
  || !packageSource.includes('production-schema-contract-tests.mjs')
  || !packageSource.includes('check-production-migration-apply.mjs')
  || !packageSource.includes('scripts/apply-production-migrations.sh')
) {
  throw new Error('production_migration_release_gate_missing');
}

console.log('Production migration apply contracts verified.');
