import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  FeedbackCategory,
  FeedbackDiagnosticFeature,
  FeedbackQuestionContext,
  FeedbackSource,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
} from '@icao/contracts';
import * as Device from 'expo-device';
import type { ImagePickerAsset } from 'expo-image-picker';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { APP_DISPLAY_VERSION } from '@/config/app-version';
import {
  apiAccessToken,
  getApiBaseUrl,
  getRecentApiError,
  recoverApiUnauthorized,
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
  examDate?: string;
  examCenter?: string;
  source: FeedbackSource;
  sourceRoute: string;
  question?: FeedbackQuestionContext;
  images: ImagePickerAsset[];
  diagnosticFeature?: FeedbackDiagnosticFeature;
  diagnosticCorrelationId?: string;
};

export function createClientSubmissionId() {
  const secureId = globalThis.crypto?.randomUUID?.();
  if (secureId) return secureId;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function submitFeedback(input: SubmitFeedbackInput) {
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
    ...(input.source === 'exam_report' ? { examDate: input.examDate || undefined, examCenter: input.examCenter?.trim() || undefined } : {}),
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
  const token = await apiAccessToken();
  if (!token) throw new Error('missing_bearer_token');
  const { fetch: uploadFetch, form } = await createFeedbackUploadForm(JSON.stringify(payload), input.images);
  const send = (accessToken: string) => uploadFetch(`${baseUrl}/v1/feedback`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
    body: form,
  }) as Promise<Response>;
  const response = await recoverApiUnauthorized(await send(token), send);
  const body = await response.json().catch(() => undefined) as
    | ApiSuccessEnvelope<FeedbackSubmissionResponse>
    | ApiErrorEnvelope
    | undefined;
  if (!body) throw rememberApiError(`api_http_${response.status}`, response.status);
  if (!response.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : `api_http_${response.status}`;
    throw rememberApiError(code, response.status, body.requestId);
  }
  if (diagnostics) await clearSafeDiagnosticCorrelation(diagnostics.feature, diagnostics.correlationId);
  return body.data;
}

function buildVersion(platform: FeedbackSubmissionPayload['platform']) {
  if (Constants.nativeBuildVersion) return Constants.nativeBuildVersion;
  if (platform === 'ios') return Constants.expoConfig?.ios?.buildNumber ?? 'unknown';
  if (platform === 'android') return String(Constants.expoConfig?.android?.versionCode ?? 'unknown');
  return Constants.expoConfig?.version ?? 'unknown';
}
