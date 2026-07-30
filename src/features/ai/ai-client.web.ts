import type {
  AiConsent,
  GrammarReviewRequest,
  GrammarReviewResult,
  PolishRequest,
  PolishResult,
  TranscribeResult,
} from '@icao/contracts';

import Storage from '@/platform/storage';
import { apiRequest } from '@/platform/api-client';

const POLICY_VERSION = 'ai-learning-privacy-v1';
const CONSENT_KEY = `icao.ai.consent.${POLICY_VERSION}`;
const MAXIMUM_TRANSCRIPTION_BYTES = 3_000_000;

export async function hasAiConsent() {
  return (await Storage.getItem(CONSENT_KEY)) === 'accepted';
}

export async function acceptAiConsent() {
  const consent = await apiRequest<AiConsent>('/v1/ai/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accepted: true, policyVersion: POLICY_VERSION }),
  });
  await Storage.setItem(CONSENT_KEY, 'accepted');
  return consent;
}

export async function withdrawAiConsent() {
  await apiRequest<{ revoked: true }>('/v1/ai/consent', { method: 'DELETE' });
  await Storage.removeItem(CONSENT_KEY);
}

function audioDataUrl(audio: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('recording_read_failed'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('recording_read_failed'));
    reader.readAsDataURL(audio);
  });
}

export async function transcribeRecording(uri: string, signal?: AbortSignal) {
  const response = await fetch(uri, { signal });
  if (!response.ok) throw new Error('recording_asset_missing');
  const audio = await response.blob();
  if (!audio.size || audio.size > MAXIMUM_TRANSCRIPTION_BYTES) throw new Error('recording_too_large_for_web');
  return apiRequest<TranscribeResult>('/v1/ai/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl: await audioDataUrl(audio) }),
    signal,
  });
}

export function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal) {
  return apiRequest<GrammarReviewResult>('/v1/ai/grammar-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
}

export function polishExpression(input: PolishRequest, signal?: AbortSignal) {
  return apiRequest<PolishResult>('/v1/ai/polish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
}
