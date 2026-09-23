import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@icao/contracts';

let accessTokenProvider: (() => Promise<string | undefined>) | undefined;
let accessTokenRefresher: (() => Promise<string | undefined>) | undefined;
let sessionInvalidatedHandler: ((rejectedToken: string) => Promise<void> | void) | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;
let invalidationInFlight: { promise: Promise<void>; token: string } | undefined;
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
  onInvalidated: (rejectedToken: string) => Promise<void> | void;
}) {
  accessTokenRefresher = options?.refresh;
  sessionInvalidatedHandler = options?.onInvalidated;
  refreshInFlight = undefined;
  invalidationInFlight = undefined;
}

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_ICAO_API_URL?.replace(/\/$/, '');
}

export async function withApiRequestTimeout<T>(
  action: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal | null,
  timeoutMilliseconds = 45_000,
) {
  const controller = new AbortController();
  let abortSource: 'external' | 'timeout' | undefined;
  const abort = (source: 'external' | 'timeout') => {
    if (abortSource) return;
    abortSource = source;
    controller.abort();
  };
  const forwardExternalAbort = () => abort('external');
  const timeout = setTimeout(() => abort('timeout'), timeoutMilliseconds);
  if (externalSignal?.aborted) forwardExternalAbort();
  else externalSignal?.addEventListener('abort', forwardExternalAbort, { once: true });
  try {
    try {
      return await action(controller.signal);
    } catch (error) {
      if (abortSource === 'timeout') {
        throw new ApiClientError('ai_timeout', 408);
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardExternalAbort);
  }
}

async function fetchOnce(path: string, init: RequestInit, token?: string, timeoutMs?: number) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return withApiRequestTimeout(
    (signal) => fetch(`${baseUrl}${path}`, { ...init, headers, signal }),
    init.signal, timeoutMs,
  );
}

export async function apiFetch(path: string, init: RequestInit = {}, timeoutMs?: number) {
  const token = await accessTokenProvider?.();
  const response = await fetchOnce(path, init, token, timeoutMs);
  return recoverApiUnauthorized(response, (nextToken) => fetchOnce(path, init, nextToken, timeoutMs), token);
}

export async function recoverApiUnauthorized(
  response: Response,
  retry: (token: string) => Promise<Response>,
  requestToken?: string,
) {
  if (response.status !== 401) return response;

  let rejectedToken = requestToken;
  const currentBeforeRefresh = await accessTokenProvider?.().catch(() => undefined);
  if (currentBeforeRefresh && currentBeforeRefresh !== rejectedToken) {
    response = await retry(currentBeforeRefresh);
    rejectedToken = currentBeforeRefresh;
    if (response.status !== 401) return response;
  }

  if (!refreshInFlight && accessTokenRefresher) {
    let refresh!: Promise<string | undefined>;
    refresh = accessTokenRefresher().catch(() => undefined).finally(() => {
      if (refreshInFlight === refresh) refreshInFlight = undefined;
    });
    refreshInFlight = refresh;
  }
  const refreshed = await refreshInFlight;
  if (refreshed) {
    response = await retry(refreshed);
    rejectedToken = refreshed;
    if (response.status !== 401) return response;
  }

  const currentAfterRefresh = await accessTokenProvider?.().catch(() => undefined);
  if (currentAfterRefresh && currentAfterRefresh !== rejectedToken) {
    response = await retry(currentAfterRefresh);
    rejectedToken = currentAfterRefresh;
    if (response.status !== 401) return response;
  }

  // Only the token that was actually rejected may invalidate the matching
  // current session. A late 401 from an older request must never sign out a
  // newly established or refreshed login.
  if (response.status === 401 && rejectedToken && currentAfterRefresh === rejectedToken) {
    if (!invalidationInFlight || invalidationInFlight.token !== rejectedToken) {
      let invalidation!: Promise<void>;
      invalidation = Promise.resolve(sessionInvalidatedHandler?.(rejectedToken)).finally(() => {
        if (invalidationInFlight?.promise === invalidation) invalidationInFlight = undefined;
      });
      invalidationInFlight = { promise: invalidation, token: rejectedToken };
    }
    await invalidationInFlight.promise;
  }
  return response;
}

export async function apiAccessToken() {
  return accessTokenProvider?.();
}

export async function invalidateApiSession() {
  const token = await accessTokenProvider?.();
  if (token) await sessionInvalidatedHandler?.(token);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, timeoutMs?: number) {
  if (
    __DEV__
    && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1'
    && path === '/v1/ai/consent/challenge'
  ) {
    return {
      challenge: 'audio-e2e-explicit-consent-challenge',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    } as T;
  }
  if (
    __DEV__
    && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1'
    && path === '/v1/ai/consent'
  ) {
    return {
      acceptedAt: new Date().toISOString(),
      policyVersion: 'ai-learning-privacy-v4',
    } as T;
  }
  const response = await apiFetch(path, init, timeoutMs);
  const body = await response.json().catch(() => undefined) as ApiSuccessEnvelope<T> | ApiErrorEnvelope | undefined;
  if (!body) throw rememberApiError(`api_http_${response.status}`, response.status);
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw rememberApiError(code, response.status, body.requestId);
  }
  return body.data;
}

export async function apiRequestWithAccessToken<T>(path: string, accessToken: string, init: RequestInit = {}) {
  if (!accessToken) throw new Error('auth_request_not_completed');
  const response = await fetchOnce(path, init, accessToken);
  const body = await response.json().catch(() => undefined) as ApiSuccessEnvelope<T> | ApiErrorEnvelope | undefined;
  if (!body) throw rememberApiError(`api_http_${response.status}`, response.status);
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw rememberApiError(code, response.status, body.requestId);
  }
  return body.data;
}
