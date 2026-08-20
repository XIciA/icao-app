import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { AiReviewRequest } from '@icao/contracts';

import { API_CONFIG, type ApiConfig } from '../config';
import type { ProviderMeta } from './ai-provider.service';
import { ObservedAiServiceException } from './ai-error-observability';

type Completion = {
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

class ReviewAttemptError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
  }
}

type Waiter = {
  signal?: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  onAbort?: () => void;
};

@Injectable()
export class DeepSeekReviewProviderService {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  private endpoint() {
    return `${this.config.deepseekBaseUrl.replace(/\/+$/u, '')}/chat/completions`;
  }

  private model(mode: AiReviewRequest['mode']) {
    return mode === 'grammar' ? this.config.aiGrammarModel : this.config.aiPolishModel;
  }

  textModel(mode: AiReviewRequest['mode']) {
    return this.model(mode);
  }

  private release() {
    this.active -= 1;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      if (waiter.signal?.aborted) continue;
      if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
      this.active += 1;
      waiter.resolve(() => this.release());
      return;
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new ServiceUnavailableException('ai_cancelled'));
    if (this.active < this.config.aiReviewMaxConcurrency) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { signal, resolve, reject };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new ServiceUnavailableException('ai_cancelled'));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }

  private async request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Completion> {
    if (!this.config.deepseekApiKey) throw new ReviewAttemptError('ai_not_configured', false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.deepseekApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) throw new ReviewAttemptError('ai_upstream_limited', true);
        if ([500, 503].includes(response.status)) throw new ReviewAttemptError('ai_upstream_failed', true);
        if (response.status === 401) throw new ReviewAttemptError('ai_upstream_auth_failed', false);
        if (response.status === 402) throw new ReviewAttemptError('ai_upstream_balance_insufficient', false);
        throw new ReviewAttemptError('ai_upstream_failed', false);
      }
      return await response.json() as Completion;
    } catch (error) {
      if (error instanceof ReviewAttemptError) throw error;
      if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
        throw new ReviewAttemptError(signal?.aborted ? 'ai_cancelled' : 'ai_timeout', !signal?.aborted);
      }
      throw new ReviewAttemptError('ai_upstream_failed', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateValidated<T>(input: {
    mode: AiReviewRequest['mode'];
    system: string;
    prompt: string;
    userId: string;
    signal?: AbortSignal;
    validate: (data: unknown) => T;
  }): Promise<{ data: T; meta: ProviderMeta }> {
    const release = await this.acquire(input.signal);
    const meta: ProviderMeta = {};
    let lastCode = 'ai_invalid_response';
    let attemptCount = 0;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        attemptCount = attempt + 1;
        try {
          const payload = await this.request({
            model: this.model(input.mode),
            thinking: { type: 'disabled' },
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
            max_tokens: 2048,
            stream: false,
          }, input.signal);
          meta.inputTokens = (meta.inputTokens ?? 0) + (payload.usage?.prompt_tokens ?? 0);
          meta.outputTokens = (meta.outputTokens ?? 0) + (payload.usage?.completion_tokens ?? 0);
          const choice = payload.choices?.[0];
          if (choice?.finish_reason === 'length') throw new ReviewAttemptError('ai_invalid_response', true);
          const content = choice?.message?.content;
          if (typeof content !== 'string' || !content.trim()) throw new ReviewAttemptError('ai_invalid_response', true);
          let data: unknown;
          try { data = JSON.parse(content); } catch { throw new ReviewAttemptError('ai_invalid_response', true); }
          try {
            return {
              data: input.validate(data),
              meta: { ...meta, attemptCount, upstreamStatus: attemptCount > 1 ? 'recovered' : 'success' },
            };
          } catch {
            throw new ReviewAttemptError('ai_invalid_response', true);
          }
        } catch (error) {
          const failure = error instanceof ReviewAttemptError ? error : new ReviewAttemptError('ai_invalid_response', true);
          lastCode = failure.code;
          if (!failure.retryable || failure.code !== 'ai_invalid_response' || attempt === 1) break;
        }
      }
      const status = lastCode === 'ai_upstream_limited'
        ? 'limited'
        : lastCode === 'ai_upstream_auth_failed'
          ? 'authentication_failed'
          : lastCode === 'ai_upstream_balance_insufficient'
            ? 'balance_unavailable'
            : lastCode === 'ai_timeout'
              ? 'timeout'
              : lastCode === 'ai_cancelled'
                ? 'cancelled'
                : lastCode === 'ai_invalid_response'
                  ? 'invalid_response'
                  : lastCode === 'ai_not_configured'
                    ? 'not_configured'
                    : 'unavailable';
      throw new ObservedAiServiceException(lastCode, status, attemptCount || 1, {
        ...meta,
        attemptCount: attemptCount || 1,
        upstreamStatus: status,
      });
    } finally {
      release();
    }
  }
}
