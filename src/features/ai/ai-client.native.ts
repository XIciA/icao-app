import {
  COMMERCE_ENVIRONMENT_HEADER, CURRENT_AI_CONSENT_FLOW_REVISION, CURRENT_AI_CONSENT_POLICY_VERSION,
  type AiConsent, type AiConsentChallenge, type AiConsentStatus, type AiReviewRequest,
  type GrammarReviewRequest, type PolishRequest,
} from '@icao/contracts';
import type {
  AiAllowanceResponse, AiOperationLookup, MeteredAiReviewResult, MeteredGrammarReviewResult, MeteredPolishResult,
  MeteredTranscribeResult, TranscribeReviewRequest, TranscribeReviewResult,
} from '@icao/contracts/commerce-rules';
import { randomUUID } from 'expo-crypto';
import Storage from '@/platform/storage';
import { apiAccessToken, apiRequest, getApiBaseUrl, recoverApiUnauthorized, rememberApiError, withApiRequestTimeout } from '@/platform/api-client';
import { createAudioUploadForm } from '@/platform/audio-upload';
import { getNativeCommerceEnvironmentState, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';
import { AiOperationFailure, toAiOperationFailure, type AiCapability } from './ai-operation-failure.native';
import { getAsrModel } from './asr-model-preference';

const CONSENT_PREFIX = `icao.ai.consent.${CURRENT_AI_CONSENT_POLICY_VERSION}`;
const consentKey = (accountId: string) => `${CONSENT_PREFIX}.${encodeURIComponent(getApiBaseUrl() ?? '')}.${accountId}`;
type Owner = ReturnType<typeof getNativeCommerceEnvironmentState>;
type AiContext = { owner: Owner; signal: AbortSignal };

function assertOwner(owner: Owner, signal?: AbortSignal) {
  const current = getNativeCommerceEnvironmentState();
  if (signal?.aborted || current.accountId !== owner.accountId || current.environment !== owner.environment
    || current.generation !== owner.generation || current.status !== 'active') throw new Error('request_aborted');
}

/** Reuse the account/environment owner; cancellation also prevents a 401 retry under another account. */
async function withOwner<T>(action: (context: AiContext) => Promise<T>, externalSignal?: AbortSignal): Promise<T> {
  const owner = getNativeCommerceEnvironmentState();
  if (!owner.accountId || owner.status !== 'active') throw new Error('commerce_environment_unavailable');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const unsubscribe = subscribeNativeCommerceEnvironment(() => {
    try { assertOwner(owner); } catch { abort(); }
  });
  try {
    return await withApiRequestTimeout(async (signal) => {
      assertOwner(owner, signal);
      const result = await action({ owner, signal });
      assertOwner(owner, signal);
      return result;
    }, controller.signal);
  } finally { unsubscribe(); externalSignal?.removeEventListener('abort', abort); }
}

function headers(context: AiContext, operationId?: string) {
  return { [COMMERCE_ENVIRONMENT_HEADER]: context.owner.environment,
    ...(operationId ? { 'x-ai-operation-id': operationId } : {}) };
}

export async function hasAiConsent() {
  return withOwner(async (context) => {
    const status = await apiRequest<AiConsentStatus>('/v1/ai/consent', { signal: context.signal });
    assertOwner(context.owner, context.signal);
    const accepted = status.accepted && status.policyVersion === CURRENT_AI_CONSENT_POLICY_VERSION;
    if (accepted) await Storage.setItem(consentKey(context.owner.accountId!), 'accepted').catch(() => undefined);
    else await Storage.removeItem(consentKey(context.owner.accountId!)).catch(() => undefined);
    return accepted;
  });
}

export async function getCachedAiConsentHint() {
  const accountId = getNativeCommerceEnvironmentState().accountId;
  return accountId ? Storage.getItem(consentKey(accountId)).then((value) => value === 'accepted').catch(() => false) : false;
}

export async function acceptAiConsent() {
  return withOwner(async (context) => {
    const challenge = await apiRequest<AiConsentChallenge>('/v1/ai/consent/challenge', {
      method: 'POST', signal: context.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION, flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION }),
    });
    assertOwner(context.owner, context.signal);
    const consent = await apiRequest<AiConsent>('/v1/ai/consent', {
      method: 'POST', signal: context.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true, policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION, challenge: challenge.challenge }),
    });
    assertOwner(context.owner, context.signal);
    await Storage.setItem(consentKey(context.owner.accountId!), 'accepted').catch(() => undefined);
    return consent;
  });
}

export async function withdrawAiConsent() {
  return withOwner(async (context) => {
    await apiRequest('/v1/ai/consent', { method: 'DELETE', signal: context.signal });
    await Storage.removeItem(consentKey(context.owner.accountId!)).catch(() => undefined);
  });
}

export async function clearLocalAiConsent() {
  const accountId = getNativeCommerceEnvironmentState().accountId;
  await Promise.all([Storage.removeItem(CONSENT_PREFIX),
    ...(accountId ? [Storage.removeItem(consentKey(accountId))] : [])]);
}

export function createAiOperationId() { return randomUUID(); }

function localTime(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function allowanceFailureMessage(value: AiAllowanceResponse) {
  const allowance = value.allowance;
  if (allowance.mode === 'expired') return '会员已到期，续费后可继续使用会员 AI。已有回答和反馈仍保留。';
  if (allowance.mode === 'trial') return '本次免费体验额度不足，开通会员后可继续使用 AI。已有回答和反馈仍保留。';
  if (allowance.mode === 'weekly') {
    const reset = allowance.resetAt;
    const expiry = allowance.membershipExpiresAt;
    if (expiry && Number.isFinite(Date.parse(expiry)) && (!reset || Date.parse(expiry) <= Date.parse(reset))) {
      return `本周期 AI 额度不足，会员将于${localTime(expiry)}到期。提前续费不会补充本周期额度。`;
    }
    if (reset && Number.isFinite(Date.parse(reset))) return `本周期 AI 额度不足，将于${localTime(reset)}恢复。题库学习和已有反馈仍可使用。`;
    return '本周期 AI 额度不足。题库学习和已有反馈仍可使用，可在“我的”查看恢复时间。';
  }
  return '暂时无法确认 AI 额度，请稍后重试。已有回答和反馈仍可查看。';
}

async function operationFailure(error: unknown, capability: AiCapability, context: AiContext) {
  const failure = toAiOperationFailure(error, capability);
  if (failure.code === 'ai_consent_required') await Storage.removeItem(consentKey(context.owner.accountId!)).catch(() => undefined);
  if (failure.code !== 'insufficient_ai_points') return failure;
  try {
    assertOwner(context.owner, context.signal);
    const value = await withApiRequestTimeout((signal) => apiRequest<AiAllowanceResponse>('/v1/commerce/allowance/current', {
      headers: headers(context), signal,
    }), context.signal, 8000);
    assertOwner(context.owner, context.signal);
    if (value.environment !== context.owner.environment) return failure;
    return new AiOperationFailure(capability, failure.stage, failure.code, failure.diagnosticId, false, 'none',
      allowanceFailureMessage(value), failure.status, failure.requestId);
  } catch { return failure; }
}

async function jsonOperation<T>(path: string, input: unknown, capability: AiCapability, signal?: AbortSignal, operationId = createAiOperationId()): Promise<T> {
  try {
    return await withOwner(async (context) => {
      try {
        return await apiRequest<T>(path, { method: 'POST', signal: context.signal,
          headers: { ...headers(context, operationId), 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      } catch (error) { throw await operationFailure(error, capability, context); }
    }, signal);
  } catch (error) { throw toAiOperationFailure(error, capability); }
}

async function audioOperation<T>(uri: string, input: TranscribeReviewRequest | undefined, signal?: AbortSignal, operationId = createAiOperationId()): Promise<T> {
  const capability = input?.mode === 'opi' ? 'polish' : input ? 'grammar' : 'transcribe';
  try {
    return await withOwner(async (context) => {
      try {
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) throw new Error('api_not_configured');
        const token = await apiAccessToken();
        if (!token) throw new Error('missing_bearer_token');
        const model = await getAsrModel();
        const send = async (accessToken: string) => {
          assertOwner(context.owner, context.signal);
          const upload = await createAudioUploadForm(uri, model);
          if (input) for (const [key, value] of Object.entries(input)) upload.form.append(key, value);
          assertOwner(context.owner, context.signal);
          return upload.fetch(`${baseUrl}/v1/ai/${input ? 'transcribe-review' : 'transcribe'}`, {
            method: 'POST', headers: { ...headers(context, operationId), accept: 'application/json', authorization: `Bearer ${accessToken}` },
            body: upload.form, signal: context.signal,
          }) as Promise<Response>;
        };
        const response = await recoverApiUnauthorized(await send(token), send, token);
        const payload = await response.json().catch(() => undefined) as { requestId?: string; data?: T; error?: { code?: string } } | undefined;
        if (!response.ok || !payload?.data) throw rememberApiError(payload?.error?.code ?? `api_http_${response.status}`, response.status, payload?.requestId);
        return payload.data;
      } catch (error) { throw await operationFailure(error, capability, context); }
    }, signal);
  } catch (error) { throw toAiOperationFailure(error, capability); }
}

export function transcribeRecording(uri: string, signal?: AbortSignal, operationId?: string) {
  return audioOperation<MeteredTranscribeResult>(uri, undefined, signal, operationId);
}
export function transcribeAndReviewRecording(uri: string, input: TranscribeReviewRequest, signal?: AbortSignal, operationId?: string) {
  return audioOperation<TranscribeReviewResult>(uri, input, signal, operationId);
}
export function grammarReview(input: GrammarReviewRequest, signal?: AbortSignal, operationId?: string) {
  return jsonOperation<MeteredGrammarReviewResult>('/v1/ai/grammar-review', input, 'grammar', signal, operationId);
}
export function polishExpression(input: PolishRequest, signal?: AbortSignal, operationId?: string) {
  return jsonOperation<MeteredPolishResult>('/v1/ai/polish', input, 'polish', signal, operationId);
}
export function reviewExpression(input: AiReviewRequest, signal?: AbortSignal, operationId?: string) {
  return jsonOperation<MeteredAiReviewResult>('/v1/ai/review', input, input.mode === 'opi' ? 'polish' : 'grammar', signal, operationId);
}

/** Read a completed result without uploading audio or consuming new quota. */
export function lookupAiOperation(operationId: string, signal?: AbortSignal) {
  return withOwner((context) => apiRequest<AiOperationLookup>(`/v1/ai/operations/${encodeURIComponent(operationId)}`, {
    headers: headers(context), signal: context.signal,
  }), signal);
}
