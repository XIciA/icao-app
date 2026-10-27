import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { mintVocabularyStorageToken, writeVocabularyStorageToken } from './mint-vocabulary-storage-token.mjs';

const secret = 'fixture-only-signing-input-not-a-production-key';
test('mint fixes the role and bounds expiry, with valid HS256 signature', () => {
  const now = 1793059200000;
  const first = mintVocabularyStorageToken(secret, { now, ttlHours: 24 });
  const second = mintVocabularyStorageToken(secret, { now, ttlHours: 24 });
  const parts = first.token.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.deepEqual(JSON.parse(Buffer.from(parts[0], 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.equal(claims.role, 'ops_vocabulary_storage');
  assert.equal(claims.aud, 'authenticated');
  assert.equal(claims.exp - claims.iat, 86400);
  assert.equal(claims.iat, now / 1000);
  assert.notEqual(first.token, second.token);
  assert.equal(parts[2], createHmac('sha256', secret).update(parts.slice(0, 2).join('.')).digest('base64url'));
  for (const ttlHours of [0, 2161, 1.5, NaN]) assert.throws(() => mintVocabularyStorageToken(secret, { ttlHours }));
  assert.throws(() => mintVocabularyStorageToken('short'));
});
test('output is exclusive, private, outside checkout, and refuses symlink/loose parent', () => {
  const root = mkdtempSync(join(tmpdir(), 'icao-token-fixture-'));
  try {
    const credential = mintVocabularyStorageToken(secret);
    const output = join(root, 'token');
    writeVocabularyStorageToken(output, credential);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(readFileSync(output, 'utf8'), `${credential.token}\n`);
    assert.throws(() => writeVocabularyStorageToken(output, credential));
    const link = join(root, 'link'); symlinkSync(output, link);
    assert.throws(() => writeVocabularyStorageToken(link, credential));
    assert.throws(() => writeVocabularyStorageToken('relative', credential));
    assert.throws(() => writeVocabularyStorageToken(new URL('./should-never-exist.token', import.meta.url).pathname, credential));
    const loose = join(root, 'loose'); mkdirSync(loose); chmodSync(loose, 0o755);
    assert.throws(() => writeVocabularyStorageToken(join(loose, 'token'), credential));
    const privateLink = join(root, 'parent-link'); symlinkSync(root, privateLink);
    assert.throws(() => writeVocabularyStorageToken(join(privateLink, 'other'), credential));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CLI emits only role/expiry, never input secret, JWT or private path', () => {
  const root = mkdtempSync(join(tmpdir(), 'icao-token-cli-fixture-'));
  try {
    const output = join(root, 'token');
    const result = spawnSync(process.execPath, [new URL('./mint-vocabulary-storage-token.mjs', import.meta.url).pathname,
      '--output', output, '--ttl-hours', '24'], { encoding: 'utf8',
      env: { ...process.env, VOCABULARY_STORAGE_JWT_SECRET: secret } });
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(metadata).sort(), ['expiresAt','result','role']);
    assert.equal(metadata.role, 'ops_vocabulary_storage');
    assert.ok(!result.stdout.includes(secret));
    assert.ok(!result.stdout.includes(readFileSync(output, 'utf8').trim()));
    assert.ok(!result.stdout.includes(output));
    const failed = spawnSync(process.execPath, [new URL('./mint-vocabulary-storage-token.mjs', import.meta.url).pathname,
      '--output', output, '--ttl-hours', '24'], { encoding: 'utf8',
      env: { ...process.env, VOCABULARY_STORAGE_JWT_SECRET: secret } });
    assert.equal(failed.status, 1);
    assert.ok(!failed.stderr.includes(secret));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
