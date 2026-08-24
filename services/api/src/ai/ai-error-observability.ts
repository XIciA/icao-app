import { HttpException, ServiceUnavailableException } from '@nestjs/common';

import type { ProviderMeta } from './provider-meta';

export type AiFailureObservation = {
  failureCode: string;
  upstreamStatus: string;
  attemptCount: number;
  meta?: ProviderMeta;
};

function httpErrorCode(error: unknown) {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object' || !('message' in response)) return undefined;
  const message = (response as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

const SAFE_FAILURE_CODES = new Set([
  'ai_cancelled',
  'ai_consent_required',
  'ai_invalid_response',
  'ai_not_configured',
  'ai_timeout',
  'ai_upstream_auth_failed',
  'ai_upstream_balance_insufficient',
  'ai_upstream_failed',
  'ai_upstream_limited',
  'invalid_audio',
  'no_speech_detected',
]);

function upstreamCategory(code: string) {
  if (code === 'ai_upstream_limited') return 'limited';
  if (code === 'ai_upstream_auth_failed') return 'authentication_failed';
  if (code === 'ai_upstream_balance_insufficient') return 'balance_unavailable';
  if (code === 'ai_timeout') return 'timeout';
  if (code === 'ai_cancelled') return 'cancelled';
  if (code === 'ai_invalid_response' || code === 'no_speech_detected') return 'invalid_response';
  if (code === 'ai_not_configured') return 'not_configured';
  if (code === 'invalid_audio') return 'invalid_input';
  if (code === 'ai_upstream_failed') return 'unavailable';
  return 'failed';
}

export class ObservedAiServiceException extends ServiceUnavailableException {
  constructor(
    public readonly failureCode: string,
    public readonly upstreamStatus: string,
    public readonly attemptCount: number,
    public readonly meta?: ProviderMeta,
  ) {
    super(failureCode);
  }
}

export function aiFailureObservation(error: unknown): AiFailureObservation {
  if (error instanceof ObservedAiServiceException) {
    return {
      failureCode: error.failureCode,
      upstreamStatus: error.upstreamStatus,
      attemptCount: Math.max(1, error.attemptCount),
      ...(error.meta ? { meta: error.meta } : {}),
    };
  }
  const httpCode = httpErrorCode(error);
  const code = httpCode && SAFE_FAILURE_CODES.has(httpCode) ? httpCode : 'internal_error';
  return { failureCode: code, upstreamStatus: upstreamCategory(code), attemptCount: 1 };
}
