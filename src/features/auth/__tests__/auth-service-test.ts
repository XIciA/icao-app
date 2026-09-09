import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

import { apiRequest, apiRequestWithAccessToken } from '@/platform/api-client';
import {
  SupabasePhoneAuthService,
  authError,
  isValidPhonePassword,
} from '../auth-service';

jest.mock('@/platform/api-client', () => ({ apiRequest: jest.fn(), apiRequestWithAccessToken: jest.fn() }));

const mockAppleSignIn = jest.fn();
const mockWechatAuthorize = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { EMAIL: 1, FULL_NAME: 0 },
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn().mockResolvedValue('hashed-nonce'),
  randomUUID: jest.fn().mockReturnValue('10000000-0000-4000-8000-000000000099'),
}));
jest.mock('../wechat-native-auth', () => ({
  assertWechatChallengeMatchesNativeApp: jest.fn(),
  authorizeWithWechatNative: (...args: unknown[]) => mockWechatAuthorize(...args),
  getWechatNativeStatus: jest.fn().mockReturnValue({
    appId: 'wx1234567890abcdef',
    configured: true,
    installed: true,
    supported: true,
  }),
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockApiRequestWithAccessToken = apiRequestWithAccessToken as jest.MockedFunction<typeof apiRequestWithAccessToken>;

const phone = '+8613800138000';
const loginChallenge = {
  challengeId: '10000000-0000-4000-8000-000000000010',
  phone,
  purpose: 'login' as const,
};
const bindingChallenge = {
  challengeId: '10000000-0000-4000-8000-000000000011',
  expiresAt: 1_800_000_300_000,
  phone,
  resendAllowedAt: 1_800_000_060_000,
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    app_metadata: { provider: 'phone', providers: ['phone'] },
    user_metadata: { password_set: true, registration_pending: false },
    created_at: '2026-08-12T00:00:00.000Z',
    phone,
    identities: [{
      id: 'identity-1',
      identity_id: 'identity-1',
      user_id: 'user-1',
      provider: 'phone',
      identity_data: { phone },
      created_at: '2026-08-12T00:00:00.000Z',
      updated_at: '2026-08-12T00:00:00.000Z',
      last_sign_in_at: '2026-08-12T00:00:00.000Z',
    }],
    ...overrides,
  };
}

function session(userOverrides: Partial<User> = {}): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: user(userOverrides),
  };
}

function authClient() {
  const currentSession = session();
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: currentSession }, error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: currentSession.user }, error: null }),
    refreshSession: jest.fn().mockResolvedValue({ data: { session: currentSession }, error: null }),
    resend: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: currentSession, user: currentSession.user }, error: null }),
    signInWithOtp: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: { session: currentSession, user: currentSession.user }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    setSession: jest.fn().mockResolvedValue({ data: { session: currentSession, user: currentSession.user }, error: null }),
    updateUser: jest.fn().mockResolvedValue({ data: { user: currentSession.user }, error: null }),
    verifyOtp: jest.fn().mockResolvedValue({ data: { session: currentSession, user: currentSession.user }, error: null }),
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

describe('SupabasePhoneAuthService', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequestWithAccessToken.mockReset();
    mockAppleSignIn.mockReset().mockResolvedValue({
      authorizationCode: 'apple-authorization-code',
      identityToken: 'apple-identity-token',
    });
    mockWechatAuthorize.mockReset();
  });

  it('accepts only 10-64 character passwords containing a letter and a digit', () => {
    expect(isValidPhonePassword('password10')).toBe(true);
    expect(isValidPhonePassword('A123456789')).toBe(true);
    expect(isValidPhonePassword(`${'a'.repeat(63)}1`)).toBe(true);
    expect(isValidPhonePassword('short1')).toBe(false);
    expect(isValidPhonePassword('abcdefghij')).toBe(false);
    expect(isValidPhonePassword('1234567890')).toBe(false);
    expect(isValidPhonePassword(`${'a'.repeat(64)}1`)).toBe(false);
  });

  it('requests an OTP that auto-registers a normalized +86 account', async () => {
    const { auth, client } = authClient();
    mockApiRequest.mockResolvedValueOnce({ accepted: true });
    await new SupabasePhoneAuthService(client).requestPhoneOtp('13800138000');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/auth/phone/otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('keeps password recovery from creating an unknown phone account', async () => {
    const { auth, client } = authClient();
    mockApiRequest.mockResolvedValueOnce({ accepted: true });
    await new SupabasePhoneAuthService(client).requestPasswordRecoveryOtp('13800138000');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/auth/phone/recovery/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('authorizes password recovery only through the authenticated server session', async () => {
    const { client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      authorized: true,
      expiresAt: Date.now() + 600_000,
      grantId: '10000000-0000-4000-8000-000000000001',
    });

    await expect(new SupabasePhoneAuthService(client).authorizePasswordRecovery(
      '10000000-0000-4000-8000-000000000010',
      'fresh-recovery-access-token',
    ))
      .resolves.toEqual(expect.objectContaining({
        authorized: true,
        grantId: '10000000-0000-4000-8000-000000000001',
      }));
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith(
      '/v1/account/password/recovery/authorize',
      'fresh-recovery-access-token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: '10000000-0000-4000-8000-000000000010' }),
      },
    );
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('uses the current password to obtain a one-time account deletion grant', async () => {
    const { client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000002',
      method: 'password',
      purpose: 'account_delete',
    });

    await new SupabasePhoneAuthService(client).authorizeAccountDeletionWithPassword('password10');

    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/recent-auth/password', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'password10', purpose: 'account_delete' }),
    });
  });

  it('starts and consumes a phone OTP before obtaining an account deletion grant', async () => {
    const { auth, client } = authClient();
    const { auth: transientAuth, client: transientClient } = authClient();
    mockApiRequestWithAccessToken
      .mockResolvedValueOnce({
        accepted: true,
        challengeId: '10000000-0000-4000-8000-000000000010',
        expiresAt: Date.now() + 300_000,
        issuedAt: Date.now(),
        resendAllowedAt: Date.now() + 60_000,
        serverTime: Date.now(),
      })
      ;
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000003',
      method: 'phone_otp',
      purpose: 'account_delete',
    });
    const service = new SupabasePhoneAuthService(client, transientClient);

    await service.requestAccountDeletionPhoneOtp();
    const authorization = await service.authorizeAccountDeletionWithPhoneOtp('123456');

    expect(mockApiRequestWithAccessToken.mock.calls.slice(0, 1)).toEqual([
      ['/v1/account/recent-auth/phone/start', 'access-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'account_delete' }),
      }],
    ]);
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith(
      '/v1/account/recent-auth/phone',
      'access-token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: '10000000-0000-4000-8000-000000000010',
          purpose: 'account_delete',
          token: '123456',
        }),
      },
    );
    expect(transientAuth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(authorization.grantId).toBe('10000000-0000-4000-8000-000000000003');
  });

  it('uses the account-bound phone OTP fallback from an active Apple session', async () => {
    const { auth, client } = authClient();
    const appleUser = user({
      app_metadata: { provider: 'apple', providers: ['apple'] },
      identities: [{
        id: 'apple-identity', identity_id: 'apple-identity', user_id: 'user-1', provider: 'apple',
        identity_data: { sub: 'apple-subject' }, created_at: '2026-08-12T00:00:00.000Z',
        updated_at: '2026-08-12T00:00:00.000Z', last_sign_in_at: '2026-08-12T00:00:00.000Z',
      }],
      phone: undefined,
    });
    auth.getSession.mockResolvedValue({ data: { session: session(appleUser) }, error: null });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      accepted: true,
      challengeId: '10000000-0000-4000-8000-000000000010',
      expiresAt: Date.now() + 300_000,
      issuedAt: Date.now(),
      resendAllowedAt: Date.now() + 60_000,
      serverTime: Date.now(),
    });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000003',
      method: 'phone_otp',
      purpose: 'account_delete',
    });
    const service = new SupabasePhoneAuthService(client);

    await service.requestAccountDeletionPhoneOtp();
    await expect(service.authorizeAccountDeletionWithPhoneOtp('123456')).resolves.toEqual(
      expect.objectContaining({ grantId: '10000000-0000-4000-8000-000000000003' }),
    );
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith(
      '/v1/account/recent-auth/phone',
      'access-token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('obtains an Apple deletion grant without replacing the current session', async () => {
    const { auth, client } = authClient();
    const transient = authClient();
    const appleUser = user({
      app_metadata: { provider: 'apple', providers: ['apple'] },
      identities: [{
        id: 'apple-identity', identity_id: 'apple-identity', user_id: 'user-1', provider: 'apple',
        identity_data: { sub: 'apple-subject' }, created_at: '2026-08-12T00:00:00.000Z',
        updated_at: '2026-08-12T00:00:00.000Z', last_sign_in_at: '2026-08-12T00:00:00.000Z',
      }],
      phone: undefined,
    });
    auth.getSession.mockResolvedValueOnce({ data: { session: session(appleUser) }, error: null });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000004',
      method: 'apple',
      purpose: 'account_delete',
    });

    await new SupabasePhoneAuthService(client, transient.client).authorizeAccountDeletionWithApple();

    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/recent-auth/apple', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authorizationCode: 'apple-authorization-code',
        providerAccessToken: 'access-token',
        purpose: 'account_delete',
        rawNonce: '10000000-0000-4000-8000-000000000099',
      }),
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(transient.auth.signInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    { authorized: true, expiresAt: Date.now() + 600_000 },
    { authorized: true, expiresAt: Date.now() - 1, grantId: '10000000-0000-4000-8000-000000000001' },
  ])('rejects a missing or expired password recovery grant', async (response) => {
    const { client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce(response as never);

    await expect(new SupabasePhoneAuthService(client).authorizePasswordRecovery(
      '10000000-0000-4000-8000-000000000010',
      'fresh-recovery-access-token',
    ))
      .rejects.toThrow('phone_reauthentication_required');
  });

  it('returns the same +86 identity for OTP and password login', async () => {
    const { client } = authClient();
    const service = new SupabasePhoneAuthService(client);
    mockApiRequest.mockResolvedValueOnce({
      verified: true,
      session: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
    const otpSession = await service.verifyPhoneOtp(loginChallenge, '123456');
    const passwordSession = await service.signInWithPhonePassword(phone, 'password10');
    expect(otpSession.user).toEqual(expect.objectContaining({ id: 'user-1', phone, hasPassword: true, registrationPending: false }));
    expect(passwordSession.user).toEqual(expect.objectContaining({ id: 'user-1', phone, hasPassword: true, registrationPending: false }));
  });

  it('normalizes the digits-only phone representation returned by production GoTrue', async () => {
    const { auth, client } = authClient();
    const productionSession = session({ phone: phone.slice(1) });
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: productionSession, user: productionSession.user },
      error: null,
    });
    auth.getUser.mockResolvedValueOnce({ data: { user: productionSession.user }, error: null });
    auth.setSession.mockResolvedValueOnce({
      data: { session: productionSession, user: productionSession.user },
      error: null,
    });

    await expect(new SupabasePhoneAuthService(client).signInWithPhonePassword(phone, 'password10'))
      .resolves.toEqual(expect.objectContaining({
        user: expect.objectContaining({ phone, phoneBound: true }),
      }));
  });

  it('lets an OTP-first account enter without forcing password setup', async () => {
    const { auth, client } = authClient();
    const pendingSession = session({ user_metadata: { password_set: false, registration_pending: false } });
    auth.setSession.mockResolvedValueOnce({ data: { session: pendingSession, user: pendingSession.user }, error: null });
    mockApiRequest.mockResolvedValueOnce({
      verified: true,
      session: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
    const verified = await new SupabasePhoneAuthService(client).verifyPhoneOtp(loginChallenge, '123456');
    expect(verified.user).toEqual(expect.objectContaining({
      hasPassword: false,
      registrationPending: false,
    }));
  });

  it('updates the current phone identity password and password marker', async () => {
    const { auth, client } = authClient();
    const nextSession = {
      ...session({ user_metadata: { password_set: true, registration_pending: false } }),
      access_token: 'next-access-token',
      refresh_token: 'next-refresh-token',
    };
    auth.setSession.mockResolvedValueOnce({ data: { session: nextSession, user: nextSession.user }, error: null });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
      updated: true,
    });
    await expect(new SupabasePhoneAuthService(client).updatePassword('newpassword10', 'oldpassword10'))
      .resolves.toEqual(expect.objectContaining({ accessToken: 'next-access-token', refreshToken: 'next-refresh-token' }));
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/password', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'newpassword10', currentPassword: 'oldpassword10' }),
    });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'next-access-token',
      refresh_token: 'next-refresh-token',
    });
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('passes the one-time recovery grant when replacing a forgotten password', async () => {
    const { client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
      updated: true,
    });

    await new SupabasePhoneAuthService(client).updatePassword(
      'newpassword10',
      undefined,
      '10000000-0000-4000-8000-000000000001',
    );

    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/password', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password: 'newpassword10',
        recoveryGrantId: '10000000-0000-4000-8000-000000000001',
      }),
    });
  });

  it.each(['apple', 'wechat'] as const)('changes a bound phone password from %s only after proving the same permanent account', async (provider) => {
    const current = authClient(); const transient = authClient();
    const social = session({ id: 'social-user', phone: undefined,
      identities: provider === 'apple' ? [{ provider: 'apple' } as NonNullable<User['identities']>[number]] : [],
      app_metadata: provider === 'wechat' ? { icao_identity_provider: 'wechat', icao_wechat_subject: 'subject' } : {},
    });
    current.auth.getSession.mockResolvedValue({ data: { session: { ...social, access_token: 'social-token' } }, error: null });
    const next = { ...session(), access_token: 'updated-phone-token', refresh_token: 'updated-phone-refresh' };
    current.auth.setSession.mockResolvedValue({ data: { session: next }, error: null });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ accountId: 'permanent-account', phone, phoneBound: true })
      .mockResolvedValueOnce({ accountId: 'permanent-account', phone, phoneBound: true })
      .mockResolvedValueOnce({ updated: true, session: { accessToken: next.access_token, refreshToken: next.refresh_token } });
    const result = await new SupabasePhoneAuthService(current.client, transient.client).updatePassword('newpassword10', 'oldpassword10');
    expect(result.user.id).toBe('user-1');
    expect(transient.auth.signInWithPassword).toHaveBeenCalledWith({ phone, password: 'oldpassword10' });
    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(1, '/v1/account', 'social-token');
    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(2, '/v1/account', 'access-token');
    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(3, '/v1/account/password', 'access-token', expect.objectContaining({ method: 'POST' }));
    expect(current.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(current.auth.signOut).not.toHaveBeenCalled();
    expect(current.auth.setSession).toHaveBeenCalledTimes(1);
  });

  it('keeps a social login unchanged when its bound phone now resolves to another account', async () => {
    const current = authClient(); const transient = authClient();
    current.auth.getSession.mockResolvedValue({ data: { session: session({ phone: undefined, identities: [{ provider: 'apple' } as NonNullable<User['identities']>[number]] }) }, error: null });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ accountId: 'owner', phone, phoneBound: true })
      .mockResolvedValueOnce({ accountId: 'another-owner', phone, phoneBound: true });
    await expect(new SupabasePhoneAuthService(current.client, transient.client).updatePassword('newpassword10', 'oldpassword10')).rejects.toThrow('auth_session_identity_mismatch');
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledTimes(2);
    expect(current.auth.setSession).not.toHaveBeenCalled();
    expect(current.auth.signOut).not.toHaveBeenCalled();
  });

  it('does not update a password when current-password reauthentication fails', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockRejectedValueOnce(new Error('invalid_phone_or_password'));

    await expect(new SupabasePhoneAuthService(client).updatePassword('newpassword10', 'wrongpassword10'))
      .rejects.toThrow('invalid_phone_or_password');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('maps an atomic current-password mismatch returned during the update', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockRejectedValueOnce(new Error('invalid_phone_or_password'));

    await expect(new SupabasePhoneAuthService(client).updatePassword('newpassword10', 'oldpassword10'))
      .rejects.toThrow('invalid_phone_or_password');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('rejects a password result that belongs to a non-China phone identity without clearing another session', async () => {
    const { auth, client } = authClient();
    const foreignSession = session({ phone: '+12025550123' });
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: foreignSession, user: foreignSession.user }, error: null });
    auth.setSession.mockResolvedValueOnce({ data: { session: foreignSession, user: foreignSession.user }, error: null });
    await expect(new SupabasePhoneAuthService(client).signInWithPhonePassword(phone, 'password10'))
      .rejects.toThrow('phone_account_required');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('starts phone binding through the authenticated server without probing phone occupancy', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ ...bindingChallenge, sent: true });

    const challenge = await new SupabasePhoneAuthService(client).requestPhoneBindingOtp('13800138000');

    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/phone-binding/start', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(challenge).toEqual(bindingChallenge);
  });

  it('reauthenticates WeChat and binds the resulting purpose grant to phone-binding requests', async () => {
    const { auth, client } = authClient();
    const wechatUser = user({
      app_metadata: {
        icao_identity_provider: 'wechat',
        icao_wechat_subject: 'wechat-subject-digest',
      },
      identities: [],
      phone: undefined,
    });
    auth.getSession.mockResolvedValue({ data: { session: session(wechatUser) }, error: null });
    mockApiRequestWithAccessToken
      .mockRejectedValueOnce(new Error('recent_social_auth_required'))
      .mockResolvedValueOnce({
        appId: 'wx1234567890abcdef',
        challengeId: '10000000-0000-4000-8000-000000000020',
        expiresAt: Date.now() + 300_000,
        issuedAt: Date.now(),
        state: 'wechat-phone-binding-state',
        status: 'available',
      })
      .mockResolvedValueOnce({
        expiresAt: Date.now() + 600_000,
        grantId: '10000000-0000-4000-8000-000000000021',
        method: 'wechat',
        purpose: 'phone_binding',
      })
      .mockResolvedValueOnce({ ...bindingChallenge, sent: true });
    mockWechatAuthorize.mockResolvedValue({
      code: 'wechat-phone-binding-code',
      state: 'wechat-phone-binding-state',
    });

    const challenge = await new SupabasePhoneAuthService(client).requestPhoneBindingOtp('13800138000');

    expect(mockApiRequestWithAccessToken.mock.calls.slice(1, 3)).toEqual([
      ['/v1/account/recent-auth/wechat/start', 'access-token', expect.objectContaining({
        body: JSON.stringify({ purpose: 'phone_binding' }),
      })],
      ['/v1/account/recent-auth/wechat', 'access-token', expect.objectContaining({
        body: JSON.stringify({
          challengeId: '10000000-0000-4000-8000-000000000020',
          code: 'wechat-phone-binding-code',
          purpose: 'phone_binding',
          state: 'wechat-phone-binding-state',
        }),
      })],
    ]);
    expect(mockApiRequestWithAccessToken).toHaveBeenLastCalledWith('/v1/account/phone-binding/start', 'access-token', expect.objectContaining({
      body: JSON.stringify({
        phone,
        recentAuthGrantId: '10000000-0000-4000-8000-000000000021',
      }),
    }));
    expect(challenge.recentAuthGrantId).toBe('10000000-0000-4000-8000-000000000021');
  });

  it('carries the WeChat reauthentication grant through resend and final verification', async () => {
    const { client } = authClient();
    const challenge = {
      ...bindingChallenge,
      recentAuthGrantId: '10000000-0000-4000-8000-000000000021',
    };
    mockApiRequestWithAccessToken
      .mockResolvedValueOnce({ ...bindingChallenge, sent: true })
      .mockResolvedValueOnce({
        account: { accountId: 'account-1', phone, phoneBound: true, providers: ['phone', 'wechat'] },
        session: { accessToken: 'target-access-token', refreshToken: 'target-refresh-token' },
      });
    const service = new SupabasePhoneAuthService(client);

    const resent = await service.resendPhoneBindingOtp(challenge);
    await service.verifyPhoneBindingOtp(resent, '123456');

    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(1, '/v1/account/phone-binding/start', 'access-token', expect.objectContaining({
      body: JSON.stringify({ phone, recentAuthGrantId: challenge.recentAuthGrantId }),
    }));
    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(2, '/v1/account/phone-binding/verify', 'access-token', expect.objectContaining({
      body: JSON.stringify({
        challengeId: bindingChallenge.challengeId,
        phone,
        recentAuthGrantId: challenge.recentAuthGrantId,
        token: '123456',
      }),
    }));
  });

  it('lets the server bind an unused phone before switching the local session', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      account: { accountId: 'account-1', phone, phoneBound: true, providers: ['phone', 'apple'] },
      session: { accessToken: 'target-access-token', refreshToken: 'target-refresh-token' },
    });
    const result = await new SupabasePhoneAuthService(client).verifyPhoneBindingOtp(bindingChallenge, '123456');
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/phone-binding/verify', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: bindingChallenge.challengeId, phone, token: '123456' }),
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'target-access-token',
      refresh_token: 'target-refresh-token',
    });
    expect(result.account.accountId).toBe('account-1');
  });

  it('keeps the current Apple session when the verified phone already has an account', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockRejectedValueOnce(new Error('phone_already_registered'));

    await expect(new SupabasePhoneAuthService(client).verifyPhoneBindingOtp(bindingChallenge, '123456'))
      .rejects.toThrow('phone_already_registered');

    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('never persists a late successful login after a newer login generation has already failed', async () => {
    const { auth, client } = authClient();
    const { auth: transientAuth, client: transientClient } = authClient();
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    transientAuth.signInWithPassword
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'invalid_credentials', message: 'invalid' } });
    const service = new SupabasePhoneAuthService(client, transientClient);

    const late = service.signInWithPhonePassword(phone, 'password10');
    await Promise.resolve();
    const newer = service.signInWithPhonePassword(phone, 'wrongpassword10');
    await expect(newer).rejects.toThrow('invalid_phone_or_password');
    const lateSession = session();
    resolveFirst({ data: { session: lateSession, user: lateSession.user }, error: null });

    await expect(late).rejects.toThrow('auth_request_not_completed');
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('restores the previous persistent snapshot when a newer failed login starts during deferred setSession', async () => {
    const { auth, client } = authClient();
    const { auth: transientAuth, client: transientClient } = authClient();
    const previous = {
      ...session(),
      access_token: 'previous-access',
      refresh_token: 'previous-refresh',
    };
    const candidate = {
      ...session(),
      access_token: 'candidate-access',
      refresh_token: 'candidate-refresh',
    };
    auth.getSession.mockResolvedValue({ data: { session: previous }, error: null });
    transientAuth.signInWithPassword
      .mockResolvedValueOnce({ data: { session: candidate, user: candidate.user }, error: null })
      .mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'invalid_credentials', message: 'invalid' } });
    transientAuth.getUser.mockResolvedValue({ data: { user: candidate.user }, error: null });
    let resolveCandidateWrite!: (value: unknown) => void;
    const candidateWrite = new Promise((resolve) => { resolveCandidateWrite = resolve; });
    auth.setSession
      .mockImplementationOnce(() => candidateWrite)
      .mockResolvedValueOnce({ data: { session: previous, user: previous.user }, error: null });
    const service = new SupabasePhoneAuthService(client, transientClient);

    const first = service.signInWithPhonePassword(phone, 'password10');
    for (let attempt = 0; attempt < 20 && auth.setSession.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    expect(auth.setSession).toHaveBeenCalledTimes(1);
    const newer = service.signInWithPhonePassword(phone, 'wrongpassword10');
    await expect(newer).rejects.toThrow('invalid_phone_or_password');
    resolveCandidateWrite({ data: { session: candidate, user: candidate.user }, error: null });

    await expect(first).rejects.toThrow('auth_request_not_completed');
    expect(auth.setSession).toHaveBeenNthCalledWith(2, {
      access_token: 'previous-access',
      refresh_token: 'previous-refresh',
    });
  });

  it('reports a persistent-session restore failure instead of swallowing it', async () => {
    const { auth, client } = authClient();
    const { auth: transientAuth, client: transientClient } = authClient();
    const foreign = session({ id: 'foreign-user', phone: '+12025550123' });
    auth.setSession
      .mockResolvedValueOnce({ data: { session: foreign, user: foreign.user }, error: null })
      .mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'storage_failure', message: 'storage failed' } });
    transientAuth.getUser.mockResolvedValueOnce({ data: { user: user() }, error: null });
    mockApiRequest.mockResolvedValueOnce({
      session: { accessToken: 'otp-access', refreshToken: 'otp-refresh' },
      verified: true,
    });

    await expect(new SupabasePhoneAuthService(client, transientClient).verifyPhoneOtp(loginChallenge, '123456'))
      .rejects.toThrow('auth_session_restore_failed');
    expect(auth.setSession).toHaveBeenCalledTimes(2);
  });

  it('resends binding codes through the same neutral server endpoint', async () => {
    const { auth, client } = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({
      ...bindingChallenge,
      challengeId: '10000000-0000-4000-8000-000000000012',
      sent: true,
    });
    const service = new SupabasePhoneAuthService(client);
    await expect(service.resendPhoneBindingOtp(bindingChallenge)).resolves.toEqual({
      ...bindingChallenge,
      challengeId: '10000000-0000-4000-8000-000000000012',
    });
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/phone-binding/start', 'access-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.resend).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([
    ['password', (service: SupabasePhoneAuthService) => service.updatePassword('newpassword10', 'oldpassword10')],
    ['phone start', (service: SupabasePhoneAuthService) => service.requestPhoneBindingOtp(phone)],
    ['phone resend', (service: SupabasePhoneAuthService) => service.resendPhoneBindingOtp(bindingChallenge)],
    ['phone verify', (service: SupabasePhoneAuthService) => service.verifyPhoneBindingOtp(bindingChallenge, '123456')],
    ['password reauthentication', (service: SupabasePhoneAuthService) => service.authorizeAccountDeletionWithPassword('password10')],
    ['phone reauthentication', (service: SupabasePhoneAuthService) => service.requestAccountDeletionPhoneOtp()],
  ] as const)('never replays %s against another account after a late 401', async (_label, action) => {
    const actual = jest.requireActual<typeof import('@/platform/api-client')>('@/platform/api-client');
    const originalFetch = global.fetch;
    const originalBaseUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;
    const current = authClient();
    let activeToken = 'access-token';
    const refresh = jest.fn().mockResolvedValue('account-b-token');
    const invalidated = jest.fn();
    actual.setApiAccessTokenProvider(async () => activeToken);
    actual.setApiAuthRecovery({ refresh, onInvalidated: invalidated });
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.test.invalid';
    mockApiRequest.mockImplementation(actual.apiRequest);
    mockApiRequestWithAccessToken.mockImplementation(actual.apiRequestWithAccessToken);
    const fetchMock = jest.fn().mockImplementation(async () => {
      activeToken = 'account-b-token';
      current.auth.getSession.mockResolvedValue({ data: { session: { ...session({ id: 'account-b' }), access_token: activeToken } }, error: null });
      return { status: 401, ok: false, json: async () => ({ error: { code: 'session_revoked' } }) };
    });
    global.fetch = fetchMock;
    try {
      await expect(action(new SupabasePhoneAuthService(current.client))).rejects.toThrow('session_revoked');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1].headers as Headers).get('authorization')).toBe('Bearer access-token');
      expect(refresh).not.toHaveBeenCalled();
      expect(invalidated).not.toHaveBeenCalled();
      expect(current.auth.setSession).not.toHaveBeenCalled();
    } finally {
      actual.setApiAccessTokenProvider(undefined);
      actual.setApiAuthRecovery(undefined);
      global.fetch = originalFetch;
      if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_ICAO_API_URL;
      else process.env.EXPO_PUBLIC_ICAO_API_URL = originalBaseUrl;
    }
  });

  it('renews a stale Apple proof for phone binding without replacing the active session', async () => {
    const current = authClient(); const transient = authClient();
    const apple = session({ phone: undefined, identities: [{ provider: 'apple' } as NonNullable<User['identities']>[number]] });
    current.auth.getSession.mockResolvedValue({ data: { session: apple }, error: null });
    mockApiRequestWithAccessToken.mockRejectedValueOnce(new Error('recent_social_auth_required'))
      .mockResolvedValueOnce({ grantId: 'apple-phone-binding-grant', purpose: 'phone_binding', method: 'apple' })
      .mockResolvedValueOnce({ ...bindingChallenge, sent: true });
    const result = await new SupabasePhoneAuthService(current.client, transient.client).requestPhoneBindingOtp(phone);
    expect(result.recentAuthGrantId).toBe('apple-phone-binding-grant');
    expect(mockApiRequestWithAccessToken).toHaveBeenNthCalledWith(2, '/v1/account/recent-auth/apple', 'access-token', expect.objectContaining({
      body: expect.stringContaining('"purpose":"phone_binding"'),
    }));
    expect(current.auth.setSession).not.toHaveBeenCalled();
    expect(current.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('dual phone auth error mapping', () => {
  beforeEach(() => {
    mockApiRequestWithAccessToken.mockReset();
    mockApiRequestWithAccessToken.mockReset();
    mockAppleSignIn.mockReset().mockResolvedValue({ authorizationCode: 'apple-authorization-code', identityToken: 'apple-identity-token' });
    mockWechatAuthorize.mockReset();
  });
  it('classifies password and account errors without passing supplier text through', () => {
    expect(authError({ code: 'weak_password', message: 'weak' }).message).toBe('invalid_phone_password');
    expect(authError({ code: 'invalid_credentials', message: 'invalid login credentials' }).message).toBe('invalid_phone_or_password');
    expect(authError({ code: 'phone_exists', message: 'already registered' }).message).toBe('phone_account_already_exists');
    expect(authError({ code: 'user_not_found', message: 'not found' }).message).toBe('phone_account_not_found');
  });
  it('binds Apple with a transient proof while preserving the active phone session on conflicts', async () => {
    const current = authClient(); const transient = authClient();
    mockApiRequestWithAccessToken.mockRejectedValueOnce(new Error('login_method_already_owned'));
    const service = new SupabasePhoneAuthService(current.client, transient.client);
    await expect(service.bindApple('grant-apple-binding')).rejects.toThrow('login_method_already_owned');
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledWith('/v1/account/login-methods/apple/bind', 'access-token', expect.objectContaining({
      body: JSON.stringify({ providerAccessToken: 'access-token', recentAuthGrantId: 'grant-apple-binding' }),
    }));
    expect(current.auth.setSession).not.toHaveBeenCalled(); expect(current.auth.signOut).not.toHaveBeenCalled();
    expect(current.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('rejects a mismatched WeChat binding callback without changing the current account', async () => {
    const current = authClient();
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ status: 'available', appId: 'wx1234567890abcdef', challengeId: 'challenge', state: 'expected-state' });
    mockWechatAuthorize.mockResolvedValueOnce({ code: 'code', state: 'another-state' });
    await expect(new SupabasePhoneAuthService(current.client).bindWechat('grant')).rejects.toThrow('invalid_wechat_auth_response');
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledTimes(1);
    expect(current.auth.setSession).not.toHaveBeenCalled(); expect(current.auth.signOut).not.toHaveBeenCalled();
  });

  it('does not submit a late Apple binding proof after the user signs out', async () => {
    const current = authClient(); const transient = authClient();
    let authorize!: (value: unknown) => void;
    mockAppleSignIn.mockImplementationOnce(() => new Promise((resolve) => { authorize = resolve; }));
    const service = new SupabasePhoneAuthService(current.client, transient.client);
    const pending = service.bindApple('grant');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.signOut();
    authorize({ authorizationCode: 'code', identityToken: 'apple-token' });
    await expect(pending).rejects.toThrow('auth_request_not_completed');
    expect(mockApiRequestWithAccessToken).not.toHaveBeenCalled();
  });

  it('keeps the current session when a recovery code resolves to a different business account', async () => {
    const current = authClient(); const transient = authClient();
    mockApiRequest.mockResolvedValueOnce({ verified: true, session: { accessToken: 'recovery-access', refreshToken: 'recovery-refresh' } });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ accountId: 'another-account', phone, phoneBound: true, providers: ['phone'] });
    const service = new SupabasePhoneAuthService(current.client, transient.client);
    await expect(service.verifyCurrentAccountRecoveryOtp({ challengeId: 'challenge', phone }, '123456', 'current-account')).rejects.toThrow('auth_session_identity_mismatch');
    expect(current.auth.signOut).not.toHaveBeenCalled(); expect(current.auth.setSession).not.toHaveBeenCalled();
    expect(mockApiRequestWithAccessToken).toHaveBeenCalledTimes(1);
  });

  it('commits current-account password recovery only after account ownership and the recovery grant are validated', async () => {
    const current = authClient(); const transient = authClient();
    const authorization = { authorized: true, grantId: 'recovery-grant', expiresAt: Date.now() + 300_000 };
    mockApiRequest.mockResolvedValueOnce({ verified: true, session: { accessToken: 'recovery-access', refreshToken: 'recovery-refresh' } });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ accountId: 'current-account', phone, phoneBound: true, providers: ['phone', 'wechat'], hasPassword: true })
      .mockResolvedValueOnce(authorization);
    const service = new SupabasePhoneAuthService(current.client, transient.client);
    const result = await service.verifyCurrentAccountRecoveryOtp({ challengeId: 'challenge', phone }, '123456', 'current-account');
    expect(result).toMatchObject({ authorization, session: { user: { id: 'user-1', authUserId: 'user-1', providers: ['phone'] } } });
    expect((await service.getSession())?.user.id).toBe(result.session.user.id);
    expect((await service.refreshSession())?.user.id).toBe(result.session.user.id);
    expect(current.auth.setSession).toHaveBeenCalledWith({ access_token: 'recovery-access', refresh_token: 'recovery-refresh' });
    expect(current.auth.signOut).not.toHaveBeenCalled();
    expect(mockApiRequestWithAccessToken.mock.invocationCallOrder[1]).toBeLessThan(current.auth.setSession.mock.invocationCallOrder[0]);
  });

  it('does not replace a session when the server cannot authorize password recovery', async () => {
    const current = authClient(); const transient = authClient();
    mockApiRequest.mockResolvedValueOnce({ verified: true, session: { accessToken: 'recovery-access', refreshToken: 'recovery-refresh' } });
    mockApiRequestWithAccessToken.mockResolvedValueOnce({ accountId: 'current-account', phone, phoneBound: true, providers: ['phone'] })
      .mockRejectedValueOnce(new Error('recent_auth_required'));
    await expect(new SupabasePhoneAuthService(current.client, transient.client).verifyCurrentAccountRecoveryOtp({ challengeId: 'challenge', phone }, '123456', 'current-account')).rejects.toThrow('recent_auth_required');
    expect(current.auth.setSession).not.toHaveBeenCalled(); expect(current.auth.signOut).not.toHaveBeenCalled();
  });

});
