import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

import { apiRequest } from '@/platform/api-client';
import {
  SupabasePhoneAuthService,
  authError,
  isValidPhonePassword,
} from '../auth-service';

jest.mock('@/platform/api-client', () => ({ apiRequest: jest.fn() }));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const phone = '+8613800138000';

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
    refreshSession: jest.fn().mockResolvedValue({ data: { session: currentSession }, error: null }),
    resend: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
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
  beforeEach(() => mockApiRequest.mockReset());

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
    const otpSession = await service.verifyPhoneOtp(phone, '123456');
    const passwordSession = await service.signInWithPhonePassword(phone, 'password10');
    expect(otpSession.user).toEqual(expect.objectContaining({ id: 'user-1', phone, hasPassword: true, registrationPending: false }));
    expect(passwordSession.user).toEqual(expect.objectContaining({ id: 'user-1', phone, hasPassword: true, registrationPending: false }));
  });

  it('lets an OTP-first account enter without forcing password setup', async () => {
    const { auth, client } = authClient();
    const pendingSession = session({ user_metadata: { password_set: false, registration_pending: false } });
    auth.verifyOtp.mockResolvedValueOnce({ data: { session: pendingSession, user: pendingSession.user }, error: null });
    const verified = await new SupabasePhoneAuthService(client).verifyPhoneOtp(phone, '123456');
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

  it('signs out a password result that belongs to a non-China phone identity', async () => {
    const { auth, client } = authClient();
    const foreignSession = session({ phone: '+12025550123' });
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: foreignSession, user: foreignSession.user }, error: null });
    await expect(new SupabasePhoneAuthService(client).signInWithPhonePassword(phone, 'password10'))
      .rejects.toThrow('phone_account_required');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
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
