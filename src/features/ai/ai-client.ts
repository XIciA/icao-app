import type { AiConsent, GrammarReviewRequest, GrammarReviewResult, OpiAnalysisResult, PolishRequest, PolishResult, TranscribeResult, WordLookupRequest, WordLookupResult } from '@icao/contracts';
import Storage from 'expo-sqlite/kv-store';

import { apiAccessToken, apiRequest, getApiBaseUrl, recoverApiUnauthorized } from '@/platform/api-client';

const POLICY_VERSION = 'ai-learning-privacy-v1';
const CONSENT_KEY = `icao.ai.consent.${POLICY_VERSION}`;
const lookupCache = new Map<string, WordLookupResult>();

export async function hasAiConsent() {
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

export async function wordLookup(input: WordLookupRequest) {
  const key = JSON.stringify([input.module, input.word.toLocaleLowerCase(), input.sentence.replace(/\s+/g, ' ').trim()]);
  const cached = lookupCache.get(key);
  if (cached) return { ...cached, cached: true };
  const result = await apiRequest<WordLookupResult>('/v1/ai/word-lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  lookupCache.set(key, result);
  return result;
}

export async function transcribeRecording(uri: string, signal?: AbortSignal) {
  const [{ File }, { fetch: expoFetch }] = await Promise.all([import('expo-file-system'), import('expo/fetch')]);
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  const token = await apiAccessToken();
  if (!token) throw new Error('missing_bearer_token');
  const file = new File(uri);
  const form = new FormData();
  form.append('audio', file);
  const send = (accessToken: string) => expoFetch(`${baseUrl}/v1/ai/transcribe`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
    body: form,
    signal,
  }) as Promise<Response>;
  const response = await recoverApiUnauthorized(await send(token), send);
  const payload = await response.json() as { data?: TranscribeResult; error?: { code?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.code ?? `api_http_${response.status}`);
  return payload.data;
}

export function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal) {
  return apiRequest<GrammarReviewResult>('/v1/ai/grammar-review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
}

export function opiAnalysis(input: GrammarReviewRequest) {
  return apiRequest<OpiAnalysisResult>('/v1/ai/opi-analysis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

export function polishExpression(input: PolishRequest, signal?: AbortSignal) {
  return apiRequest<PolishResult>('/v1/ai/polish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
}
