import { describe, expect, it } from 'vitest';

import { appleRecentAuthSchema } from '../src/auth/apple-auth.schemas';
import {
  passwordRecentAuthSchema,
  phoneRecentAuthSchema,
  startWechatRecentAuthSchema,
  wechatRecentAuthSchema,
} from '../src/auth/recent-auth.schemas';

const appleCredential = {
  authorizationCode: 'authorization-code',
  rawNonce: '0123456789abcdef',
};

describe('recent authentication request schemas', () => {
  it('accepts the dedicated session-revocation purpose for every supported method', () => {
    expect(appleRecentAuthSchema.safeParse({
      ...appleCredential,
      purpose: 'session_revoke_all',
    }).success).toBe(true);
    expect(passwordRecentAuthSchema.safeParse({
      password: 'password10',
      purpose: 'session_revoke_all',
    }).success).toBe(true);
    expect(phoneRecentAuthSchema.safeParse({
      challengeId: '10000000-0000-4000-8000-000000000001',
      purpose: 'session_revoke_all',
      token: '123456',
    }).success).toBe(true);
    expect(startWechatRecentAuthSchema.safeParse({ purpose: 'session_revoke_all' }).success).toBe(true);
    expect(wechatRecentAuthSchema.safeParse({
      challengeId: '10000000-0000-4000-8000-000000000001',
      code: 'wechat-code',
      purpose: 'session_revoke_all',
      state: '0123456789abcdefghijklmnop',
    }).success).toBe(true);
  });

  it('rejects login and password-recovery purposes for destructive recent authentication', () => {
    expect(appleRecentAuthSchema.safeParse({ ...appleCredential, purpose: 'login' }).success).toBe(false);
    expect(passwordRecentAuthSchema.safeParse({ password: 'password10', purpose: 'password_recovery' }).success).toBe(false);
  });
});
