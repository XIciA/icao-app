import type {
  AiConsent,
  AiReviewRequest,
  AiReviewResult,
  GrammarReviewRequest,
  GrammarReviewResult,
  PolishRequest,
  PolishResult,
  TranscribeResult,
} from '@icao/contracts';

import Storage from '@/platform/storage';
import { apiRequest } from '@/platform/api-client';
import { toAiOperationFailure } from './ai-operation-failure';

const POLICY_VERSION = 'ai-learning-privacy-v4';
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
  try {
    const response = await fetch(uri, { signal });
    if (!response.ok) throw new Error('recording_asset_missing');
    const audio = await response.blob();
    if (!audio.size || audio.size > MAXIMUM_TRANSCRIPTION_BYTES) throw new Error('recording_too_large_for_web');
    return await apiRequest<TranscribeResult>('/v1/ai/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: await audioDataUrl(audio) }),
      signal,
    });
  } catch (error) {
    throw toAiOperationFailure(error, 'transcribe', 'upload');
  }
}

export async function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal) {
  try {
    return await apiRequest<GrammarReviewResult>('/v1/ai/grammar-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    throw toAiOperationFailure(error, 'grammar');
  }
}

export async function polishExpression(input: PolishRequest, signal?: AbortSignal) {
  try {
    return await apiRequest<PolishResult>('/v1/ai/polish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    throw toAiOperationFailure(error, 'polish');
  }
}

export async function reviewExpression(input: AiReviewRequest, signal?: AbortSignal): Promise<AiReviewResult> {
  const capability = input.mode === 'opi' ? 'polish' : 'grammar';
  try {
    const legacyInput = {
      module: input.module,
      questionId: input.questionId,
      questionText: '',
      transcript: input.transcript,
    } as const;
    const grammar = await grammarReview(legacyInput, signal);
    const polished = input.mode === 'opi'
      ? await polishExpression({ ...legacyInput, module: 'opi', correctedText: grammar.correctedText }, signal)
      : undefined;
    return {
      grammar: {
        correctedText: grammar.correctedText,
        issues: grammar.issues.map((issue) => ({ before: issue, after: issue, reasonZh: '' })),
      },
      ...(polished ? { polishedText: polished.polishedText } : {}),
      promptVersion: 'deepseek-review:v1',
    };
  } catch (error) {
    throw toAiOperationFailure(error, capability);
  }
}
