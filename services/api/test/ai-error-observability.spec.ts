import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  aiFailureObservation,
  ObservedAiServiceException,
} from '../src/ai/ai-error-observability';

describe('AI error observability', () => {
  it('preserves the allowlisted provider category and attempt count', () => {
    expect(aiFailureObservation(new ObservedAiServiceException('ai_invalid_response', 'invalid_response', 2))).toEqual({
      attemptCount: 2,
      failureCode: 'ai_invalid_response',
      upstreamStatus: 'invalid_response',
    });
  });

  it('classifies ordinary HTTP AI errors without recording raw provider messages', () => {
    expect(aiFailureObservation(new ServiceUnavailableException('ai_upstream_balance_insufficient'))).toEqual({
      attemptCount: 1,
      failureCode: 'ai_upstream_balance_insufficient',
      upstreamStatus: 'balance_unavailable',
    });
  });

  it('uses a stable internal category for unknown errors', () => {
    expect(aiFailureObservation(new Error('provider secret and private detail'))).toEqual({
      attemptCount: 1,
      failureCode: 'internal_error',
      upstreamStatus: 'failed',
    });
  });

  it('does not persist an unknown HTTP exception message as a failure code', () => {
    expect(aiFailureObservation(new ServiceUnavailableException('provider secret and private detail'))).toEqual({
      attemptCount: 1,
      failureCode: 'internal_error',
      upstreamStatus: 'failed',
    });
  });
});
