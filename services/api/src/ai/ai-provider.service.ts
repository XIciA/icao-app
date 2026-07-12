import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { TranscribeResult } from '@icao/contracts';

import { API_CONFIG, type ApiConfig } from '../config';

type Completion = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export type ProviderMeta = { inputTokens?: number; outputTokens?: number };

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

  async transcribe(audio: Buffer, mimeType: string, signal?: AbortSignal): Promise<{ data: TranscribeResult; meta: ProviderMeta }> {
    const payload = await this.request({
      model: this.config.aiAsrModel,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mimeType};base64,${audio.toString('base64')}` } }] }],
      asr_options: { enable_itn: false, language: 'en' },
      stream: false,
    }, 35_000, signal);
    const content = payload.choices?.[0]?.message?.content;
    const rawTranscript = typeof content === 'string' ? content.trim() : '';
    if (!rawTranscript) throw new ServiceUnavailableException('ai_invalid_response');
    return {
      data: { rawTranscript, transcript: normalizeTranscript(rawTranscript), hintsVersion: 'transcribe-hints-v1' },
      meta: { inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens },
    };
  }

  textModel() { return this.config.aiTextModel; }
  asrModel() { return this.config.aiAsrModel; }
}

function normalizeTranscript(value: string) {
  return value
    .replace(/\b([0-9])\s+decimal\s+([0-9])\s+([0-9])\b/gi, '$1 decimal $2$3')
    .replace(/\bflight\s+level\s+([0-9])\s+([0-9])\s+([0-9])\b/gi, 'flight level $1$2$3')
    .replace(/\s+([,.;?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
