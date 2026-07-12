import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@icao/contracts';

let accessTokenProvider: (() => Promise<string | undefined>) | undefined;

export function setApiAccessTokenProvider(provider: (() => Promise<string | undefined>) | undefined) {
  accessTokenProvider = provider;
}

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_ICAO_API_URL?.replace(/\/$/, '');
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  const token = await accessTokenProvider?.();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${baseUrl}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
