import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  FeedbackCategory,
  FeedbackDiagnosticFeature,
  FeedbackSource,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
} from '@icao/contracts';
import type { VersionedFeedbackQuestionContext } from '@icao/contracts/feedback-ops';
import { randomUUID } from 'expo-crypto';
import { getNativeCommerceEnvironmentState, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';
import * as Device from 'expo-device';
import type { ImagePickerAsset } from 'expo-image-picker';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { APP_DISPLAY_VERSION } from '@/config/app-version';
import {
  apiAccessToken,
  getApiBaseUrl,
  getRecentApiError,
  withApiRequestTimeout,
  rememberApiError,
} from '@/platform/api-client';
import { createFeedbackUploadForm } from '@/platform/feedback-upload';
import {
  clearSafeDiagnosticCorrelation,
  getSafeDiagnosticBundleForCorrelation,
} from '@/platform/diagnostics/safe-diagnostic-store';

export type SubmitFeedbackInput = {
  clientSubmissionId: string;
  category: FeedbackCategory;
  description: string;
  contact?: string;
  source: FeedbackSource;
  sourceRoute: string;
  question?: VersionedFeedbackQuestionContext;
  signal?: AbortSignal;
  images: ImagePickerAsset[];
  diagnosticFeature?: FeedbackDiagnosticFeature;
  diagnosticCorrelationId?: string;
};

export function createClientSubmissionId() { return randomUUID(); }

type FeedbackOwner = ReturnType<typeof getNativeCommerceEnvironmentState>;
function assertFeedbackOwner(owner: FeedbackOwner, signal?: AbortSignal) {
  const current = getNativeCommerceEnvironmentState();
  if (signal?.aborted || !owner.accountId || current.status !== 'active' || current.accountId !== owner.accountId
    || current.generation !== owner.generation) throw new Error('request_aborted');
}

export async function submitFeedback(input: SubmitFeedbackInput) {
  const owner = getNativeCommerceEnvironmentState();
  assertFeedbackOwner(owner, input.signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  const unsubscribe = subscribeNativeCommerceEnvironment(() => {
    try { assertFeedbackOwner(owner); } catch { abort(); }
  });
  try {
    return await withApiRequestTimeout(signal => submitOwnedFeedback(input, owner, signal), controller.signal);
  } finally { unsubscribe(); input.signal?.removeEventListener('abort', abort); }
}

async function submitOwnedFeedback(input: SubmitFeedbackInput, owner: FeedbackOwner, signal: AbortSignal) {
  assertFeedbackOwner(owner, signal);
  const token = await apiAccessToken();
  assertFeedbackOwner(owner, signal);
  if (!token) throw new Error('missing_bearer_token');
  const platform = Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android';
  const diagnostics = input.diagnosticFeature && input.diagnosticCorrelationId
    ? await getSafeDiagnosticBundleForCorrelation({
        appVersion: APP_DISPLAY_VERSION,
        build: buildVersion(platform),
        platform,
        osVersion: Device.osVersion ?? 'unknown',
      }, input.diagnosticFeature, input.diagnosticCorrelationId)
    : undefined;
  const payload: FeedbackSubmissionPayload = {
    clientSubmissionId: input.clientSubmissionId,
    category: input.category,
    description: input.description.trim(),
    contact: input.contact?.trim() || undefined,
    source: input.source,
    sourceRoute: input.sourceRoute.split(/[?#]/u)[0] || '/',
    appDisplayVersion: APP_DISPLAY_VERSION,
    platform,
    osName: Device.osName ?? undefined,
    osVersion: Device.osVersion ?? undefined,
    question: input.question,
    error: getRecentApiError(),
    diagnostics,
  };
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('api_not_configured');
  assertFeedbackOwner(owner, signal);
  const { fetch: uploadFetch, form } = await createFeedbackUploadForm(JSON.stringify(payload), input.images);
  assertFeedbackOwner(owner, signal);
  // A mutation never retries with a different account token; the same idempotency key can be retried explicitly.
  const response = await uploadFetch(`${baseUrl}/v1/feedback`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    body: form, signal,
  }) as Response;
  assertFeedbackOwner(owner, signal);
  const body = await response.json().catch(() => undefined) as
    | ApiSuccessEnvelope<FeedbackSubmissionResponse>
    | ApiErrorEnvelope
    | undefined;
  assertFeedbackOwner(owner, signal);
  if (!body) throw rememberApiError(`api_http_${response.status}`, response.status);
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw rememberApiError(code, response.status, body.requestId);
  }
  if (diagnostics) await clearSafeDiagnosticCorrelation(diagnostics.feature, diagnostics.correlationId);
  assertFeedbackOwner(owner, signal);
  return body.data;
}

function buildVersion(platform: FeedbackSubmissionPayload['platform']) {
  if (Constants.nativeBuildVersion) return Constants.nativeBuildVersion;
  if (platform === 'ios') return Constants.expoConfig?.ios?.buildNumber ?? 'unknown';
  if (platform === 'android') return String(Constants.expoConfig?.android?.versionCode ?? 'unknown');
  return Constants.expoConfig?.version ?? 'unknown';
}
