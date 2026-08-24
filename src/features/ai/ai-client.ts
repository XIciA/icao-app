import { CURRENT_AI_CONSENT_POLICY_VERSION, type AiConsent, type AiConsentStatus, type AiReviewRequest, type AiReviewResult, type GrammarReviewRequest, type GrammarReviewResult, type PolishRequest, type PolishResult, type TranscribeResult } from '@icao/contracts';
import Constants from 'expo-constants';
import Storage from '@/platform/storage';

import {
  apiAccessToken,
  apiRequest,
  getApiBaseUrl,
  recoverApiUnauthorized,
  rememberApiError,
  withApiRequestTimeout,
} from '@/platform/api-client';
import { createAudioUploadForm } from '@/platform/audio-upload';
import { toAiOperationFailure } from './ai-operation-failure';
import { getAsrModel } from './asr-model-preference';

const CONSENT_KEY = `icao.ai.consent.${CURRENT_AI_CONSENT_POLICY_VERSION}`;
const AUDIO_E2E_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1';

function audioE2EProbeBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return /^https?:\/\//u.test(hostUri) ? hostUri : `http://${hostUri}`;
  return getApiBaseUrl();
}

function consentRequired(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ai_consent_required');
}

async function invalidateRejectedConsent(error: unknown) {
  if (consentRequired(error)) await clearLocalAiConsent().catch(() => undefined);
}

export async function hasAiConsent() {
  if (AUDIO_E2E_ENABLED) return true;
  const status = await apiRequest<AiConsentStatus>('/v1/ai/consent');
  const accepted = status.accepted && status.policyVersion === CURRENT_AI_CONSENT_POLICY_VERSION;
  if (accepted) await Storage.setItem(CONSENT_KEY, 'accepted').catch(() => undefined);
  else await clearLocalAiConsent().catch(() => undefined);
  return accepted;
}

export async function getCachedAiConsentHint() {
  return Storage.getItem(CONSENT_KEY).then((value) => value === 'accepted').catch(() => false);
}

export async function acceptAiConsent() {
  const consent = await apiRequest<AiConsent>('/v1/ai/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: true, policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION }),
  });
  await Storage.setItem(CONSENT_KEY, 'accepted').catch(() => undefined);
  return consent;
}

export async function withdrawAiConsent() {
  await apiRequest<{ revoked: true }>('/v1/ai/consent', { method: 'DELETE' });
  await clearLocalAiConsent().catch(() => undefined);
}

export async function clearLocalAiConsent() {
  await Storage.removeItem(CONSENT_KEY);
}

export async function transcribeRecording(uri: string, signal?: AbortSignal) {
  if (AUDIO_E2E_ENABLED) {
    if (signal?.aborted) throw new Error('request_aborted');
    const baseUrl = audioE2EProbeBaseUrl();
    if (!baseUrl) throw new Error('api_not_configured');
    const health = await withApiRequestTimeout(
      (requestSignal) => fetch(`${baseUrl}/status`, { signal: requestSignal }),
      signal,
    );
    if (!health.ok || (await health.text()).trim() !== 'packager-status:running') {
      throw new Error('audio_e2e_api_unready');
    }
    return {
      transcript: 'Audio lifecycle test transcript.',
    } satisfies TranscribeResult;
  }
  try {
    return await (async () => {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) throw new Error('api_not_configured');
      const token = await apiAccessToken();
      if (!token) throw new Error('missing_bearer_token');
      let audioUpload: Awaited<ReturnType<typeof createAudioUploadForm>>;
      try {
        audioUpload = await createAudioUploadForm(uri, await getAsrModel());
      } catch (error) {
        throw toAiOperationFailure(error, 'transcribe', 'upload');
      }
      const send = async (accessToken: string) => {
        const upload = await createAudioUploadForm(uri, await getAsrModel());
        return withApiRequestTimeout((requestSignal) => upload.fetch(`${baseUrl}/v1/ai/transcribe`, {
          method: 'POST',
          headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
          body: upload.form,
          signal: requestSignal,
        }) as Promise<Response>, signal);
      };
      const firstResponse = await withApiRequestTimeout((requestSignal) => audioUpload.fetch(`${baseUrl}/v1/ai/transcribe`, {
        method: 'POST',
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        body: audioUpload.form,
        signal: requestSignal,
      }) as Promise<Response>, signal);
      const response = await recoverApiUnauthorized(firstResponse, send);
      const payload = await response.json().catch(() => undefined) as { requestId?: string; data?: TranscribeResult; error?: { code?: string } } | undefined;
      if (!response.ok || !payload?.data) {
        throw rememberApiError(payload?.error?.code ?? `api_http_${response.status}`, response.status, payload?.requestId);
      }
      return payload.data;
    })();
  } catch (error) {
    await invalidateRejectedConsent(error);
    throw toAiOperationFailure(error, 'transcribe');
  }
}

export async function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal) {
  try {
    return await apiRequest<GrammarReviewResult>('/v1/ai/grammar-review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
    });
  } catch (error) {
    await invalidateRejectedConsent(error);
    throw toAiOperationFailure(error, 'grammar');
  }
}

export async function polishExpression(input: PolishRequest, signal?: AbortSignal) {
  try {
    return await apiRequest<PolishResult>('/v1/ai/polish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
    });
  } catch (error) {
    await invalidateRejectedConsent(error);
    throw toAiOperationFailure(error, 'polish');
  }
}

export async function reviewExpression(input: AiReviewRequest, signal?: AbortSignal) {
  const capability = input.mode === 'opi' ? 'polish' : 'grammar';
  try {
    return await apiRequest<AiReviewResult>('/v1/ai/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
    });
  } catch (error) {
    await invalidateRejectedConsent(error);
    throw toAiOperationFailure(error, capability);
  }
}
