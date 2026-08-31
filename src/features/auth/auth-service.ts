import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountSummary, AuthIdentityProvider, AuthorizePasswordRecoveryResponse, BindPhoneResponse, CompleteWechatAuthResponse, RecentAuthGrantResponse, StartPhoneBindingResponse, StartPhoneOtpResponse, StartWechatAuthResponse, UpdatePhonePasswordResponse, VerifyPhoneOtpResponse } from '@icao/contracts';
import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { apiRequest, apiRequestWithAccessToken } from '@/platform/api-client';
import { secureSessionStorage } from './secure-session-storage';
import { authorizeWithWechatNative, getWechatNativeStatus } from './wechat-native-auth';

export type AppSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken: string;
  user: {
    id: string;
    authUserId: string;
    displayName?: string;
    hasPassword: boolean;
    phone?: string;
    phoneBound: boolean;
    providers: AuthIdentityProvider[];
    registrationPending: boolean;
  };
};

export type PhoneBindingChallenge = { phone: string };
export type PhoneBindingVerification = { account: AccountSummary; challenge: PhoneBindingChallenge; session: AppSession };

export type AuthService = {
  getSession(): Promise<AppSession | undefined>;
  refreshSession(): Promise<AppSession | undefined>;
  isAppleSignInAvailable(): Promise<boolean>;
  isWechatSignInAvailable(): Promise<boolean>;
  signInWithApple(): Promise<AppSession>;
  signInWithWechat(): Promise<AppSession>;
  authorizeAccountDeletionWithApple(): Promise<RecentAuthGrantResponse>;
  authorizeAccountDeletionWithWechat(accountId: string): Promise<{ grant: RecentAuthGrantResponse; session: AppSession }>;
  authorizeAccountDeletionWithPassword(password: string): Promise<RecentAuthGrantResponse>;
  authorizeAccountDeletionWithPhoneOtp(token: string): Promise<{ grant: RecentAuthGrantResponse; session: AppSession }>;
  requestAccountDeletionPhoneOtp(): Promise<StartPhoneOtpResponse>;
  requestPhoneOtp(phone: string): Promise<StartPhoneOtpResponse>;
  requestPasswordRecoveryOtp(phone: string): Promise<StartPhoneOtpResponse>;
  verifyPhoneOtp(challenge: { challengeId: string; phone: string; purpose: 'login' | 'recovery' }, token: string): Promise<AppSession>;
  authorizePasswordRecovery(): Promise<AuthorizePasswordRecoveryResponse>;
  signInWithPhonePassword(phone: string, password: string): Promise<AppSession>;
  updatePassword(password: string, currentPassword?: string, recoveryGrantId?: string): Promise<AppSession>;
  requestPhoneBindingOtp(phone: string): Promise<PhoneBindingChallenge>;
  resendPhoneBindingOtp(challenge: PhoneBindingChallenge): Promise<void>;
  verifyPhoneBindingOtp(challenge: PhoneBindingChallenge, token: string): Promise<PhoneBindingVerification>;
  signInWithInviteCode(inviteCode: string): Promise<AppSession>;
  signOut(scope?: 'local' | 'global' | 'others'): Promise<void>;
  onSessionChange(listener: (session: AppSession | undefined, event: AuthChangeEvent) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
};

function appSession(session: Session | null): AppSession | undefined {
  if (!session) return undefined;
  const providers = new Set<AuthIdentityProvider>();
  if (isChinaMobileE164(session.user.phone)) providers.add('phone');
  for (const identity of session.user.identities ?? []) {
    if (identity.provider === 'phone' || identity.provider === 'apple') providers.add(identity.provider);
  }
  if (
    session.user.app_metadata?.icao_identity_provider === 'wechat'
    && typeof session.user.app_metadata?.icao_wechat_subject === 'string'
  ) providers.add('wechat');
  if (providers.size === 0) return undefined;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: {
      id: session.user.id,
      authUserId: session.user.id,
      phone: session.user.phone,
      displayName: typeof session.user.user_metadata?.display_name === 'string' ? session.user.user_metadata.display_name : undefined,
      hasPassword: session.user.user_metadata?.password_set === true,
      phoneBound: providers.has('phone'),
      providers: [...providers],
      registrationPending: session.user.user_metadata?.registration_pending === true,
    },
  };
}

export const PHONE_PASSWORD_MIN_LENGTH = 10;
export const PHONE_PASSWORD_MAX_LENGTH = 64;

export function isValidPhonePassword(password: string) {
  const length = Array.from(password).length;
  return length >= PHONE_PASSWORD_MIN_LENGTH
    && length <= PHONE_PASSWORD_MAX_LENGTH
    && /[A-Za-z]/u.test(password)
    && /[0-9]/u.test(password);
}

export function authError(error: { message: string; code?: string } | null) {
  if (!error) return new Error('auth_service_unavailable');
  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase();
  if (message.includes('failed to fetch') || message.includes('network request failed') || message.includes('networkerror') || message.includes('network error')) return new Error('auth_network_error');
  if (message.includes('localstorage') || message.includes('storage') || message.includes('quota exceeded')) return new Error('auth_session_storage_unavailable');
  if (code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit' || message.includes('rate limit')) return new Error('phone_otp_rate_limited');
  if (code === 'otp_expired' || message.includes('token has expired') || message.includes('token is invalid') || message.includes('invalid otp')) return new Error('invalid_phone_otp');
  if (code === 'weak_password' || message.includes('weak password') || message.includes('password should be at least')) return new Error('invalid_phone_password');
  if (
    code === 'invalid_credentials'
    || code === 'reauthentication_not_valid'
    || code === 'current_password_invalid'
    || code === 'current_password_mismatch'
    || code === 'current_password_required'
    || message.includes('invalid login credentials')
  ) return new Error('invalid_phone_or_password');
  if (code === 'phone_exists' || code === 'user_already_exists' || code === 'conflict' || message.includes('already registered') || message.includes('already exists')) return new Error('phone_account_already_exists');
  if (code === 'user_not_found' || message.includes('user not found')) return new Error('phone_account_not_found');
  if (code === 'phone_not_confirmed') return new Error('phone_not_confirmed');
  if (code === 'same_password') return new Error('password_unchanged');
  if (code === 'reauthentication_needed') return new Error('phone_reauthentication_required');
  if (code === 'sms_send_failed') return new Error('phone_otp_delivery_failed');
  if (code === 'phone_provider_disabled' || code === 'signup_disabled' || message.includes('phone provider') || message.includes('sms provider') || message.includes('signups not allowed')) return new Error('phone_auth_unavailable');
  if (message.includes('phone') && message.includes('invalid')) return new Error('invalid_phone_number');
  if (code === 'unexpected_failure' || code === 'request_timeout' || code === 'over_request_rate_limit' || message.includes('service unavailable') || message.includes('temporarily unavailable')) return new Error('auth_service_unavailable');
  if (code === 'auth_failed') return new Error('auth_request_not_completed');
  if (code === 'provider_disabled' || message.includes('provider is not enabled')) return new Error('social_auth_unavailable');
  return new Error(code ?? 'auth_failed');
}

export class SupabasePhoneAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw authError(error);
    const session = appSession(data.session);
    if (data.session && !session) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return session;
  }

  async refreshSession() {
    const { data, error } = await this.client.auth.refreshSession();
    if (error) throw authError(error);
    const session = appSession(data.session);
    if (data.session && !session) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return session;
  }

  async isAppleSignInAvailable() {
    return AppleAuthentication.isAvailableAsync();
  }

  async isWechatSignInAvailable() {
    const status = getWechatNativeStatus();
    return status.supported && status.configured;
  }

  async signInWithApple() {
    const credential = await this.appleCredential(true);
    const { data, error } = await this.client.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: credential.rawNonce,
    });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (!session || !session.user.providers.includes('apple')) throw new Error('apple_auth_failed');
    return session;
  }

  async signInWithWechat() {
    return (await this.wechatSession()).session;
  }

  private async wechatSession() {
    const challenge = await apiRequest<StartWechatAuthResponse>('/v1/auth/wechat/challenge', {
      method: 'POST',
    });
    if (challenge.status !== 'available') throw new Error('wechat_auth_configuration_pending');
    const nativeResponse = await authorizeWithWechatNative(challenge.state);
    if (nativeResponse.state !== challenge.state) throw new Error('invalid_wechat_auth_response');
    const response = await apiRequest<CompleteWechatAuthResponse>('/v1/auth/wechat/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        code: nativeResponse.code,
        state: nativeResponse.state,
      }),
    });
    const { data, error } = await this.client.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error) throw authError(error);
    const session = appSession(data.session);
    if (!session?.user.providers.includes('wechat')) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('wechat_auth_failed');
    }
    return { account: response.account, session };
  }

  async authorizeAccountDeletionWithApple() {
    const current = await this.getSession();
    if (!current?.user.providers.includes('apple')) throw new Error('apple_reauthentication_required');
    const credential = await this.appleCredential(false);
    if (!credential.authorizationCode) throw new Error('apple_authorization_code_missing');
    return apiRequest<RecentAuthGrantResponse>('/v1/account/recent-auth/apple', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authorizationCode: credential.authorizationCode,
        purpose: 'account_delete',
        rawNonce: credential.rawNonce,
      }),
    });
  }

  async authorizeAccountDeletionWithWechat(accountId: string) {
    const authenticated = await this.wechatSession();
    if (authenticated.account.accountId !== accountId) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('identity_already_in_use');
    }
    const grant = await apiRequestWithAccessToken<RecentAuthGrantResponse>(
      '/v1/account/recent-auth/wechat',
      authenticated.session.accessToken,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'account_delete' }),
      },
    );
    return { grant, session: authenticated.session };
  }

  async authorizeAccountDeletionWithPassword(password: string) {
    if (!password) throw new Error('account_deletion_password_required');
    return apiRequest<RecentAuthGrantResponse>('/v1/account/recent-auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, purpose: 'account_delete' }),
    });
  }

  async requestAccountDeletionPhoneOtp() {
    const response = await apiRequest<StartPhoneOtpResponse>('/v1/account/recent-auth/phone/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'account_delete' }),
    });
    if (!response.accepted) throw new Error('phone_otp_delivery_failed');
    return response;
  }

  async authorizeAccountDeletionWithPhoneOtp(token: string) {
    if (!/^\d{6}$/u.test(token)) throw new Error('invalid_phone_otp');
    const current = await this.getSession();
    if (!current?.user.phone || !current.user.providers.includes('phone')) {
      throw new Error('phone_reauthentication_required');
    }
    const { data, error } = await this.client.auth.verifyOtp({
      phone: current.user.phone,
      token,
      type: 'sms',
    });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (
      !session
      || session.user.id !== current.user.id
      || session.user.phone !== current.user.phone
      || !session.user.providers.includes('phone')
    ) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('phone_reauthentication_required');
    }
    const grant = await apiRequest<RecentAuthGrantResponse>('/v1/account/recent-auth/phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'account_delete' }),
    });
    return { grant, session };
  }

  private async appleCredential(requestProfile: boolean) {
    if (!await AppleAuthentication.isAvailableAsync()) throw new Error('apple_auth_unavailable');
    const rawNonce = Crypto.randomUUID();
    const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: requestProfile ? [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] : [],
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Error('social_auth_cancelled');
      throw new Error('apple_auth_failed');
    }
    if (!credential.identityToken) throw new Error('apple_identity_token_missing');
    return {
      authorizationCode: credential.authorizationCode,
      identityToken: credential.identityToken,
      rawNonce,
    };
  }

  async requestPhoneOtp(input: string) {
    const phone = normalizeChinaMobile(input);
    if (!phone) throw new Error('invalid_phone_number');
    const response = await apiRequest<StartPhoneOtpResponse>('/v1/auth/phone/otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!response.accepted) throw new Error('phone_auth_unavailable');
    return response;
  }

  async requestPasswordRecoveryOtp(input: string) {
    const phone = normalizeChinaMobile(input);
    if (!phone) throw new Error('invalid_phone_number');
    const response = await apiRequest<StartPhoneOtpResponse>('/v1/auth/phone/recovery/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!response.accepted) throw new Error('phone_auth_unavailable');
    return response;
  }

  async verifyPhoneOtp(challenge: { challengeId: string; phone: string; purpose: 'login' | 'recovery' }, token: string) {
    const phone = normalizeChinaMobile(challenge.phone);
    if (!phone) throw new Error('invalid_phone_number');
    if (!/^\d{6}$/u.test(token)) throw new Error('invalid_phone_otp');
    const response = await apiRequest<VerifyPhoneOtpResponse>('/v1/auth/phone/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        phone,
        purpose: challenge.purpose,
        token,
      }),
    });
    const { data, error } = await this.client.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (!session || session.user.phone !== phone) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('phone_account_required');
    }
    return session;
  }

  async authorizePasswordRecovery() {
    const response = await apiRequest<AuthorizePasswordRecoveryResponse>('/v1/account/password/recovery/authorize', {
      method: 'POST',
    });
    if (!response.authorized || !response.grantId || response.expiresAt <= Date.now()) {
      throw new Error('phone_reauthentication_required');
    }
    return response;
  }

  async signInWithPhonePassword(input: string, password: string) {
    const phone = normalizeChinaMobile(input);
    if (!phone) throw new Error('invalid_phone_number');
    if (!password) throw new Error('invalid_phone_or_password');
    const { data, error } = await this.client.auth.signInWithPassword({ phone, password });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (!session || session.user.phone !== phone) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('phone_account_required');
    }
    return session;
  }

  async updatePassword(password: string, currentPassword?: string, recoveryGrantId?: string) {
    if (!isValidPhonePassword(password)) throw new Error('invalid_phone_password');
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw authError(sessionError);
    const currentSession = appSession(sessionData.session);
    if (!currentSession) {
      if (sessionData.session) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('phone_account_required');
    }
    const response = await apiRequest<UpdatePhonePasswordResponse>('/v1/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password,
        ...(currentPassword === undefined ? {} : { currentPassword }),
        ...(recoveryGrantId === undefined ? {} : { recoveryGrantId }),
      }),
    });
    if (!response.updated) throw new Error('phone_auth_unavailable');
    const { data, error } = await this.client.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error) throw authError(error);
    const refreshed = appSession(data.session);
    if (
      !refreshed
      || refreshed.user.id !== currentSession.user.id
      || refreshed.user.phone !== currentSession.user.phone
      || !isChinaMobileE164(refreshed.user.phone)
    ) {
      await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('phone_account_required');
    }
    return refreshed;
  }

  async requestPhoneBindingOtp(input: string): Promise<PhoneBindingChallenge> {
    const phone = normalizeChinaMobile(input);
    if (!phone) throw new Error('invalid_phone_number');
    const response = await apiRequest<StartPhoneBindingResponse>('/v1/account/phone-binding/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!response.sent) throw new Error('phone_binding_otp_unavailable');
    return { phone };
  }

  async resendPhoneBindingOtp(challenge: PhoneBindingChallenge) {
    const response = await apiRequest<StartPhoneBindingResponse>('/v1/account/phone-binding/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: challenge.phone }),
    });
    if (!response.sent) throw new Error('phone_binding_otp_unavailable');
  }

  async verifyPhoneBindingOtp(challenge: PhoneBindingChallenge, token: string): Promise<PhoneBindingVerification> {
    if (!/^\d{6}$/u.test(token)) throw new Error('invalid_phone_otp');
    const response = await apiRequest<BindPhoneResponse>('/v1/account/phone-binding/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: challenge.phone, token }),
    });
    const { data, error } = await this.client.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (!session || session.user.phone !== challenge.phone) throw new Error('phone_binding_failed');
    return { account: response.account, challenge, session };
  }

  async signInWithInviteCode(_inviteCode: string): Promise<AppSession> {
    throw new Error('invite_login_removed');
  }

  async signOut(scope: 'local' | 'global' | 'others' = 'local') {
    const { error } = await this.client.auth.signOut({ scope });
    if (error) throw authError(error);
  }

  onSessionChange(listener: (session: AppSession | undefined, event: AuthChangeEvent) => void) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => listener(appSession(session), event));
    return () => data.subscription.unsubscribe();
  }

  startAutoRefresh() {
    this.client.auth.startAutoRefresh();
  }

  stopAutoRefresh() {
    this.client.auth.stopAutoRefresh();
  }
}

let singleton: AuthService | undefined;

export function getAuthService() {
  if (singleton) return singleton;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return undefined;
  singleton = new SupabasePhoneAuthService(createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: secureSessionStorage,
    },
  }));
  return singleton;
}

export function resetAuthServiceForTests() {
  singleton = undefined;
}
