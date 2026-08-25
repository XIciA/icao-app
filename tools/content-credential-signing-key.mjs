import {
  constants,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  unlink,
} from 'node:fs/promises';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const PROJECT_ROOT = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function fail(code) {
  throw new Error(`content_credential_signing_key:${code}`);
}

function modeOf(stats) {
  return stats.mode & 0o7777;
}

function isOwnedByCurrentUser(stats) {
  return typeof process.getuid !== 'function' || stats.uid === process.getuid();
}

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function normalizePrivateKeyPath(input) {
  if (typeof input !== 'string' || input.length === 0 || !isAbsolute(input)) {
    fail('private_key_path_must_be_absolute');
  }
  const normalized = resolve(input);
  if (normalized !== input) fail('private_key_path_must_be_canonical');
  if (normalized === PROJECT_ROOT || !relative(PROJECT_ROOT, normalized).startsWith(`..${sep}`)) {
    fail('private_key_path_must_be_outside_repository');
  }
  return normalized;
}

async function assertNoSymlinkComponents(path) {
  const root = parse(path).root;
  let current = root;
  const components = path.slice(root.length).split(sep).filter(Boolean);
  for (const component of components) {
    current = join(current, component);
    const stats = await optionalLstat(current);
    if (!stats) return;
    if (stats.isSymbolicLink()) fail('symlink_path_rejected');
  }
}

async function nearestExistingDirectory(path) {
  let current = path;
  while (true) {
    const stats = await optionalLstat(current);
    if (stats) {
      if (stats.isSymbolicLink()) fail('symlink_path_rejected');
      if (!stats.isDirectory()) fail('private_key_parent_not_directory');
      return current;
    }
    const parent = dirname(current);
    if (parent === current) fail('private_key_parent_missing');
    current = parent;
  }
}

async function assertOutsideGitRepository(path) {
  let current = await nearestExistingDirectory(dirname(path));
  while (true) {
    if (await optionalLstat(join(current, '.git'))) {
      fail('private_key_path_must_be_outside_repository');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function ensureProtectedDirectory(path, { create }) {
  await assertNoSymlinkComponents(path);
  let stats = await optionalLstat(path);
  if (!stats && create) {
    const parent = dirname(path);
    const parentStats = await optionalLstat(parent);
    if (!parentStats?.isDirectory() || parentStats.isSymbolicLink()) {
      fail('private_key_parent_must_exist');
    }
    await mkdir(path, { mode: PRIVATE_DIRECTORY_MODE });
    stats = await lstat(path);
  }
  if (!stats?.isDirectory() || stats.isSymbolicLink()) fail('private_key_parent_not_directory');
  if (!isOwnedByCurrentUser(stats)) fail('private_key_parent_wrong_owner');
  if (modeOf(stats) !== PRIVATE_DIRECTORY_MODE) fail('private_key_parent_mode_must_be_0700');
}

function publicKeyBase64FromPrivateKey(privateKey) {
  try {
    const publicJwk = createPublicKey(createPrivateKey(privateKey)).export({ format: 'jwk' });
    if (publicJwk.kty !== 'OKP' || publicJwk.crv !== 'Ed25519' || !publicJwk.x) {
      fail('private_key_must_be_ed25519');
    }
    const publicKey = Buffer.from(publicJwk.x, 'base64url');
    if (publicKey.byteLength !== 32) fail('private_key_must_be_ed25519');
    return publicKey.toString('base64');
  } catch (error) {
    if (error?.message?.startsWith('content_credential_signing_key:')) throw error;
    fail('private_key_invalid');
  }
}

async function readProtectedPrivateKey(path) {
  const normalized = normalizePrivateKeyPath(path);
  await assertOutsideGitRepository(normalized);
  await assertNoSymlinkComponents(normalized);
  await ensureProtectedDirectory(dirname(normalized), { create: false });

  let handle;
  try {
    handle = await open(normalized, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = await handle.stat();
    if (!stats.isFile()) fail('private_key_not_regular_file');
    if (!isOwnedByCurrentUser(stats)) fail('private_key_wrong_owner');
    if (modeOf(stats) !== PRIVATE_FILE_MODE) fail('private_key_mode_must_be_0600');
    return await handle.readFile('utf8');
  } catch (error) {
    if (error?.message?.startsWith('content_credential_signing_key:')) throw error;
    if (error?.code === 'ELOOP') fail('symlink_path_rejected');
    if (error?.code === 'ENOENT') fail('private_key_missing');
    fail('private_key_unreadable');
  } finally {
    await handle?.close();
  }
}

async function readClientPublicKeyBase64() {
  const contracts = await readFile(join(PROJECT_ROOT, 'packages/contracts/src/index.ts'), 'utf8');
  const value = contracts.match(
    /export const CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64 = '([A-Za-z0-9+/=]+)' as const;/u,
  )?.[1];
  if (!value) fail('client_public_key_missing');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength !== 32 || decoded.toString('base64') !== value) {
    fail('client_public_key_invalid');
  }
  return value;
}

export async function generatePrivateKeyFile(privateKeyPath) {
  const normalized = normalizePrivateKeyPath(privateKeyPath);
  await assertOutsideGitRepository(normalized);
  await assertNoSymlinkComponents(normalized);
  await ensureProtectedDirectory(dirname(normalized), { create: true });
  if (await optionalLstat(normalized)) fail('private_key_path_already_exists');

  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  let handle;
  let created = false;
  try {
    handle = await open(
      normalized,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
    created = true;
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(privateKeyPem, 'utf8');
    await handle.sync();
    const stats = await handle.stat();
    if (!stats.isFile() || !isOwnedByCurrentUser(stats) || modeOf(stats) !== PRIVATE_FILE_MODE) {
      fail('private_key_file_protection_failed');
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    handle = undefined;
    if (created) await unlink(normalized).catch(() => {});
    if (error?.message?.startsWith('content_credential_signing_key:')) throw error;
    if (error?.code === 'EEXIST') fail('private_key_path_already_exists');
    if (error?.code === 'ELOOP') fail('symlink_path_rejected');
    fail('private_key_write_failed');
  } finally {
    await handle?.close();
  }

  return publicKeyBase64FromPrivateKey(privateKeyPem);
}

export async function verifyPrivateKeyFile(
  privateKeyPath,
  { expectedPublicKeyBase64 } = {},
) {
  const privateKey = await readProtectedPrivateKey(privateKeyPath);
  const derivedPublicKeyBase64 = publicKeyBase64FromPrivateKey(privateKey);
  const expected = expectedPublicKeyBase64 ?? await readClientPublicKeyBase64();
  const derived = Buffer.from(derivedPublicKeyBase64, 'base64');
  const expectedBytes = Buffer.from(expected, 'base64');
  if (
    expectedBytes.byteLength !== 32
    || expectedBytes.toString('base64') !== expected
    || !timingSafeEqual(derived, expectedBytes)
  ) fail('private_key_does_not_match_client_public_key');
}

function parseCliArguments(argv) {
  const [command, flag, privateKeyPath, ...rest] = argv;
  if (
    !['generate', 'verify'].includes(command)
    || flag !== '--private-key-path'
    || !privateKeyPath
    || rest.length > 0
  ) fail('usage_generate_or_verify_with_private_key_path');
  return { command, privateKeyPath };
}

async function main() {
  const { command, privateKeyPath } = parseCliArguments(process.argv.slice(2));
  if (command === 'generate') {
    const publicKey = await generatePrivateKeyFile(privateKeyPath);
    process.stdout.write(`${publicKey}\n`);
    return;
  }
  await verifyPrivateKeyFile(privateKeyPath);
  process.stdout.write('content_credential_signing_key_verified=1\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? 'content_credential_signing_key:unknown_error'}\n`);
    process.exitCode = 1;
  });
}
