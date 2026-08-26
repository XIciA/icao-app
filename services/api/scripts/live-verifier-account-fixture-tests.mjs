import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTemporaryPhoneAuthUser,
  lifetimeBenefitAccountContext,
  temporaryChinaMobile,
} from './live-verifier-account-fixture.mjs';

test('temporary verifier phones satisfy the supported China mobile shape', () => {
  assert.equal(temporaryChinaMobile(Uint8Array.from([0, 0, 0, 0])), '+8619900000000');
  assert.match(temporaryChinaMobile(Uint8Array.from([255, 255, 255, 255])), /^\+86199\d{8}$/u);
});

test('temporary benefit cleanup context matches the server domain contract', () => {
  assert.equal(
    lifetimeBenefitAccountContext('00000000-0000-0000-0000-000000000001', 'test-secret'),
    '207ad0e5e65c9a6b0ff44d11ab6c3d876a15ce7f432f4681198404cf3837c6f5',
  );
});

test('temporary verifier auth retries a colliding phone without sending SMS', async () => {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        createUser: async (input) => {
          calls.push(input);
          if (calls.length === 1) {
            return { data: { user: null }, error: { code: 'phone_exists', message: 'Phone already registered' } };
          }
          return { data: { user: { id: 'temporary-auth-user' } }, error: null };
        },
      },
    },
  };
  const phones = ['+8619900000001', '+8619900000002'];
  const created = await createTemporaryPhoneAuthUser({
    admin,
    password: 'temporary-password',
    phoneFactory: () => phones.shift(),
  });

  assert.deepEqual(created, { authUserId: 'temporary-auth-user', phone: '+8619900000002' });
  assert.deepEqual(calls, [
    { phone: '+8619900000001', password: 'temporary-password', phone_confirm: true },
    { phone: '+8619900000002', password: 'temporary-password', phone_confirm: true },
  ]);
});
