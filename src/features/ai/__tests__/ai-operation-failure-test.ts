import { AiOperationFailure, aiFailureDisplayMessage, toAiOperationFailure } from '@/features/ai/ai-operation-failure';
import { ApiClientError } from '@/platform/api-client';

describe('AI operation failure classification', () => {
  it('preserves server code, status, and request ID while generating a safe local diagnostic ID', () => {
    const failure = toAiOperationFailure(
      new ApiClientError('ai_upstream_limited', 503, 'request-safe-1'),
      'polish',
    );

    expect(failure).toMatchObject({
      capability: 'polish',
      code: 'ai_upstream_limited',
      requestId: 'request-safe-1',
      retryable: true,
      stage: 'provider',
      status: 503,
      userAction: 'retry',
    });
    expect(failure.diagnosticId).toMatch(/^A-[A-Z0-9]{5}-[A-Z0-9]{2}$/u);
    expect(aiFailureDisplayMessage(failure)).toContain(failure.diagnosticId);
    expect(aiFailureDisplayMessage(failure)).toContain('服务请求编号：request-safe-1');
  });

  it('omits a malformed service request ID from the user-facing diagnostic', () => {
    const failure = toAiOperationFailure(
      new ApiClientError('ai_upstream_failed', 503, 'unsafe request <private>'),
      'grammar',
    );

    expect(aiFailureDisplayMessage(failure)).not.toContain('unsafe request');
  });

  it('classifies authentication and non-retryable provider configuration failures', () => {
    expect(toAiOperationFailure(new Error('missing_bearer_token'), 'transcribe')).toMatchObject({
      stage: 'authentication', retryable: false, userAction: 'sign_in',
    });
    expect(toAiOperationFailure(new ApiClientError('ai_upstream_balance_insufficient', 503), 'grammar')).toMatchObject({
      stage: 'provider', retryable: false, userAction: 'contact_support', userMessage: expect.stringContaining('余额不足'),
    });
    expect(toAiOperationFailure(new ApiClientError('ai_upstream_auth_failed', 503), 'grammar').userMessage)
      .toContain('凭据已失效');
  });

  it('keeps cancellation silent and does not turn it into a retryable fault', () => {
    const failure = toAiOperationFailure(new Error('ai_cancelled'), 'grammar');
    expect(failure).toBeInstanceOf(AiOperationFailure);
    expect(failure).toMatchObject({ cancelled: true, retryable: false, stage: 'cancelled', userAction: 'none' });
    expect(failure.userMessage).toBe('');
  });

  it('gives transcription-specific actions for audio and speech failures', () => {
    expect(toAiOperationFailure(new Error('invalid_audio'), 'transcribe')).toMatchObject({
      stage: 'upload', userAction: 'record_again',
    });
    expect(toAiOperationFailure(new Error('ai_upstream_balance_insufficient'), 'transcribe')).toMatchObject({
      stage: 'provider', retryable: false, userAction: 'contact_support',
    });
  });

  it('distinguishes exhausted points from a queued or safely restartable operation', () => {
    expect(toAiOperationFailure(new ApiClientError('insufficient_ai_points', 402), 'grammar')).toMatchObject({
      retryable: false,
      stage: 'authorization',
      userMessage: expect.stringContaining('AI 点数不足'),
    });
    expect(toAiOperationFailure(new ApiClientError('ai_operation_in_progress', 409), 'grammar')).toMatchObject({
      retryable: true,
      stage: 'api',
      userMessage: expect.stringContaining('仍在处理中'),
    });
    expect(toAiOperationFailure(new ApiClientError('ai_operation_released', 409), 'grammar')).toMatchObject({
      retryable: true,
      stage: 'api',
      userMessage: expect.stringContaining('重新点击'),
    });
  });
});
