import type { AiConsent, GrammarReviewRequest, GrammarReviewResult, PolishRequest, PolishResult, TranscribeResult } from '@icao/contracts';
import Storage from '@/platform/storage';

import { apiAccessToken, apiRequest, getApiBaseUrl, recoverApiUnauthorized, rememberApiError } from '@/platform/api-client';
import { createAudioUploadForm } from '@/platform/audio-upload';

const POLICY_VERSION = 'ai-learning-privacy-v1';
const CONSENT_KEY = `icao.ai.consent.${POLICY_VERSION}`;
const AUDIO_E2E_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1';

export async function hasAiConsent() {
  if (AUDIO_E2E_ENABLED) return true;
  return (await Storage.getItem(CONSENT_KEY)) === 'accepted';
}

export async function acceptAiConsent() {
  const consent = await apiRequest<AiConsent>('/v1/ai/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: true, policyVersion: POLICY_VERSION }),
  });
  await Storage.setItem(CONSENT_KEY, 'accepted');
  return consent;
}

export async function withdrawAiConsent() {
  await apiRequest<{ revoked: true }>('/v1/ai/consent', { method: 'DELETE' });
  await Storage.removeItem(CONSENT_KEY);
}

export async function transcribeRecording(uri: string, signal?: AbortSignal) {
  if (AUDIO_E2E_ENABLED) {
    if (signal?.aborted) throw new Error('request_aborted');
    return {
      transcript: 'Audio lifecycle test transcript.',
    } satisfies TranscribeResult;
  }
  const { fetch: audioFetch, form } = await createAudioUploadForm(uri);
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  const token = await apiAccessToken();
  if (!token) throw new Error('missing_bearer_token');
  const send = (accessToken: string) => audioFetch(`${baseUrl}/v1/ai/transcribe`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
    body: form,
    signal,
  }) as Promise<Response>;
  const response = await recoverApiUnauthorized(await send(token), send);
  const payload = await response.json() as { requestId?: string; data?: TranscribeResult; error?: { code?: string } };
  if (!response.ok || !payload.data) {
    throw rememberApiError(payload.error?.code ?? `api_http_${response.status}`, response.status, payload.requestId);
  }
  return payload.data;
}

export function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal) {
  return apiRequest<GrammarReviewResult>('/v1/ai/grammar-review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
}

export function polishExpression(input: PolishRequest, signal?: AbortSignal) {
  return apiRequest<PolishResult>('/v1/ai/polish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
}
