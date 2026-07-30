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

const service: AuthService = {
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

export function getAuthService() {
  return service;
}

export function resetAuthServiceForTests() {
  current = undefined;
  listeners.clear();
}
