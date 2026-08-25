import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
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
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  generatePrivateKeyFile,
  verifyPrivateKeyFile,
} from './content-credential-signing-key.mjs';

const toolPath = fileURLToPath(new URL('./content-credential-signing-key.mjs', import.meta.url));
const projectRoot = resolve(dirname(toolPath), '..');

function modeOf(stats) {
  return stats.mode & 0o7777;
}

async function makeTestRoot(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'icao-content-signing-key.'));
  await chmod(root, 0o700);
  t.after(async () => {
    await chmod(root, 0o700).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('generate creates only a new protected external private key and prints only its public key', async (t) => {
  const root = await makeTestRoot(t);
  const keyDirectory = join(root, 'keys');
  const privateKeyPath = join(keyDirectory, 'content-credential.pem');
  const result = spawnSync(process.execPath, [
    toolPath,
    'generate',
    '--private-key-path',
    privateKeyPath,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^[A-Za-z0-9+/]{43}=\n$/u);
  assert.equal(result.stderr, '');
  assert.equal(modeOf(await lstat(keyDirectory)), 0o700);
  assert.equal(modeOf(await lstat(privateKeyPath)), 0o600);
  const privateKey = await readFile(privateKeyPath, 'utf8');
  assert.match(privateKey, /^-----BEGIN PRIVATE KEY-----/u);
  assert.doesNotMatch(result.stdout, /PRIVATE KEY/u);
  await verifyPrivateKeyFile(privateKeyPath, {
    expectedPublicKeyBase64: result.stdout.trim(),
  });
});

test('generate refuses repository paths, relative paths, symlinks, permissive parents, and overwrites', async (t) => {
  const root = await makeTestRoot(t);
  await assert.rejects(
    generatePrivateKeyFile(join(projectRoot, '.generated', 'forbidden-content-key.pem')),
    /private_key_path_must_be_outside_repository/u,
  );
  await assert.rejects(
    generatePrivateKeyFile('relative-content-key.pem'),
    /private_key_path_must_be_absolute/u,
  );

  const protectedDirectory = join(root, 'protected');
  await mkdir(protectedDirectory, { mode: 0o700 });
  const existingKey = join(protectedDirectory, 'existing.pem');
  await writeFile(existingKey, 'sentinel\n', { mode: 0o600 });
  await assert.rejects(
    generatePrivateKeyFile(existingKey),
    /private_key_path_already_exists/u,
  );
  assert.equal(await readFile(existingKey, 'utf8'), 'sentinel\n');

  const permissiveDirectory = join(root, 'permissive');
  await mkdir(permissiveDirectory, { mode: 0o755 });
  await assert.rejects(
    generatePrivateKeyFile(join(permissiveDirectory, 'key.pem')),
    /private_key_parent_mode_must_be_0700/u,
  );

  const actualDirectory = join(root, 'actual');
  const linkedDirectory = join(root, 'linked');
  await mkdir(actualDirectory, { mode: 0o700 });
  await symlink(actualDirectory, linkedDirectory);
  await assert.rejects(
    generatePrivateKeyFile(join(linkedDirectory, 'key.pem')),
    /symlink_path_rejected/u,
  );
  assert.deepEqual(await Promise.all([
    lstat(actualDirectory).then((stats) => stats.isDirectory()),
    lstat(linkedDirectory).then((stats) => stats.isSymbolicLink()),
  ]), [true, true]);
});

test('verify fails closed for mismatched, malformed, permissive, and symlinked private keys', async (t) => {
  const root = await makeTestRoot(t);
  const keyDirectory = join(root, 'keys');
  const privateKeyPath = join(keyDirectory, 'content-credential.pem');
  const publicKey = await generatePrivateKeyFile(privateKeyPath);
  const otherDirectory = join(root, 'other');
  const otherKeyPath = join(otherDirectory, 'content-credential.pem');
  const otherPublicKey = await generatePrivateKeyFile(otherKeyPath);

  await verifyPrivateKeyFile(privateKeyPath, { expectedPublicKeyBase64: publicKey });
  await assert.rejects(
    verifyPrivateKeyFile(privateKeyPath, { expectedPublicKeyBase64: otherPublicKey }),
    /private_key_does_not_match_client_public_key/u,
  );

  await chmod(privateKeyPath, 0o644);
  await assert.rejects(
    verifyPrivateKeyFile(privateKeyPath, { expectedPublicKeyBase64: publicKey }),
    /private_key_mode_must_be_0600/u,
  );
  await chmod(privateKeyPath, 0o600);

  const malformedPath = join(keyDirectory, 'malformed.pem');
  await writeFile(malformedPath, 'not-a-private-key\n', { mode: 0o600 });
  await assert.rejects(
    verifyPrivateKeyFile(malformedPath, { expectedPublicKeyBase64: publicKey }),
    /private_key_invalid/u,
  );

  const symlinkPath = join(keyDirectory, 'linked.pem');
  await symlink(privateKeyPath, symlinkPath);
  await assert.rejects(
    verifyPrivateKeyFile(symlinkPath, { expectedPublicKeyBase64: publicKey }),
    /symlink_path_rejected/u,
  );

  const cliMismatch = spawnSync(process.execPath, [
    toolPath,
    'verify',
    '--private-key-path',
    privateKeyPath,
  ], { encoding: 'utf8' });
  assert.notEqual(cliMismatch.status, 0);
  assert.equal(cliMismatch.stdout, '');
  assert.match(cliMismatch.stderr, /private_key_does_not_match_client_public_key/u);
  assert.doesNotMatch(cliMismatch.stderr, /PRIVATE KEY/u);
});

test('verify rejects non-Ed25519 keys without exposing their material', async (t) => {
  const root = await makeTestRoot(t);
  const keyDirectory = join(root, 'keys');
  await mkdir(keyDirectory, { mode: 0o700 });
  const privateKeyPath = join(keyDirectory, 'rsa.pem');
  const rsaPrivateKey = generateKeyPairSync('rsa', { modulusLength: 1_024 }).privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  }).toString();
  await writeFile(privateKeyPath, rsaPrivateKey, { mode: 0o600 });
  await assert.rejects(
    verifyPrivateKeyFile(privateKeyPath, { expectedPublicKeyBase64: Buffer.alloc(32).toString('base64') }),
    /private_key_must_be_ed25519/u,
  );
});
