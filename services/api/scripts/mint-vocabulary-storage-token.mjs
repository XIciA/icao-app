/** Offline server-side helper. Never run automatically during build/deploy.
 * The operator supplies the signing secret through a private inherited env.
 * Only a scoped JWT is written, exclusively, outside the checkout; no secret
 * or token is logged. The root signing secret must never enter the Ops env. */
import { createHmac, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const vocabularyStorageRole = 'ops_vocabulary_storage';

export function mintVocabularyStorageToken(secret, { ttlHours = 24 * 30, now = Date.now() } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 ||
      !Number.isSafeInteger(ttlHours) || ttlHours < 1 || ttlHours > 24 * 90 ||
      !Number.isSafeInteger(now) || now < 0) throw new Error('invalid_vocabulary_token_input');
  const issuedAt = Math.floor(now / 1000);
  const claims = { role: vocabularyStorageRole, sub: randomUUID(), jti: randomUUID(),
    aud: 'authenticated', iat: issuedAt, exp: issuedAt + ttlHours * 3600 };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return { token: `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`,
    expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function writeVocabularyStorageToken(output, credential) {
  if (!isAbsolute(output)) throw new Error('vocabulary_token_output_must_be_absolute');
  const target = resolve(output);
  const checkout = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
  const realParent = realpathSync(dirname(target));
  const withinCheckout = relative(checkout, join(realParent, 'token'));
  if (!withinCheckout || (!withinCheckout.startsWith(`..${sep}`) && !isAbsolute(withinCheckout))) {
    throw new Error('vocabulary_token_output_inside_checkout');
  }
  for (let ancestor = realParent; ; ancestor = dirname(ancestor)) {
    if (existsSync(join(ancestor, '.git'))) throw new Error('vocabulary_token_output_inside_checkout');
    if (ancestor === dirname(ancestor)) break;
  }
  const parent = lstatSync(dirname(target));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
      (typeof process.geteuid === 'function' && parent.uid !== process.geteuid())) {
    throw new Error('vocabulary_token_private_output_directory_required');
  }
  const fd = openSync(target, 'wx', 0o600);
  try { writeFileSync(fd, `${credential.token}\n`); fsyncSync(fd); }
  catch (error) { unlinkSync(target); throw error; }
  finally { closeSync(fd); }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--output' || args[2] !== '--ttl-hours' || !/^\d+$/.test(args[3])) {
    throw new Error('usage_output_absolute_path_and_ttl_hours');
  }
  const credential = mintVocabularyStorageToken(process.env.VOCABULARY_STORAGE_JWT_SECRET,
    { ttlHours: Number(args[3]) });
  writeVocabularyStorageToken(args[1], credential);
  console.log(JSON.stringify({ result: 'vocabulary_storage_token_written',
    role: vocabularyStorageRole, expiresAt: credential.expiresAt }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch { console.error('vocabulary_storage_token_not_written: check private input/output and TTL (1..2160 hours)'); process.exitCode = 1; }
}
