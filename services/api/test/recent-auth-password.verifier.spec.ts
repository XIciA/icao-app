import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseRecentAuthPasswordVerifier } from '../src/auth/recent-auth-password.verifier';
import type { AccountPhoneIdentityService } from '../src/account/account-phone-identity.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { ApiConfig } from '../src/config';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabase.createClient,
}));

const source: VerifiedAuthSession = {
  accessToken: 'source-access-token',
  authenticationMethods: [{ method: 'otp', timestamp: 1_800_000_000 }],
  authUserId: '11111111-1111-4111-8111-111111111111',
  identities: [],
  issuedAt: 1_800_000_000,
  passwordSet: true,
  sessionId: 'source-session',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    phone: '+8613800138000',
    providers: ['phone'],
  },
};

function fixture(returnedPhone: string, options: {
  phoneIdentity?: { authUserId: string; passwordSet: boolean; phone: string };
  returnedAuthUserId?: string;
} = {}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: {
      session: { access_token: 'temporary-access-token' },
      user: { id: options.returnedAuthUserId ?? source.authUserId, phone: returnedPhone },
    },
    error: null,
  });
  supabase.createClient
    .mockReturnValueOnce({ auth: { signInWithPassword } })
    .mockReturnValueOnce({ auth: { admin: { signOut } } });
  const accountPhones = {
    resolve: vi.fn().mockResolvedValue(options.phoneIdentity),
  };
  const verifier = new SupabaseRecentAuthPasswordVerifier({
    supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
    supabaseSecretKey: 'test-secret-key-that-is-long-enough',
    supabaseUrl: 'http://127.0.0.1:8000',
  } as ApiConfig, accountPhones as unknown as AccountPhoneIdentityService);
  return { accountPhones, signInWithPassword, signOut, verifier };
}

describe('SupabaseRecentAuthPasswordVerifier', () => {
  beforeEach(() => supabase.createClient.mockReset());

  it('accepts the same Chinese phone when GoTrue omits the leading plus', async () => {
    const { signInWithPassword, signOut, verifier } = fixture('8613800138000');

    await expect(verifier.verify(source, 'password10')).resolves.toBeUndefined();

    expect(signInWithPassword).toHaveBeenCalledWith({
      phone: '+8613800138000',
      password: 'password10',
    });
    expect(signOut).toHaveBeenCalledWith('temporary-access-token', 'local');
  });

  it('still rejects a genuinely different phone identity', async () => {
    const { signOut, verifier } = fixture('8613900139000');

    await expect(verifier.verify(source, 'password10'))
      .rejects.toSatisfy((error: unknown) => error instanceof ForbiddenException
        && error.message === 'invalid_phone_or_password');
    expect(signOut).toHaveBeenCalledWith('temporary-access-token', 'local');
  });

  it('reauthenticates the account-bound phone principal from an Apple session', async () => {
    const phoneAuthUserId = '22222222-2222-4222-8222-222222222222';
    const appleSource: VerifiedAuthSession = {
      ...source,
      authUserId: '33333333-3333-4333-8333-333333333333',
      passwordSet: false,
      user: {
        id: source.user.id,
        providers: ['apple', 'phone'],
      },
    };
    const { accountPhones, signInWithPassword, verifier } = fixture('8613800138000', {
      phoneIdentity: {
        authUserId: phoneAuthUserId,
        passwordSet: true,
        phone: '+8613800138000',
      },
      returnedAuthUserId: phoneAuthUserId,
    });

    await expect(verifier.verify(appleSource, 'password10')).resolves.toBeUndefined();

    expect(accountPhones.resolve).toHaveBeenCalledWith(source.user.id);
    expect(signInWithPassword).toHaveBeenCalledWith({
      phone: '+8613800138000',
      password: 'password10',
    });
  });
});
