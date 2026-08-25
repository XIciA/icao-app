import type { ApiErrorEnvelope, ApiSuccessEnvelope, OpsStaffSession } from '@icao/contracts';

const SESSION_KEY = 'icao-ops-session-v1';

export function readSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as OpsStaffSession;
    if (new Date(session.expiresAt) <= new Date()) {
      clearSession();
      return undefined;
    }
    return session;
  } catch {
    clearSession();
    return undefined;
  }
}

export function writeSession(session: OpsStaffSession) {
  clearSession();
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function opsApi<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const session = readSession();
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(authenticated && session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : 'request_failed';
    if (response.status === 401 && authenticated) clearSession();
    throw new Error(code);
  }
  return body.data;
}
