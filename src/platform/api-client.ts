import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@icao/contracts';

let accessTokenProvider: (() => Promise<string | undefined>) | undefined;
let accessTokenRefresher: (() => Promise<string | undefined>) | undefined;
let sessionInvalidatedHandler: (() => Promise<void> | void) | undefined;

export function setApiAccessTokenProvider(provider: (() => Promise<string | undefined>) | undefined) {
  accessTokenProvider = provider;
}

export function setApiAuthRecovery(options?: {
  refresh: () => Promise<string | undefined>;
  onInvalidated: () => Promise<void> | void;
}) {
  accessTokenRefresher = options?.refresh;
  sessionInvalidatedHandler = options?.onInvalidated;
}

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_ICAO_API_URL?.replace(/\/$/, '');
}

async function fetchOnce(path: string, init: RequestInit, token?: string) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch(`${baseUrl}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  let response = await fetchOnce(path, init, await accessTokenProvider?.());
  return recoverApiUnauthorized(response, (token) => fetchOnce(path, init, token));
}

export async function recoverApiUnauthorized(
  response: Response,
  retry: (token: string) => Promise<Response>,
) {
  if (response.status !== 401) return response;
  const refreshed = await accessTokenRefresher?.().catch(() => undefined);
  if (refreshed) response = await retry(refreshed);
  if (response.status === 401) await sessionInvalidatedHandler?.();
  return response;
}

export async function apiAccessToken() {
  return accessTokenProvider?.();
}

export async function invalidateApiSession() {
  await sessionInvalidatedHandler?.();
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init);
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw new Error(code);
  }
  return body.data;
}
