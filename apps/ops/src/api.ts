import type { ApiErrorEnvelope, ApiSuccessEnvelope, OpsStaffSession } from '@icao/contracts';

const SESSION_KEY = 'icao-ops-session-v1';
export const OPS_SESSION_EXPIRED = 'icao-ops-session-expired';

export function readSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as OpsStaffSession;
    if (!session?.staff?.id || !session.staff.email || !session.accessToken
      || !Number.isFinite(Date.parse(session.expiresAt)) || new Date(session.expiresAt) <= new Date()) {
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
  const response = await opsResponse(path, options, authenticated);
  const body = await response.json().catch(() => undefined) as ApiSuccessEnvelope<T> | ApiErrorEnvelope | undefined;
  if (!body || 'error' in body || !('data' in body)) throw new Error('invalid_ops_response');
  return body.data;
}

export async function opsResponse(path: string, options: RequestInit = {}, authenticated = true) {
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
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as ApiErrorEnvelope | undefined;
    const code = body && 'error' in body ? body.error.code : 'request_failed';
    if (response.status === 401 && authenticated) {
      clearSession(); window.dispatchEvent(new Event(OPS_SESSION_EXPIRED));
    }
    throw new Error(code);
  }
  return response;
}
