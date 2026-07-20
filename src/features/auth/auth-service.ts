import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { secureSessionStorage } from './secure-session-storage';

export type AppSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken: string;
  user: { id: string; email?: string };
};

export type AuthService = {
  getSession(): Promise<AppSession | undefined>;
  refreshSession(): Promise<AppSession | undefined>;
  signInWithEmail(email: string, password: string): Promise<AppSession>;
  signUpWithEmail(email: string, password: string): Promise<AppSession>;
  changePassword(email: string, currentPassword: string, newPassword: string): Promise<AppSession>;
  requestEmailChange(email: string, currentPassword: string, newEmail: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  exchangeEmailCode(code: string): Promise<AppSession>;
  setRecoveryPassword(password: string): Promise<AppSession>;
  signOut(scope?: 'local' | 'global' | 'others'): Promise<void>;
  onSessionChange(listener: (session: AppSession | undefined) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
};

export function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 64 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function emailRedirect(flow: 'email-change' | 'recovery') {
  return Linking.createURL('auth/callback', { queryParams: { flow } });
}

function appSession(session: Session | null): AppSession | undefined {
  if (!session) return undefined;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: { id: session.user.id, email: session.user.email },
  };
}

export function authError(error: { message: string; code?: string } | null) {
  if (!error) return new Error('auth_service_unavailable');
  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase();
  if (message.includes('invalid login')) return new Error('invalid_email_or_password');
  if (message.includes('already registered') || message.includes('already exists')) return new Error('email_already_registered');
  if (message.includes('failed to fetch') || message.includes('network request failed') || message.includes('networkerror') || message.includes('network error')) return new Error('auth_network_error');
  if (message.includes('localstorage') || message.includes('storage') || message.includes('quota exceeded')) return new Error('auth_session_storage_unavailable');
  if (code === 'unexpected_failure' || code === 'request_timeout' || code === 'over_request_rate_limit' || message.includes('service unavailable') || message.includes('temporarily unavailable')) return new Error('auth_service_unavailable');
  if (code === 'auth_failed') return new Error('auth_request_not_completed');
  if (message.includes('password')) return new Error('weak_password');
  return new Error(code ?? 'auth_failed');
}

class SupabaseEmailAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw authError(error);
    return appSession(data.session);
  }

  async refreshSession() {
    const { data, error } = await this.client.auth.refreshSession();
    if (error) throw authError(error);
    return appSession(data.session);
  }

  async signInWithEmail(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) throw authError(error);
    return appSession(data.session)!;
  }

  async signUpWithEmail(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) throw authError(error ?? { message: 'email_confirmation_required' });
    return appSession(data.session)!;
  }


  async changePassword(email: string, currentPassword: string, newPassword: string) {
    const signedIn = await this.signInWithEmail(email, currentPassword);
    const { data, error } = await this.client.auth.updateUser({ password: newPassword });
    if (error || !data.user) throw authError(error);
    return (await this.getSession()) ?? signedIn;
  }

  async requestEmailChange(email: string, currentPassword: string, newEmail: string) {
    await this.signInWithEmail(email, currentPassword);
    const { error } = await this.client.auth.updateUser(
      { email: newEmail.trim().toLowerCase() },
      { emailRedirectTo: emailRedirect('email-change') },
    );
    if (error) throw authError(error);
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: emailRedirect('recovery'),
    });
    if (error) throw authError(error);
  }

  async exchangeEmailCode(code: string) {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw authError(error);
    return appSession(data.session)!;
  }

  async setRecoveryPassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw authError(error);
    const session = await this.getSession();
    if (!session) throw new Error('auth_failed');
    return session;
  }

  async signOut(scope: 'local' | 'global' | 'others' = 'local') {
    const { error } = await this.client.auth.signOut({ scope });
    if (error) throw authError(error);
  }

  onSessionChange(listener: (session: AppSession | undefined) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(appSession(session)));
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
  singleton = new SupabaseEmailAuthService(createClient(url, publishableKey, {
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
