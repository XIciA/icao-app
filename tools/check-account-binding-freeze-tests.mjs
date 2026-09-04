import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { exactPhoneBindingFlowFailures } from './check-account-binding-freeze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sources() {
  return Promise.all([
    readFile(path.join(ROOT, 'services/api/src/account/account.service.ts'), 'utf8'),
    readFile(path.join(ROOT, 'services/api/src/auth/phone-auth.service.ts'), 'utf8'),
  ]);
}

test('accepts the exact purpose-bound consume-before-bind flow', async () => {
  const [service, phoneAuth] = await sources();
  assert.deepEqual(exactPhoneBindingFlowFailures(service, phoneAuth), []);
});

test('rejects moving the binding transaction before exact challenge verification', async () => {
  const [service, phoneAuth] = await sources();
  const verifyCall = 'const verified = await this.phoneAuth.verifyBindingChallenge(';
  const bindingCall = 'const binding = await this.attachNewPhoneIdentity(';
  const unsafe = service
    .replace(verifyCall, '__VERIFY_CALL__')
    .replace(bindingCall, verifyCall)
    .replace('__VERIFY_CALL__', bindingCall);
  assert.ok(exactPhoneBindingFlowFailures(unsafe, phoneAuth).includes(
    'the exact binding challenge must be consumed before the binding transaction',
  ));
});

test('rejects returning provider tokens without atomically consuming the exact challenge', async () => {
  const [service, phoneAuth] = await sources();
  const unsafe = phoneAuth.replace(
    'const consumed = await this.consumeVerification(',
    'const consumed = await this.lookupVerification(',
  );
  assert.ok(exactPhoneBindingFlowFailures(service, unsafe).includes(
    'verified binding OTPs must be atomically consumed before session tokens are returned',
  ));
});
