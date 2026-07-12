import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { secureSessionStorage } from './secure-session-storage';

export type AppSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken: string;
  user: { id: string; email?: string };
};

export type AuthService = {
  getSession(): Promise<AppSession | undefined>;
  signInWithEmail(email: string, password: string): Promise<AppSession>;
  signUpWithEmail(email: string, password: string): Promise<AppSession>;
  signOut(): Promise<void>;
  onSessionChange(listener: (session: AppSession | undefined) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
};

function appSession(session: Session | null): AppSession | undefined {
  if (!session) return undefined;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: { id: session.user.id, email: session.user.email },
  };
}

function authError(error: { message: string; code?: string } | null) {
  if (!error) return new Error('auth_failed');
  const message = error.message.toLowerCase();
  if (message.includes('invalid login')) return new Error('invalid_email_or_password');
  if (message.includes('already registered') || message.includes('already exists')) return new Error('email_already_registered');
  if (message.includes('password')) return new Error('weak_password');
  return new Error(error.code ?? 'auth_failed');
}

class SupabaseEmailAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
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

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
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
      persistSession: true,
      storage: secureSessionStorage,
    },
  }));
  return singleton;
}

export function resetAuthServiceForTests() {
  singleton = undefined;
}
