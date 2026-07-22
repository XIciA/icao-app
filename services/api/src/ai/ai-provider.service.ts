import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { API_CONFIG, type ApiConfig } from '../config';

type Completion = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export type ProviderMeta = { audioDurationSeconds?: number; inputTokens?: number; outputTokens?: number };

@Injectable()
export class AiProviderService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  private endpoint() {
    return `${this.config.dashscopeBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private async request(body: Record<string, unknown>, timeoutMs: number, externalSignal?: AbortSignal): Promise<Completion> {
    if (!this.config.dashscopeApiKey) throw new ServiceUnavailableException('ai_not_configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.dashscopeApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal,
      });
      if (!response.ok) throw new ServiceUnavailableException(response.status === 429 ? 'ai_upstream_limited' : 'ai_upstream_failed');
      return await response.json() as Completion;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ServiceUnavailableException(externalSignal?.aborted ? 'ai_cancelled' : 'ai_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateJson<T>(system: string, prompt: string, signal?: AbortSignal) {
    const payload = await this.request({
      model: this.config.aiTextModel,
      messages: [{ role: 'system', content: `${system}\nReturn only one valid JSON object without Markdown.` }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }, 20_000, signal);
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ServiceUnavailableException('ai_invalid_response');
    let data: unknown;
    try { data = JSON.parse(content); } catch { throw new ServiceUnavailableException('ai_invalid_response'); }
    return { data: data as T, meta: { inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens } satisfies ProviderMeta };
  }

  textModel() { return this.config.aiTextModel; }
}
