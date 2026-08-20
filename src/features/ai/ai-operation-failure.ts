import { ApiClientError } from '@/platform/api-client';

export type AiCapability = 'transcribe' | 'grammar' | 'polish';

export type AiFailureStage =
  | 'authorization'
  | 'authentication'
  | 'upload'
  | 'api'
  | 'provider'
  | 'response_validation'
  | 'cancelled';

export type AiFailureUserAction =
  | 'retry'
  | 'record_again'
  | 'sign_in'
  | 'contact_support'
  | 'none';

let diagnosticSequence = 0;

function diagnosticId() {
  diagnosticSequence = (diagnosticSequence + 1) % 1_679_616;
  const seed = `${Date.now()}:${diagnosticSequence}:${Math.random()}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  const value = (hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-7);
  return `A-${value.slice(0, 5)}-${value.slice(5)}`;
}

function isCancellation(error: unknown) {
  if (error instanceof AiOperationFailure) return error.cancelled;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || ['request_aborted', 'ai_cancelled'].includes(error.message);
}

function rawCode(error: unknown) {
  if (error instanceof AiOperationFailure) return error.code;
  if (error instanceof ApiClientError) return error.code;
  return error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
    ? error.message
    : 'ai_request_failed';
}

function failurePolicy(code: string, fallbackStage: AiFailureStage) {
  if (['missing_bearer_token', 'invalid_access_token', 'invalid_session', 'session_revoked', 'invite_account_required', 'auth_session_expired'].includes(code)) {
    return {
      stage: 'authentication' as const,
      retryable: false,
      userAction: 'sign_in' as const,
      userMessage: '登录状态已失效，请重新登录后再试。',
    };
  }
  if (code === 'ai_consent_required') {
    return {
      stage: 'authorization' as const,
      retryable: true,
      userAction: 'retry' as const,
      userMessage: 'AI 使用授权状态未同步，请重试。',
    };
  }
  if (code === 'no_speech_detected') {
    return {
      stage: 'response_validation' as const,
      retryable: true,
      userAction: 'record_again' as const,
      userMessage: '未检测到清晰语音，请回放录音并检查麦克风后重新录制。',
    };
  }
  if (code === 'invalid_audio') {
    return {
      stage: 'upload' as const,
      retryable: true,
      userAction: 'record_again' as const,
      userMessage: '录音文件格式无效，请重新录制后转写。',
    };
  }
  if (['api_not_configured', 'ai_not_configured', 'ai_upstream_auth_failed', 'ai_upstream_balance_insufficient'].includes(code)) {
    return {
      stage: code === 'api_not_configured' ? 'api' as const : 'provider' as const,
      retryable: false,
      userAction: 'contact_support' as const,
      userMessage: 'AI 服务配置异常，请提交诊断信息并联系支持。',
    };
  }
  if (code === 'ai_invalid_response') {
    return {
      stage: 'response_validation' as const,
      retryable: true,
      userAction: 'retry' as const,
      userMessage: 'AI 返回结果未通过校验，请稍后重试。',
    };
  }
  if (code === 'ai_upstream_limited' || code === 'ai_rate_limited') {
    return {
      stage: 'provider' as const,
      retryable: true,
      userAction: 'retry' as const,
      userMessage: 'AI 服务当前繁忙，请稍后手动重试。',
    };
  }
  if (code === 'ai_timeout') {
    return {
      stage: 'provider' as const,
      retryable: true,
      userAction: 'retry' as const,
      userMessage: 'AI 服务响应超时，请检查网络后手动重试。',
    };
  }
  if (code === 'ai_upstream_failed') {
    return {
      stage: 'provider' as const,
      retryable: true,
      userAction: 'retry' as const,
      userMessage: 'AI 服务暂时不可用，请稍后手动重试。',
    };
  }
  return {
    stage: fallbackStage,
    retryable: true,
    userAction: 'retry' as const,
    userMessage: fallbackStage === 'upload'
      ? '录音上传失败，请检查网络后重试。'
      : 'AI 请求失败，请检查网络后重试。',
  };
}

export class AiOperationFailure extends Error {
  readonly name = 'AiOperationFailure';

  constructor(
    public readonly capability: AiCapability,
    public readonly stage: AiFailureStage,
    public readonly code: string,
    public readonly diagnosticId: string,
    public readonly retryable: boolean,
    public readonly userAction: AiFailureUserAction,
    public readonly userMessage: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly cancelled = false,
  ) {
    super(code);
  }
}

export function toAiOperationFailure(
  error: unknown,
  capability: AiCapability,
  fallbackStage: AiFailureStage = 'api',
) {
  if (error instanceof AiOperationFailure) return error;
  const code = rawCode(error);
  if (isCancellation(error)) {
    return new AiOperationFailure(
      capability,
      'cancelled',
      code === 'ai_request_failed' ? 'ai_cancelled' : code,
      diagnosticId(),
      false,
      'none',
      '',
      error instanceof ApiClientError ? error.status : undefined,
      error instanceof ApiClientError ? error.requestId : undefined,
      true,
    );
  }
  const policy = failurePolicy(code, fallbackStage);
  return new AiOperationFailure(
    capability,
    policy.stage,
    code,
    diagnosticId(),
    policy.retryable,
    policy.userAction,
    policy.userMessage,
    error instanceof ApiClientError ? error.status : undefined,
    error instanceof ApiClientError ? error.requestId : undefined,
  );
}

export function aiFailureDisplayMessage(failure: AiOperationFailure) {
  return `${failure.userMessage}（诊断编号：${failure.diagnosticId}）`;
}
