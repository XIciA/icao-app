import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const helper = resolve('infra/api/content-signing-key-provision.sh');
const releaseCommon = resolve('scripts/lib/release-common.sh');
const apiRelease = resolve('scripts/deploy-api-release.sh');
const uid = process.getuid?.();

if (!Number.isInteger(uid)) {
  throw new Error('The content signing-key provisioning tests require a POSIX user ID.');
}

const hash = (content) => createHash('sha256').update(content).digest('hex');
const mode = async (path) => (await lstat(path)).mode & 0o777;
const token = (character) => character.repeat(32);
const oldImageId = `sha256:${'a'.repeat(64)}`;

async function createFixture() {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'icao-content-key-provision-')));
  await chmod(temporary, 0o700);
  const releaseRoot = join(temporary, 'releases');
  const fakeBin = join(temporary, 'bin');
  const lockFile = join(temporary, 'release.lock');
  const lockLog = join(temporary, 'flock.log');
  const commandLog = join(temporary, 'commands.log');
  await mkdir(releaseRoot, { mode: 0o700 });
  await mkdir(fakeBin, { mode: 0o700 });
  await writeFile(join(fakeBin, 'flock'), `#!/bin/sh
printf '%s\n' "$*" >> "$ICAO_TEST_FLOCK_LOG"
exit "\${ICAO_TEST_FLOCK_EXIT:-0}"
`, { mode: 0o700 });
  await writeFile(join(fakeBin, 'docker'), `#!/bin/sh
printf 'docker %s\n' "$*" >> "$ICAO_TEST_COMMAND_LOG"
if [ "$1" = exec ]; then
  printf '%s' "$ICAO_TEST_ROLLBACK_RELEASE_ID"
fi
if [ "$1" = inspect ]; then
  printf '%s' "$ICAO_TEST_ROLLBACK_IMAGE_ID"
fi
if [ "\${ICAO_TEST_DOCKER_FAIL_COMPOSE:-0}" = 1 ] && [ "$1" = compose ]; then
  exit 19
fi
`, { mode: 0o700 });
  await writeFile(join(fakeBin, 'curl'), `#!/bin/sh
printf 'curl %s\n' "$*" >> "$ICAO_TEST_COMMAND_LOG"
exit "\${ICAO_TEST_CURL_EXIT:-0}"
`, { mode: 0o700 });
  return {
    temporary,
    releaseRoot,
    fakeBin,
    lockFile,
    lockLog,
    commandLog,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ICAO_TEST_FLOCK_LOG: lockLog,
      ICAO_TEST_COMMAND_LOG: commandLog,
      ICAO_TEST_ROLLBACK_RELEASE_ID: 'old-release',
      ICAO_TEST_ROLLBACK_IMAGE_ID: oldImageId,
    },
  };
}

function runPublicUrlValidation(value) {
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu
. "$1"
require_public_https_url ICAO_TEST_URL "$2"
`,
    'release-url-test',
    releaseCommon,
    value,
  ], { encoding: 'utf8' });
}

function runOpenLockValidation(fixture, openedFile, checkedFile) {
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu
exec 8>>"$2"
ICAO_CONTENT_KEY_PROVISION_LIBRARY=1
. "$1"
content_key_validate_open_lock "$3" "$4" 8
`,
    'content-key-open-lock-test',
    helper,
    openedFile,
    checkedFile,
    String(uid),
  ], {
    encoding: 'utf8',
    env: fixture.env,
  });
}

function runCli(fixture, command, releaseId, uploadToken, extra = {}) {
  return spawnSync('/bin/sh', [
    helper,
    command,
    releaseId,
    uploadToken,
    fixture.releaseRoot,
    String(uid),
    fixture.lockFile,
  ], {
    encoding: 'utf8',
    env: { ...fixture.env, ...extra },
  });
}

function runFunction(fixture, functionName, args, extra = {}) {
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu
ICAO_CONTENT_KEY_PROVISION_LIBRARY=1
. "$1"
shift
function_name=$1
shift
"$function_name" "$@"
`,
    'content-key-test',
    helper,
    functionName,
    ...args,
  ], {
    encoding: 'utf8',
    env: { ...fixture.env, ...extra },
  });
}

function runConditionalFunction(fixture, functionName, args, extra = {}) {
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu
ICAO_CONTENT_KEY_PROVISION_LIBRARY=1
. "$1"
shift
function_name=$1
shift
if "$function_name" "$@"; then
  exit 0
fi
exit 23
`,
    'content-key-conditional-test',
    helper,
    functionName,
    ...args,
  ], {
    encoding: 'utf8',
    env: { ...fixture.env, ...extra },
  });
}

function runPreflightFailure(fixture, args) {
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu
ICAO_CONTENT_KEY_PROVISION_LIBRARY=1
. "$1"
shift
content_key_prepare_candidate_env "$1" "$2" "$3" "$4" "$5"
false
content_key_install_candidate_env "$1" "$2" "$3" "$4" "$5" "$6"
`,
    'content-key-preflight-failure-test',
    helper,
    ...args,
  ], {
    encoding: 'utf8',
    env: fixture.env,
  });
}

function privateKeyPem() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return privateKey.export({ format: 'pem', type: 'pkcs8' });
}

async function stageKey(fixture, releaseId, uploadToken, pem = privateKeyPem()) {
  const staged = runCli(fixture, 'stage', releaseId, uploadToken);
  assert.equal(staged.status, 0, staged.stderr);
  const privateKeyPath = staged.stdout.trim();
  await writeFile(privateKeyPath, pem, { mode: 0o600 });
  await chmod(privateKeyPath, 0o600);
  return privateKeyPath;
}

test('staging is unique, private, lock-protected, and cleaned exactly', async () => {
  const fixture = await createFixture();
  try {
    const releaseId = '1.0.0-test';
    const firstToken = token('a');
    const secondToken = token('b');
    const firstPath = await stageKey(fixture, releaseId, firstToken);
    const secondPath = await stageKey(fixture, releaseId, secondToken);
    assert.notEqual(firstPath, secondPath);
    assert.equal(await mode(dirname(firstPath)), 0o700);
    assert.equal(await mode(firstPath), 0o600);

    const repeated = runCli(fixture, 'stage', releaseId, firstToken);
    assert.notEqual(repeated.status, 0);
    const validated = runCli(fixture, 'validate', releaseId, firstToken);
    assert.equal(validated.status, 0, validated.stderr);
    const cleaned = runCli(fixture, 'cleanup', releaseId, firstToken);
    assert.equal(cleaned.status, 0, cleaned.stderr);
    await assert.rejects(lstat(dirname(firstPath)));
    assert.equal((await readFile(fixture.lockLog, 'utf8')).trim().split('\n').length, 5);

    const secondCleanup = runCli(fixture, 'cleanup', releaseId, secondToken);
    assert.equal(secondCleanup.status, 0, secondCleanup.stderr);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('release URLs reject whitespace, CRLF, and remote-shell metacharacters', () => {
  assert.equal(runPublicUrlValidation('https://registry.npmmirror.com').status, 0);
  for (const malicious of [
    'https://registry.example.com path',
    'https://registry.example.com\tpath',
    'https://registry.example.com\npath',
    'https://registry.example.com\r\npath',
    'https://registry.example.com;touch-pwned',
    'https://registry.example.com$(touch-pwned)',
    'https://registry.example.com`touch-pwned`',
    'https://registry.example.com&touch-pwned',
    'https://registry.example.com|touch-pwned',
    'https://registry.example.com?token=value',
  ]) {
    const rejected = runPublicUrlValidation(malicious);
    assert.notEqual(rejected.status, 0, `unsafe URL unexpectedly accepted: ${JSON.stringify(malicious)}`);
    assert.match(rejected.stderr, /cannot be passed to a remote release command/u);
  }
});

test('release locks preserve existing bytes and reject links, unsafe modes, and inode mismatch', async () => {
  const fixture = await createFixture();
  try {
    const sentinel = Buffer.from('lock-must-not-be-truncated\n');
    await writeFile(fixture.lockFile, sentinel, { mode: 0o600 });
    const staged = runCli(fixture, 'stage', 'lock-preservation', token('1'));
    assert.equal(staged.status, 0, staged.stderr);
    assert.equal(hash(await readFile(fixture.lockFile)), hash(sentinel));
    assert.equal(runCli(fixture, 'cleanup', 'lock-preservation', token('1')).status, 0);

    const externalLock = join(fixture.temporary, 'external-lock');
    await writeFile(externalLock, sentinel, { mode: 0o600 });
    await rm(fixture.lockFile);
    await symlink(externalLock, fixture.lockFile);
    const linked = runCli(fixture, 'stage', 'lock-link', token('2'));
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /lock_file_symlink_rejected/u);
    assert.equal(hash(await readFile(externalLock)), hash(sentinel));

    await rm(fixture.lockFile);
    await writeFile(fixture.lockFile, sentinel, { mode: 0o644 });
    const permissive = runCli(fixture, 'stage', 'lock-mode', token('3'));
    assert.notEqual(permissive.status, 0);
    assert.match(permissive.stderr, /lock_file_mode_must_be_0600/u);
    assert.equal(hash(await readFile(fixture.lockFile)), hash(sentinel));

    await chmod(fixture.lockFile, 0o600);
    const otherLock = join(fixture.temporary, 'other-lock');
    await writeFile(otherLock, 'other-inode\n', { mode: 0o600 });
    const mismatched = runOpenLockValidation(fixture, fixture.lockFile, otherLock);
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /lock_file_opened_inode_mismatch/u);

    await chmod(fixture.temporary, 0o777);
    const unsafeParent = runCli(fixture, 'stage', 'lock-parent', token('4'));
    assert.notEqual(unsafeParent.status, 0);
    assert.match(unsafeParent.stderr, /lock_parent_unsafe_mode/u);
    await chmod(fixture.temporary, 0o700);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('staged-key cleanup failure remains before the release commit and therefore arms rollback', async () => {
  const source = await readFile(apiRelease, 'utf8');
  const cutoverIndex = source.indexOf('cutover_started=1');
  const committedCleanupIndex = source.indexOf(
    'Failed to remove the staged content signing key before committing the API release.',
  );
  const releaseSucceededIndex = source.indexOf('release_succeeded=1', committedCleanupIndex);
  assert.ok(cutoverIndex >= 0);
  assert.ok(committedCleanupIndex > cutoverIndex);
  assert.ok(releaseSucceededIndex > committedCleanupIndex);
  const exitCleanup = source.slice(
    source.indexOf('cleanup_release() {'),
    source.indexOf('trap cleanup_release EXIT'),
  );
  assert.match(exitCleanup, /\[ "\$release_succeeded" != 1 \] && \[ "\$cutover_started" = 1 \]/u);
  assert.match(exitCleanup, /content_key_rollback_release/u);

  const cleanupFunction = source.match(/cleanup_release\(\) \{[\s\S]*?\n\}\ntrap cleanup_release EXIT/u)?.[0]
    .replace(/\ntrap cleanup_release EXIT$/u, '');
  assert.ok(cleanupFunction);
  const cleanupFailure = spawnSync('/bin/sh', [
    '-c',
    `set -u
release_succeeded=0
cutover_started=1
runtime_env_update_armed=1
runtime_source_existed=1
rollback_image=rollback-image
runtime_env=/runtime-env
backup_dir=/backup
expected_owner=0
runtime_compose=/runtime-compose
running_release_id=old-release
running_image=${oldImageId}
release_root=/release-root
release_id=new-release
content_key_upload_token=${token('5')}
content_key_rollback_release() {
  [ "\${12}" = "${oldImageId}" ] || return 1
  printf 'full_cutover_rollback_called\n'
}
content_key_restore_runtime_env() { return 99; }
content_key_cleanup_stage() { return 41; }
${cleanupFunction}
set +e
false
cleanup_release
`,
  ], { encoding: 'utf8' });
  assert.equal(cleanupFailure.status, 1);
  assert.match(cleanupFailure.stdout, /full_cutover_rollback_called/u);
  assert.doesNotMatch(cleanupFailure.stderr, /CRITICAL:/u);
});

test('API deployment reuses one SSH control connection for staging, upload, and cutover', async () => {
  const source = await readFile(apiRelease, 'utf8');
  assert.match(source, /mktemp -d \/tmp\/icao-api-release-ssh\.XXXXXX/u);
  assert.match(source, /-o ControlMaster=yes/u);
  assert.match(source, /-o ControlPath="\$SSH_CONTROL_PATH" -o ControlPersist=600/u);
  assert.match(source, /release_ssh\(\) \{/u);
  assert.match(source, /release_scp\(\) \{/u);
  assert.match(source, /-O exit "\$ECS_USER@\$ECS_HOST"/u);
  assert.match(source, /rm -f "\$SSH_CONTROL_PATH"/u);
  assert.match(source, /rmdir "\$SSH_CONTROL_DIRECTORY"/u);
});

test('staging rejects unsafe modes, links, owner mismatch, and unsafe cleanup', async () => {
  const fixture = await createFixture();
  try {
    const releaseId = 'negative-stage';
    const uploadRoot = join(fixture.releaseRoot, 'api-secret-uploads');
    await mkdir(uploadRoot, { mode: 0o755 });
    assert.notEqual(runCli(fixture, 'stage', releaseId, token('c')).status, 0);
    await rm(uploadRoot, { recursive: true });

    const externalDirectory = join(fixture.temporary, 'external');
    const sentinel = join(externalDirectory, 'sentinel');
    await mkdir(externalDirectory, { mode: 0o700 });
    await writeFile(sentinel, 'unchanged', { mode: 0o600 });
    await symlink(externalDirectory, uploadRoot);
    assert.notEqual(runCli(fixture, 'stage', releaseId, token('d')).status, 0);
    assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
    await rm(uploadRoot);

    const uploadToken = token('e');
    const privateKeyPath = await stageKey(fixture, releaseId, uploadToken);
    await chmod(privateKeyPath, 0o644);
    assert.notEqual(runCli(fixture, 'validate', releaseId, uploadToken).status, 0);
    await chmod(privateKeyPath, 0o600);
    assert.notEqual(runFunction(fixture, 'content_key_validate_stage', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid + 1),
      'pem',
      'absent',
    ]).status, 0);

    const externalKey = join(externalDirectory, 'external.pem');
    const externalPem = privateKeyPem();
    await writeFile(externalKey, externalPem, { mode: 0o600 });
    await rm(privateKeyPath);
    await symlink(externalKey, privateKeyPath);
    assert.notEqual(runCli(fixture, 'validate', releaseId, uploadToken).status, 0);
    assert.notEqual(runCli(fixture, 'cleanup', releaseId, uploadToken).status, 0);
    const conditionalCleanup = runConditionalFunction(fixture, 'content_key_cleanup_stage', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
    ]);
    assert.equal(conditionalCleanup.status, 23);
    assert.equal(hash(await readFile(externalKey)), hash(externalPem));
    await rm(privateKeyPath);
    assert.equal(runCli(fixture, 'cleanup', releaseId, uploadToken).status, 0);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('runtime parent requires its expected owner, a real directory, and exact 0700 mode', async () => {
  const fixture = await createFixture();
  try {
    const runtimeDirectory = join(fixture.temporary, 'runtime-parent');
    const runtimeLink = join(fixture.temporary, 'runtime-parent-link');
    await mkdir(runtimeDirectory, { mode: 0o700 });

    assert.equal(runFunction(fixture, 'content_key_validate_runtime_parent', [
      runtimeDirectory,
      String(uid),
    ]).status, 0);
    assert.notEqual(runFunction(fixture, 'content_key_validate_runtime_parent', [
      runtimeDirectory,
      String(uid + 1),
    ]).status, 0);

    for (const unsafeMode of [0o710, 0o711, 0o750, 0o751, 0o755]) {
      await chmod(runtimeDirectory, unsafeMode);
      assert.notEqual(runFunction(fixture, 'content_key_validate_runtime_parent', [
        runtimeDirectory,
        String(uid),
      ]).status, 0);
    }

    await chmod(runtimeDirectory, 0o700);
    await symlink(runtimeDirectory, runtimeLink);
    assert.notEqual(runFunction(fixture, 'content_key_validate_runtime_parent', [
      runtimeLink,
      String(uid),
    ]).status, 0);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('candidate preflight failure leaves the runtime environment byte-identical and removes secrets', async () => {
  const fixture = await createFixture();
  try {
    const releaseId = 'preflight-failure';
    const uploadToken = token('f');
    await stageKey(fixture, releaseId, uploadToken);
    const runtimeDirectory = join(fixture.temporary, 'runtime');
    const backupDirectory = join(fixture.temporary, 'backup');
    const runtimeEnv = join(runtimeDirectory, '.env');
    const original = Buffer.from('API_RELEASE_ID=old-release\nDATABASE_URL=postgres://example.invalid/db\n');
    const candidateEnv = join(
      fixture.releaseRoot,
      'api-secret-uploads',
      `stage-${releaseId}-${uploadToken}`,
      'runtime-env-candidate',
    );
    await mkdir(runtimeDirectory, { mode: 0o700 });
    await mkdir(backupDirectory, { mode: 0o700 });
    for (const malformed of [
      'API_RELEASE_ID=old\r\nDATABASE_URL=value\r\n',
      'API_RELEASE_ID=old\nDATABASE_URL=one\nDATABASE_URL=two\n',
      'API_RELEASE_ID=old\nUNFRAMED_VALUE\n',
    ]) {
      await writeFile(runtimeEnv, malformed, { mode: 0o600 });
      const rejected = runFunction(fixture, 'content_key_prepare_candidate_env', [
        fixture.releaseRoot,
        releaseId,
        uploadToken,
        String(uid),
        runtimeEnv,
      ]);
      assert.notEqual(rejected.status, 0);
    }
    await writeFile(runtimeEnv, original, { mode: 0o600 });
    const externalCandidate = join(fixture.temporary, 'external-candidate');
    await writeFile(externalCandidate, 'must-not-change', { mode: 0o600 });
    await symlink(externalCandidate, candidateEnv);
    const linkedCandidate = runFunction(fixture, 'content_key_prepare_candidate_env', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
      runtimeEnv,
    ]);
    assert.notEqual(linkedCandidate.status, 0);
    assert.equal(await readFile(externalCandidate, 'utf8'), 'must-not-change');
    await rm(candidateEnv);

    const failed = runPreflightFailure(fixture, [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
      runtimeEnv,
      backupDirectory,
    ]);
    assert.notEqual(failed.status, 0);
    assert.equal(failed.stdout, '');
    assert.equal(hash(await readFile(runtimeEnv)), hash(original));
    await assert.rejects(lstat(join(backupDirectory, 'runtime-env-before')));
    assert.equal(await mode(candidateEnv), 0o600);
    const candidate = await readFile(candidateEnv, 'utf8');
    assert.equal((candidate.match(/^API_RELEASE_ID=/gmu) ?? []).length, 1);
    assert.equal((candidate.match(/^CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY=/gmu) ?? []).length, 1);
    await chmod(candidateEnv, 0o644);
    const permissiveCandidate = runFunction(fixture, 'content_key_validate_stage', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
      'pem',
      'required',
    ]);
    assert.notEqual(permissiveCandidate.status, 0);
    await chmod(candidateEnv, 0o600);

    await chmod(backupDirectory, 0o755);
    const permissiveBackup = runFunction(fixture, 'content_key_install_candidate_env', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
      runtimeEnv,
      backupDirectory,
    ]);
    assert.notEqual(permissiveBackup.status, 0);
    assert.equal(hash(await readFile(runtimeEnv)), hash(original));
    await chmod(backupDirectory, 0o700);

    const externalBackup = join(fixture.temporary, 'external-backup');
    await writeFile(externalBackup, 'must-not-change', { mode: 0o600 });
    await symlink(externalBackup, join(backupDirectory, 'runtime-env-before'));
    const linkedBackup = runFunction(fixture, 'content_key_install_candidate_env', [
      fixture.releaseRoot,
      releaseId,
      uploadToken,
      String(uid),
      runtimeEnv,
      backupDirectory,
    ]);
    assert.notEqual(linkedBackup.status, 0);
    assert.equal(await readFile(externalBackup, 'utf8'), 'must-not-change');
    assert.equal(hash(await readFile(runtimeEnv)), hash(original));
    await rm(join(backupDirectory, 'runtime-env-before'));

    assert.equal(runCli(fixture, 'cleanup', releaseId, uploadToken).status, 0);
    await assert.rejects(lstat(candidateEnv));
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('post-cutover rollback restores image, env, compose, source, and verifies old identity', async () => {
  const fixture = await createFixture();
  try {
    const runtimeDirectory = join(fixture.temporary, 'runtime');
    const backupDirectory = join(fixture.temporary, 'backup');
    const runtimeEnv = join(runtimeDirectory, '.env');
    const backupEnv = join(backupDirectory, 'runtime-env-before');
    const runtimeCompose = join(runtimeDirectory, 'docker-compose.yml');
    const backupCompose = join(backupDirectory, 'docker-compose-before.yml');
    const runtimeSource = join(runtimeDirectory, 'source');
    const backupSource = join(backupDirectory, 'source-directory-before');
    const sourceNext = join(runtimeDirectory, 'source.next');
    const oldEnv = Buffer.from('API_RELEASE_ID=old-release\nORIGINAL=value\n');
    await mkdir(runtimeDirectory, { mode: 0o700 });
    await mkdir(backupDirectory, { mode: 0o700 });
    await mkdir(runtimeSource, { mode: 0o700 });
    await mkdir(backupSource, { mode: 0o700 });
    await mkdir(sourceNext, { mode: 0o700 });
    await writeFile(join(runtimeSource, 'release'), 'new', { mode: 0o600 });
    await writeFile(join(backupSource, 'release'), 'old', { mode: 0o600 });
    await writeFile(runtimeEnv, 'API_RELEASE_ID=new-release\nSECRET=candidate\n', { mode: 0o600 });
    await writeFile(backupEnv, oldEnv, { mode: 0o600 });
    await writeFile(runtimeCompose, 'services: { api: { image: new } }\n', { mode: 0o600 });
    await writeFile(backupCompose, 'services: { api: { image: old } }\n', { mode: 0o600 });

    const rolledBack = runConditionalFunction(fixture, 'content_key_rollback_release', [
      'icao-api:rollback-test',
      runtimeEnv,
      backupEnv,
      String(uid),
      runtimeCompose,
      backupCompose,
      runtimeSource,
      backupSource,
      sourceNext,
      'old-release',
      '1',
      oldImageId,
    ]);
    assert.equal(rolledBack.status, 0, rolledBack.stderr);
    assert.equal(hash(await readFile(runtimeEnv)), hash(oldEnv));
    assert.match(await readFile(runtimeCompose, 'utf8'), /image: old/u);
    assert.equal(await readFile(join(runtimeSource, 'release'), 'utf8'), 'old');
    await assert.rejects(lstat(sourceNext));
    const commands = await readFile(fixture.commandLog, 'utf8');
    assert.match(commands, /docker tag icao-api:rollback-test icao-api:phase2a/u);
    assert.match(commands, /docker compose .* up -d --force-recreate api/u);
    assert.match(commands, /docker inspect -f \{\{\.Image\}\} icao-api/u);
    assert.match(commands, /docker exec icao-api/u);
    assert.match(commands, /curl -fsS http:\/\/127\.0\.0\.1:3101\/health\/ready/u);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('rollback command failure remains a non-zero high-priority failure', async () => {
  const fixture = await createFixture();
  try {
    const runtimeDirectory = join(fixture.temporary, 'runtime');
    const backupDirectory = join(fixture.temporary, 'backup');
    const runtimeEnv = join(runtimeDirectory, '.env');
    const backupEnv = join(backupDirectory, 'runtime-env-before');
    const runtimeCompose = join(runtimeDirectory, 'docker-compose.yml');
    const backupCompose = join(backupDirectory, 'docker-compose-before.yml');
    const runtimeSource = join(runtimeDirectory, 'source');
    const sourceNext = join(runtimeDirectory, 'source.next');
    await mkdir(runtimeDirectory, { mode: 0o700 });
    await mkdir(backupDirectory, { mode: 0o700 });
    await mkdir(runtimeSource, { mode: 0o700 });
    await writeFile(runtimeEnv, 'API_RELEASE_ID=new-release\n', { mode: 0o600 });
    await writeFile(backupEnv, 'API_RELEASE_ID=old-release\n', { mode: 0o600 });
    await writeFile(runtimeCompose, 'new\n', { mode: 0o600 });
    await writeFile(backupCompose, 'old\n', { mode: 0o600 });

    const failed = runConditionalFunction(fixture, 'content_key_rollback_release', [
      'icao-api:rollback-test',
      runtimeEnv,
      backupEnv,
      String(uid),
      runtimeCompose,
      backupCompose,
      runtimeSource,
      join(backupDirectory, 'source-directory-before'),
      sourceNext,
      'old-release',
      '1',
      oldImageId,
    ], { ICAO_TEST_DOCKER_FAIL_COMPOSE: '1' });
    assert.equal(failed.status, 23);
    assert.match(failed.stderr, /rollback_container_restart_failed/u);
    assert.equal(hash(await readFile(runtimeEnv)), hash('API_RELEASE_ID=old-release\n'));
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test('rollback rejects a recreated container whose image digest differs from the saved digest', async () => {
  const fixture = await createFixture();
  try {
    const runtimeDirectory = join(fixture.temporary, 'runtime');
    const backupDirectory = join(fixture.temporary, 'backup');
    const runtimeEnv = join(runtimeDirectory, '.env');
    const backupEnv = join(backupDirectory, 'runtime-env-before');
    const runtimeCompose = join(runtimeDirectory, 'docker-compose.yml');
    const backupCompose = join(backupDirectory, 'docker-compose-before.yml');
    const runtimeSource = join(runtimeDirectory, 'source');
    const sourceNext = join(runtimeDirectory, 'source.next');
    await mkdir(runtimeDirectory, { mode: 0o700 });
    await mkdir(backupDirectory, { mode: 0o700 });
    await mkdir(runtimeSource, { mode: 0o700 });
    await writeFile(runtimeEnv, 'API_RELEASE_ID=new-release\n', { mode: 0o600 });
    await writeFile(backupEnv, 'API_RELEASE_ID=old-release\n', { mode: 0o600 });
    await writeFile(runtimeCompose, 'new\n', { mode: 0o600 });
    await writeFile(backupCompose, 'old\n', { mode: 0o600 });

    const failed = runConditionalFunction(fixture, 'content_key_rollback_release', [
      'icao-api:rollback-test',
      runtimeEnv,
      backupEnv,
      String(uid),
      runtimeCompose,
      backupCompose,
      runtimeSource,
      join(backupDirectory, 'source-directory-before'),
      sourceNext,
      'old-release',
      '1',
      oldImageId,
    ], { ICAO_TEST_ROLLBACK_IMAGE_ID: `sha256:${'b'.repeat(64)}` });
    assert.equal(failed.status, 23);
    assert.match(failed.stderr, /rollback_image_identity_mismatch/u);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});
