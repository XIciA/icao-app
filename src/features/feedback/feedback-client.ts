import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  FeedbackCategory,
  FeedbackQuestionContext,
  FeedbackSource,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
} from '@icao/contracts';
import * as Device from 'expo-device';
import type { ImagePickerAsset } from 'expo-image-picker';
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

export type SubmitFeedbackInput = {
  clientSubmissionId: string;
  category: FeedbackCategory;
  description: string;
  contact?: string;
  source: FeedbackSource;
  sourceRoute: string;
  question?: FeedbackQuestionContext;
  images: ImagePickerAsset[];
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
  return body.data;
}
