import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

import { apiRequest, apiRequestWithAccessToken } from '@/platform/api-client';
import {
  SupabasePhoneAuthService,
  authError,
  isValidPhonePassword,
} from '../auth-service';

jest.mock('@/platform/api-client', () => ({ apiRequest: jest.fn(), apiRequestWithAccessToken: jest.fn() }));

const mockAppleSignIn = jest.fn();
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

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockApiRequestWithAccessToken = apiRequestWithAccessToken as jest.MockedFunction<typeof apiRequestWithAccessToken>;

const phone = '+8613800138000';
const loginChallenge = {
  challengeId: '10000000-0000-4000-8000-000000000010',
  phone,
  purpose: 'login' as const,
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
    mockApiRequest.mockResolvedValueOnce({
      authorized: true,
      expiresAt: Date.now() + 600_000,
      grantId: '10000000-0000-4000-8000-000000000001',
    });

    await expect(new SupabasePhoneAuthService(client).authorizePasswordRecovery())
      .resolves.toEqual(expect.objectContaining({
        authorized: true,
        grantId: '10000000-0000-4000-8000-000000000001',
      }));
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/password/recovery/authorize', {
      method: 'POST',
    });
  });

  it('uses the current password to obtain a one-time account deletion grant', async () => {
    const { client } = authClient();
    mockApiRequest.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000002',
      method: 'password',
      purpose: 'account_delete',
    });

    await new SupabasePhoneAuthService(client).authorizeAccountDeletionWithPassword('password10');

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/recent-auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'password10', purpose: 'account_delete' }),
    });
  });

  it('starts and consumes a phone OTP before obtaining an account deletion grant', async () => {
    const { auth, client } = authClient();
    const { auth: transientAuth, client: transientClient } = authClient();
    mockApiRequest
      .mockResolvedValueOnce({ accepted: true })
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

    expect(mockApiRequest.mock.calls).toEqual([
      ['/v1/account/recent-auth/phone/start', {
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
        body: JSON.stringify({ purpose: 'account_delete' }),
      },
    );
    expect(transientAuth.verifyOtp).toHaveBeenCalledWith({ phone, token: '123456', type: 'sms' });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(authorization.grantId).toBe('10000000-0000-4000-8000-000000000003');
  });

  it('obtains an Apple deletion grant without replacing the current session', async () => {
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
    auth.getSession.mockResolvedValueOnce({ data: { session: session(appleUser) }, error: null });
    mockApiRequest.mockResolvedValueOnce({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000004',
      method: 'apple',
      purpose: 'account_delete',
    });

    await new SupabasePhoneAuthService(client).authorizeAccountDeletionWithApple();

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/recent-auth/apple', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authorizationCode: 'apple-authorization-code',
        purpose: 'account_delete',
        rawNonce: '10000000-0000-4000-8000-000000000099',
      }),
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it.each([
    { authorized: true, expiresAt: Date.now() + 600_000 },
    { authorized: true, expiresAt: Date.now() - 1, grantId: '10000000-0000-4000-8000-000000000001' },
  ])('rejects a missing or expired password recovery grant', async (response) => {
    const { client } = authClient();
    mockApiRequest.mockResolvedValueOnce(response as never);

    await expect(new SupabasePhoneAuthService(client).authorizePasswordRecovery())
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
    mockApiRequest.mockResolvedValueOnce({
      session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
      updated: true,
    });
    await expect(new SupabasePhoneAuthService(client).updatePassword('newpassword10', 'oldpassword10'))
      .resolves.toEqual(expect.objectContaining({ accessToken: 'next-access-token', refreshToken: 'next-refresh-token' }));
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/password', {
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
    mockApiRequest.mockResolvedValueOnce({
      session: { accessToken: 'next-access-token', refreshToken: 'next-refresh-token' },
      updated: true,
    });

    await new SupabasePhoneAuthService(client).updatePassword(
      'newpassword10',
      undefined,
      '10000000-0000-4000-8000-000000000001',
    );

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password: 'newpassword10',
        recoveryGrantId: '10000000-0000-4000-8000-000000000001',
      }),
    });
  });

  it('does not update a password when current-password reauthentication fails', async () => {
    const { auth, client } = authClient();
    mockApiRequest.mockRejectedValueOnce(new Error('invalid_phone_or_password'));

    await expect(new SupabasePhoneAuthService(client).updatePassword('newpassword10', 'wrongpassword10'))
      .rejects.toThrow('invalid_phone_or_password');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('maps an atomic current-password mismatch returned during the update', async () => {
    const { auth, client } = authClient();
    mockApiRequest.mockRejectedValueOnce(new Error('invalid_phone_or_password'));

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
    mockApiRequest.mockResolvedValueOnce({ sent: true });

    const challenge = await new SupabasePhoneAuthService(client).requestPhoneBindingOtp('13800138000');

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/phone-binding/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(challenge).toEqual({ phone });
  });

  it('lets the server bind an unused phone before switching the local session', async () => {
    const { auth, client } = authClient();
    mockApiRequest.mockResolvedValueOnce({
      account: { accountId: 'account-1', phone, phoneBound: true, providers: ['phone', 'apple'] },
      session: { accessToken: 'target-access-token', refreshToken: 'target-refresh-token' },
    });
    const result = await new SupabasePhoneAuthService(client).verifyPhoneBindingOtp({ phone }, '123456');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/phone-binding/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, token: '123456' }),
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
    mockApiRequest.mockRejectedValueOnce(new Error('phone_already_registered'));

    await expect(new SupabasePhoneAuthService(client).verifyPhoneBindingOtp({ phone }, '123456'))
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
    mockApiRequest.mockResolvedValueOnce({ sent: true });
    const service = new SupabasePhoneAuthService(client);
    await service.resendPhoneBindingOtp({ phone });
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/phone-binding/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(auth.resend).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('dual phone auth error mapping', () => {
  it('classifies password and account errors without passing supplier text through', () => {
    expect(authError({ code: 'weak_password', message: 'weak' }).message).toBe('invalid_phone_password');
    expect(authError({ code: 'invalid_credentials', message: 'invalid login credentials' }).message).toBe('invalid_phone_or_password');
    expect(authError({ code: 'phone_exists', message: 'already registered' }).message).toBe('phone_account_already_exists');
    expect(authError({ code: 'user_not_found', message: 'not found' }).message).toBe('phone_account_not_found');
  });
});
