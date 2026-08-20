import { isEdgeOneProductionWeb } from '@/config/web-runtime';

export type AppSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken: string;
  user: { id: string; displayName?: string };
};

export type AuthService = {
  mode: 'invite' | 'phone-otp';
  getSession(): Promise<AppSession | undefined>;
  refreshSession(): Promise<AppSession | undefined>;
  signInWithInviteCode(inviteCode: string): Promise<AppSession>;
  requestPhoneOtp(phone: string): Promise<void>;
  verifyPhoneOtp(phone: string, token: string): Promise<AppSession>;
  signOut(scope?: 'local' | 'global' | 'others'): Promise<void>;
  onSessionChange(listener: (session: AppSession | undefined) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
};

let current: AppSession | undefined;
const listeners = new Set<(session: AppSession | undefined) => void>();

async function requestSession(init?: RequestInit) {
  const response = await fetch('/api/session', {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => undefined) as
    | { data?: AppSession; error?: { code?: string } }
    | undefined;
  if (!response.ok || !body?.data) {
    if (response.status === 401 && !init) return undefined;
    throw new Error(body?.error?.code ?? 'auth_service_unavailable');
  }
  return body.data;
}

const legacyService: AuthService = {
  mode: 'invite',
  async getSession() {
    current = await requestSession();
    return current;
  },
  async refreshSession() {
    current = await requestSession();
    return current;
  },
  async signInWithInviteCode(inviteCode) {
    current = await requestSession({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    });
    if (!current) throw new Error('auth_failed');
    listeners.forEach((listener) => listener(current));
    return current;
  },
  async requestPhoneOtp() {
    throw new Error('auth_method_unavailable');
  },
  async verifyPhoneOtp() {
    throw new Error('auth_method_unavailable');
  },
  async signOut() {
    await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
    current = undefined;
    listeners.forEach((listener) => listener(undefined));
  },
  onSessionChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  startAutoRefresh() {},
  stopAutoRefresh() {},
};

type SupabaseSessionResponse = {
  access_token: string;
  expires_at?: number;
  expires_in?: number;
  refresh_token: string;
  user: { id: string; user_metadata?: { display_name?: unknown } };
};

function appSession(session: SupabaseSessionResponse | null): AppSession | undefined {
  if (!session) return undefined;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1_000) + session.expires_in : undefined),
    user: {
      id: session.user.id,
      displayName: typeof session.user.user_metadata?.display_name === 'string'
        ? session.user.user_metadata.display_name
        : undefined,
    },
  };
}

export function normalizeChinaMobile(value: string) {
  const digits = value.replace(/\D/gu, '');
  const local = digits.startsWith('0086')
    ? digits.slice(4)
    : digits.startsWith('86') && digits.length === 13
      ? digits.slice(2)
      : digits;
  if (!/^1[3-9]\d{9}$/u.test(local)) throw new Error('invalid_phone_number');
  return `+86${local}`;
}

function phoneAuthError(error: { message: string; code?: string } | null) {
  if (!error) return new Error('auth_service_unavailable');
  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase();
  if (message.includes('failed to fetch') || message.includes('network')) return new Error('auth_network_error');
  if (message.includes('localstorage') || message.includes('storage') || message.includes('quota')) return new Error('auth_session_storage_unavailable');
  if (code?.includes('rate_limit') || message.includes('rate limit') || message.includes('too many')) return new Error('otp_rate_limited');
  if (code === 'otp_expired' || message.includes('expired') || message.includes('invalid token') || message.includes('token has expired')) {
    return new Error('invalid_phone_otp');
  }
  if (code === 'validation_failed' || message.includes('phone number')) return new Error('invalid_phone_number');
  return new Error(code ?? 'auth_failed');
}

class SupabasePhoneAuthService implements AuthService {
  readonly mode = 'phone-otp' as const;
  private current: AppSession | undefined;
  private readonly listeners = new Set<(session: AppSession | undefined) => void>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly url: string, private readonly publishableKey: string) {}

  private readStoredSession() {
    try {
      const raw = globalThis.localStorage?.getItem('icao.auth.web.supabase.v1');
      if (!raw) return undefined;
      const value = JSON.parse(raw) as AppSession;
      return value?.accessToken && value.refreshToken && value.user?.id ? value : undefined;
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
  }

  private storeSession(session: AppSession | undefined) {
    try {
      if (session) globalThis.localStorage?.setItem('icao.auth.web.supabase.v1', JSON.stringify(session));
      else globalThis.localStorage?.removeItem('icao.auth.web.supabase.v1');
    } catch {
      throw new Error('auth_session_storage_unavailable');
    }
    this.current = session;
    this.scheduleRefresh();
  }

  private emit(session: AppSession | undefined) {
    this.listeners.forEach((listener) => listener(session));
  }

  private async request(path: string, init: RequestInit, accessToken?: string) {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('apikey', this.publishableKey);
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    let response: Response;
    try {
      response = await fetch(`${this.url}${path}`, { ...init, headers });
    } catch {
      throw new Error('auth_network_error');
    }
    const body = await response.json().catch(() => undefined) as
      | SupabaseSessionResponse
      | { code?: string; error_code?: string; message?: string }
      | undefined;
    if (!response.ok) {
      const errorBody = body as { code?: string; error_code?: string; message?: string } | undefined;
      throw phoneAuthError({
        code: errorBody?.error_code ?? errorBody?.code,
        message: errorBody?.message ?? `auth_http_${response.status}`,
      });
    }
    return body;
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const expiresAt = this.current?.expiresAt;
    if (!expiresAt) return;
    const delay = Math.max(5_000, expiresAt * 1_000 - Date.now() - 60_000);
    this.refreshTimer = setTimeout(() => {
      void this.refreshSession().catch(() => undefined);
    }, delay);
  }

  async getSession() {
    this.current ??= this.readStoredSession();
    if (this.current?.expiresAt && this.current.expiresAt * 1_000 <= Date.now() + 30_000) {
      return this.refreshSession();
    }
    return this.current;
  }

  async refreshSession() {
    this.current ??= this.readStoredSession();
    if (!this.current?.refreshToken) return undefined;
    const body = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.current.refreshToken }),
    }) as SupabaseSessionResponse;
    const session = appSession(body);
    this.storeSession(session);
    this.emit(session);
    return session;
  }

  async signInWithInviteCode(_inviteCode: string): Promise<AppSession> {
    throw new Error('auth_method_unavailable');
  }

  async requestPhoneOtp(phone: string) {
    await this.request('/auth/v1/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: normalizeChinaMobile(phone), create_user: true }),
    });
  }

  async verifyPhoneOtp(phone: string, token: string) {
    if (!/^\d{6}$/u.test(token)) throw new Error('invalid_phone_otp');
    const body = await this.request('/auth/v1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: normalizeChinaMobile(phone), token, type: 'sms' }),
    });
    const session = appSession(body as SupabaseSessionResponse);
    if (!session) throw new Error('auth_failed');
    this.storeSession(session);
    this.emit(session);
    return session;
  }

  async signOut(scope: 'local' | 'global' | 'others' = 'local') {
    this.current ??= this.readStoredSession();
    if (scope !== 'local' && this.current?.accessToken) {
      await this.request(`/auth/v1/logout?scope=${encodeURIComponent(scope)}`, { method: 'POST' }, this.current.accessToken);
    }
    this.storeSession(undefined);
    this.emit(undefined);
  }

  onSessionChange(listener: (session: AppSession | undefined) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  startAutoRefresh() {
    this.scheduleRefresh();
  }

  stopAutoRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }
}

let phoneService: AuthService | undefined;

export function getAuthService() {
  if (!isEdgeOneProductionWeb()) return legacyService;
  if (phoneService) return phoneService;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return undefined;
  phoneService = new SupabasePhoneAuthService(url.replace(/\/$/u, ''), publishableKey);
  return phoneService;
}

export function resetAuthServiceForTests() {
  current = undefined;
  listeners.clear();
  phoneService = undefined;
}
