import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const deployment = await readFile('scripts/deploy-ops-release.sh', 'utf8');
const stagingMatch = deployment.match(/<<'REMOTE_STAGE'\n([\s\S]*?)\nREMOTE_STAGE/u);
if (!stagingMatch) throw new Error('ops_upload_staging_real_caller_not_found');
const stagingCaller = stagingMatch[1];

const testParent = await mkdtemp(join(tmpdir(), 'icao-ops-staging-caller.'));
const fakeBin = join(testParent, 'bin');
await mkdir(fakeBin, { mode: 0o700 });
await writeFile(join(fakeBin, 'flock'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
const testEnv = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` };
const expectedOwner = String(process.getuid());

function runStaging(releaseRoot, suffix, owner = expectedOwner) {
  return spawnSync('/bin/sh', [
    '-s', '--', `test-${suffix}`, `0123456789abcdef${suffix}`, releaseRoot,
    owner, join(testParent, `release-${suffix}.lock`),
  ], { input: stagingCaller, encoding: 'utf8', env: testEnv });
}

function assert(condition, marker) {
  if (!condition) throw new Error(marker);
}

function modeOf(stats) {
  return stats.mode & 0o777;
}

async function exists(path) {
  return access(path).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

try {
  const firstReleaseRoot = join(testParent, 'first-releases');
  await mkdir(firstReleaseRoot, { mode: 0o700 });
  const first = runStaging(firstReleaseRoot, 'aa');
  assert(first.status === 0, `ops_upload_staging_first_create_failed:${first.stderr || first.stdout}`);
  const firstStage = join(firstReleaseRoot, 'ops-uploads', 'stage-test-aa-0123456789abcdefaa');
  assert(modeOf(await stat(join(firstReleaseRoot, 'ops-uploads'))) === 0o700, 'ops_upload_root_mode_not_private');
  assert(modeOf(await stat(firstStage)) === 0o700, 'ops_upload_stage_mode_not_private');
  assert(modeOf(await stat(join(firstStage, 'source.tar.gz'))) === 0o600, 'ops_upload_file_mode_not_private');
  assert(modeOf(await stat(join(firstStage, 'source.tar.gz.sha256'))) === 0o600, 'ops_upload_checksum_mode_not_private');

  const linkedReleaseRoot = join(testParent, 'linked-releases');
  const linkedTarget = join(testParent, 'linked-target');
  const sentinel = join(linkedTarget, 'sentinel.txt');
  await mkdir(linkedReleaseRoot, { mode: 0o700 });
  await mkdir(linkedTarget, { mode: 0o750 });
  await writeFile(sentinel, 'preserve-me\n', { mode: 0o640 });
  await symlink(linkedTarget, join(linkedReleaseRoot, 'ops-uploads'));
  const targetModeBefore = modeOf(await stat(linkedTarget));
  const sentinelModeBefore = modeOf(await stat(sentinel));
  const sentinelBefore = await readFile(sentinel, 'utf8');

  const linked = runStaging(linkedReleaseRoot, 'bb');
  assert(linked.status !== 0, 'ops_upload_staging_accepted_symlink_root');
  assert(modeOf(await stat(linkedTarget)) === targetModeBefore, 'ops_upload_staging_changed_symlink_target_mode');
  assert(modeOf(await stat(sentinel)) === sentinelModeBefore, 'ops_upload_staging_changed_symlink_target_file_mode');
  assert(await readFile(sentinel, 'utf8') === sentinelBefore, 'ops_upload_staging_changed_symlink_target_content');
  assert((await readdir(linkedTarget)).join(',') === 'sentinel.txt', 'ops_upload_staging_wrote_through_symlink_root');
  assert(!await exists(join(testParent, 'release-bb.lock')), 'ops_upload_staging_wrote_before_symlink_root_rejection');

  const fileReleaseRoot = join(testParent, 'file-releases');
  await mkdir(fileReleaseRoot, { mode: 0o700 });
  const uploadRootFile = join(fileReleaseRoot, 'ops-uploads');
  await writeFile(uploadRootFile, 'not-a-directory\n', { mode: 0o600 });
  const fileBefore = await readFile(uploadRootFile, 'utf8');
  const fileRoot = runStaging(fileReleaseRoot, 'cc');
  assert(fileRoot.status !== 0, 'ops_upload_staging_accepted_non_directory_root');
  assert(await readFile(uploadRootFile, 'utf8') === fileBefore, 'ops_upload_staging_changed_non_directory_root');
  assert(!await exists(join(testParent, 'release-cc.lock')), 'ops_upload_staging_wrote_before_non_directory_root_rejection');

  const permissiveReleaseRoot = join(testParent, 'permissive-releases');
  const permissiveUploadRoot = join(permissiveReleaseRoot, 'ops-uploads');
  await mkdir(permissiveReleaseRoot, { mode: 0o700 });
  await mkdir(permissiveUploadRoot, { mode: 0o755 });
  const permissiveModeBefore = modeOf(await stat(permissiveUploadRoot));
  const permissive = runStaging(permissiveReleaseRoot, 'dd');
  assert(permissive.status !== 0, 'ops_upload_staging_accepted_permissive_root');
  assert(modeOf(await stat(permissiveUploadRoot)) === permissiveModeBefore, 'ops_upload_staging_chmodded_permissive_root');
  assert((await readdir(permissiveUploadRoot)).length === 0, 'ops_upload_staging_wrote_to_permissive_root');
  assert(!await exists(join(testParent, 'release-dd.lock')), 'ops_upload_staging_wrote_before_permissive_root_rejection');

  const ownerReleaseRoot = join(testParent, 'owner-releases');
  await mkdir(ownerReleaseRoot, { mode: 0o700 });
  const unexpectedOwner = String(Number(expectedOwner) + 1);
  const owner = runStaging(ownerReleaseRoot, 'ff', unexpectedOwner);
  assert(owner.status !== 0, 'ops_upload_staging_accepted_unexpected_owner');
  assert(!await exists(join(testParent, 'release-ff.lock')), 'ops_upload_staging_wrote_before_owner_rejection');
  assert(!await exists(join(ownerReleaseRoot, 'ops-uploads')), 'ops_upload_staging_created_root_after_owner_rejection');

  const parentSymlink = join(testParent, 'parent-symlink');
  await symlink(firstReleaseRoot, parentSymlink);
  const parentLinkResult = runStaging(parentSymlink, 'ee');
  assert(parentLinkResult.status !== 0, 'ops_upload_staging_accepted_symlink_release_parent');
  assert((await lstat(parentSymlink)).isSymbolicLink(), 'ops_upload_staging_changed_symlink_release_parent');

  console.log('Ops real upload-staging caller boundary tests passed.');
} finally {
  await chmod(testParent, 0o700).catch(() => {});
  await rm(testParent, { recursive: true, force: true });
}
