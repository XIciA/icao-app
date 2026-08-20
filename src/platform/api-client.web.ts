import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@icao/contracts';

import { isEdgeOneProductionWeb } from '@/config/web-runtime';

let accessTokenProvider: (() => Promise<string | undefined>) | undefined;
let accessTokenRefresher: (() => Promise<string | undefined>) | undefined;
let sessionInvalidatedHandler: (() => Promise<void> | void) | undefined;
let recentApiError: { code: string; requestId?: string; occurredAt: number } | undefined;

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(code);
    this.name = 'ApiClientError';
  }
}

export function rememberApiError(code: string, status: number, requestId?: string) {
  recentApiError = { code, requestId, occurredAt: Date.now() };
  return new ApiClientError(code, status, requestId);
}

export function getRecentApiError(maxAgeMilliseconds = 10 * 60 * 1_000) {
  if (!recentApiError || Date.now() - recentApiError.occurredAt > maxAgeMilliseconds) return undefined;
  return { code: recentApiError.code, requestId: recentApiError.requestId };
}

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
  if (isEdgeOneProductionWeb()) return process.env.EXPO_PUBLIC_ICAO_API_URL?.replace(/\/$/u, '');
  return '/api';
}

function route(path: string) {
  const routes: Record<string, string> = {
    '/v1/ai/consent': '/api/ai/consent',
    '/v1/ai/word-lookup': '/api/ai/word-lookup',
    '/v1/ai/grammar-review': '/api/ai/grammar-review',
    '/v1/ai/polish': '/api/ai/polish',
    '/v1/ai/transcribe': '/api/ai/transcribe',
  };
  return routes[path] ?? `/api/unavailable?path=${encodeURIComponent(path)}`;
}

async function fetchOnce(path: string, init: RequestInit, token?: string) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (isEdgeOneProductionWeb() && token) headers.set('authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error('api_not_configured');
    return await fetch(isEdgeOneProductionWeb() ? `${baseUrl}${path}` : route(path), {
      ...init,
      credentials: isEdgeOneProductionWeb() ? 'omit' : 'include',
      headers,
      signal: init.signal ?? controller.signal,
    });
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
  const body = await response.json().catch(() => undefined) as ApiSuccessEnvelope<T> | ApiErrorEnvelope | undefined;
  if (!body) throw rememberApiError(`api_http_${response.status}`, response.status);
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw rememberApiError(code, response.status, body.requestId);
  }
  return body.data;
}
