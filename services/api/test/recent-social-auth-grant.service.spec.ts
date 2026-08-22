import { describe, expect, it } from 'vitest';

import { RecentSocialAuthGrantService } from '../src/auth/recent-social-auth-grant.service';
import type { ApiConfig } from '../src/config';

const service = new RecentSocialAuthGrantService({
  accountIdentityHashSecret: 'test-account-identity-hash-secret-at-least-32-bytes',
} as ApiConfig);

describe('RecentSocialAuthGrantService', () => {
  it('binds a short-lived WeChat grant to one auth user and session and consumes it once', () => {
    const now = 1_800_000_000_000;
    service.issue('wechat', 'auth-user-1', 'session-1', now);
    expect(service.has('wechat', 'auth-user-1', 'session-1', now + 1)).toBe(true);
    expect(service.has('wechat', 'auth-user-1', 'session-2', now + 1)).toBe(false);
    expect(service.consume('wechat', 'auth-user-1', 'session-1', now + 1)).toBe(true);
    expect(service.consume('wechat', 'auth-user-1', 'session-1', now + 2)).toBe(false);
  });

  it('fails closed after the ten-minute grant window', () => {
    const now = 1_800_000_000_000;
    service.issue('wechat', 'auth-user-2', 'session-2', now);
    expect(service.has('wechat', 'auth-user-2', 'session-2', now + (10 * 60 * 1_000))).toBe(false);
  });
});
