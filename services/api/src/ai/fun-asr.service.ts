import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from '../config';
import { type ProviderMeta } from './ai-provider.service';
import { AsrAudioStorageService } from './asr-audio-storage.service';

type TaskPayload = {
  output?: {
    code?: string;
    message?: string;
    task_id?: string;
    task_status?: string;
    results?: Array<{ code?: string; message?: string; subtask_status?: string; transcription_url?: string }>;
  };
  usage?: { duration?: number };
};

type TranscriptionPayload = {
  transcripts?: Array<{ text?: string }>;
};

export type AsrHotwordSelection =
  | { mode: 'configured' }
  | { mode: 'none' }
  | { mode: 'vocabulary'; vocabularyId: string };

@Injectable()
export class FunAsrService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly audioStorage: AsrAudioStorageService,
  ) {}

  model() { return this.config.aiAsrModel; }

  hotwordsVersion() { return this.config.aiAsrHotwordsVersion; }

  private endpoint(path: string) {
    return `${this.config.dashscopeAsrBaseUrl.replace(/\/+$/, '')}${path}`;
  }

  private remaining(deadline: number) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ServiceUnavailableException('ai_timeout');
    return remaining;
  }

  private async requestJson<T>(url: string, init: RequestInit, deadline: number, externalSignal?: AbortSignal): Promise<T> {
    if (!this.config.dashscopeApiKey) {
      throw new ServiceUnavailableException('ai_not_configured');
    }
    const timeoutSignal = AbortSignal.timeout(Math.min(15_000, this.remaining(deadline)));
    const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal;
    try {
      const response = await fetch(url, { ...init, signal });
      if (!response.ok) {
        throw new ServiceUnavailableException(response.status === 429 ? 'ai_upstream_limited' : 'ai_upstream_failed');
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
        throw new ServiceUnavailableException(externalSignal?.aborted ? 'ai_cancelled' : 'ai_timeout');
      }
      throw error;
    }
  }

  private async wait(deadline: number, externalSignal?: AbortSignal) {
    const duration = Math.min(this.config.aiAsrPollIntervalMs, this.remaining(deadline));
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        externalSignal?.removeEventListener('abort', cancel);
        resolve();
      };
      const timer = setTimeout(finish, duration);
      const cancel = () => {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', cancel);
        reject(new ServiceUnavailableException('ai_cancelled'));
      };
      if (externalSignal?.aborted) cancel();
      else externalSignal?.addEventListener('abort', cancel, { once: true });
    });
  }

  private async submit(fileUrl: string, vocabularyId: string | undefined, deadline: number, signal?: AbortSignal) {
    const parameters: Record<string, unknown> = {
      channel_id: [0],
      diarization_enabled: false,
      language_hints: ['en'],
    };
    if (vocabularyId) parameters.vocabulary_id = vocabularyId;
    const payload = await this.requestJson<TaskPayload>(this.endpoint('/services/audio/asr/transcription'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.dashscopeApiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: this.config.aiAsrModel,
        input: { file_urls: [fileUrl] },
        parameters,
      }),
    }, deadline, signal);
    const taskId = payload.output?.task_id;
    if (!taskId || payload.output?.task_status !== 'PENDING') throw new ServiceUnavailableException('ai_invalid_response');
    return taskId;
  }

  private throwUpstreamFailure(code?: string): never {
    if (code === 'ASR_RESPONSE_HAVE_NO_WORDS') {
      throw new UnprocessableEntityException('no_speech_detected');
    }
    throw new ServiceUnavailableException('ai_upstream_failed');
  }

  private async poll(taskId: string, deadline: number, signal?: AbortSignal) {
    for (;;) {
      const payload = await this.requestJson<TaskPayload>(this.endpoint(`/tasks/${encodeURIComponent(taskId)}`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.dashscopeApiKey}` },
      }, deadline, signal);
      const status = payload.output?.task_status;
      if (status === 'SUCCEEDED') {
        const result = payload.output?.results?.[0];
        if (result?.subtask_status !== 'SUCCEEDED' || !result.transcription_url) {
          this.throwUpstreamFailure(result?.code);
        }
        return { transcriptionUrl: result.transcription_url, durationSeconds: payload.usage?.duration };
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        this.throwUpstreamFailure(payload.output?.code ?? payload.output?.results?.[0]?.code);
      }
      if (status !== 'PENDING' && status !== 'RUNNING') throw new ServiceUnavailableException('ai_invalid_response');
      await this.wait(deadline, signal);
    }
  }

  private vocabularyId(selection: AsrHotwordSelection) {
    if (selection.mode === 'none') return undefined;
    if (selection.mode === 'vocabulary') {
      if (!selection.vocabularyId.trim()) throw new ServiceUnavailableException('ai_not_configured');
      return selection.vocabularyId;
    }
    if (this.config.aiAsrHotwordsMode === 'none') return undefined;
    if (!this.config.aiAsrVocabularyId) throw new ServiceUnavailableException('ai_not_configured');
    return this.config.aiAsrVocabularyId;
  }

  async transcribeUrlForEvaluation(fileUrl: string, selection: AsrHotwordSelection, signal?: AbortSignal): Promise<{ rawTranscript: string; meta: ProviderMeta }> {
    const deadline = Date.now() + this.config.aiAsrTimeoutMs;
    const taskId = await this.submit(fileUrl, this.vocabularyId(selection), deadline, signal);
    const completed = await this.poll(taskId, deadline, signal);
    const result = await this.requestJson<TranscriptionPayload>(completed.transcriptionUrl, { method: 'GET' }, deadline, signal);
    const rawTranscript = (result.transcripts ?? []).map((transcript) => transcript.text?.trim()).filter(Boolean).join('\n').trim();
    if (!rawTranscript) throw new ServiceUnavailableException('ai_invalid_response');
    return { rawTranscript, meta: { audioDurationSeconds: completed.durationSeconds } };
  }

  async transcribe(audio: Buffer, mimeType: string, signal?: AbortSignal): Promise<{ rawTranscript: string; meta: ProviderMeta }> {
    const staged = await this.audioStorage.stage(audio, mimeType);
    try {
      return await this.transcribeUrlForEvaluation(staged.url, { mode: 'configured' }, signal);
    } finally {
      await this.audioStorage.remove(staged.objectKey).catch(() => undefined);
    }
  }
}
