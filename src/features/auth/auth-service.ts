import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiErrorEnvelope, ApiSuccessEnvelope, InviteSessionResponse } from '@icao/contracts';

import { secureSessionStorage } from './secure-session-storage';

export type AppSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken: string;
  user: { id: string; displayName?: string };
};

export type AuthService = {
  getSession(): Promise<AppSession | undefined>;
  refreshSession(): Promise<AppSession | undefined>;
  signInWithInviteCode(inviteCode: string): Promise<AppSession>;
  signOut(scope?: 'local' | 'global' | 'others'): Promise<void>;
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
    user: {
      id: session.user.id,
      displayName: typeof session.user.user_metadata?.display_name === 'string' ? session.user.user_metadata.display_name : undefined,
    },
  };
}

export function authError(error: { message: string; code?: string } | null) {
  if (!error) return new Error('auth_service_unavailable');
  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase();
  if (message.includes('invalid login')) return new Error('invalid_invite_code');
  if (message.includes('failed to fetch') || message.includes('network request failed') || message.includes('networkerror') || message.includes('network error')) return new Error('auth_network_error');
  if (message.includes('localstorage') || message.includes('storage') || message.includes('quota exceeded')) return new Error('auth_session_storage_unavailable');
  if (code === 'unexpected_failure' || code === 'request_timeout' || code === 'over_request_rate_limit' || message.includes('service unavailable') || message.includes('temporarily unavailable')) return new Error('auth_service_unavailable');
  if (code === 'auth_failed') return new Error('auth_request_not_completed');
  return new Error(code ?? 'auth_failed');
}

class SupabaseInviteAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient, private readonly apiUrl: string) {}

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

  async signInWithInviteCode(inviteCode: string) {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/v1/auth/invite/session`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
    } catch {
      throw new Error('auth_network_error');
    }
    const body = await response.json().catch(() => undefined) as ApiSuccessEnvelope<InviteSessionResponse> | ApiErrorEnvelope | undefined;
    if (!response.ok || !body || 'error' in body) {
      throw new Error(body && 'error' in body ? body.error.code : 'auth_service_unavailable');
    }
    const { data, error } = await this.client.auth.setSession({ access_token: body.data.accessToken, refresh_token: body.data.refreshToken });
    if (error || !data.session) throw authError(error);
    const session = appSession(data.session);
    if (!session) throw new Error('auth_failed');
    return { ...session, user: { ...session.user, displayName: body.data.user.displayName } };
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
  const apiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL?.replace(/\/$/, '');
  if (!url || !publishableKey || !apiUrl) return undefined;
  singleton = new SupabaseInviteAuthService(createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: secureSessionStorage,
    },
  }), apiUrl);
  return singleton;
}

export function resetAuthServiceForTests() {
  singleton = undefined;
}
