import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TencentAsrModel } from '@icao/contracts';
import { asr } from 'tencentcloud-sdk-nodejs-asr';

import { API_CONFIG, type ApiConfig } from '../config';
import { type ProviderMeta } from './ai-provider.service';
import { AsrAudioStorageService } from './asr-audio-storage.service';

const AsrClient = asr.v20190614.Client;

function cleanTranscript(result: string | undefined) {
  return (result ?? '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\[\d+:[^\]]+\]\s*/u, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

@Injectable()
export class TencentAsrService {
  private readonly logger = new Logger(TencentAsrService.name);
  private client?: InstanceType<typeof AsrClient>;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly audioStorage: AsrAudioStorageService,
  ) {}

  private sdk() {
    const secretId = this.config.tencentCloudSecretId;
    const secretKey = this.config.tencentCloudSecretKey;
    if (!secretId || !secretKey) throw new ServiceUnavailableException('ai_not_configured');
    this.client ??= new AsrClient({
      credential: { secretId, secretKey },
      ...(this.config.tencentCloudRegion ? { region: this.config.tencentCloudRegion } : {}),
      profile: {
        signMethod: 'TC3-HMAC-SHA256',
        httpProfile: {
          endpoint: this.config.tencentAsrEndpoint,
          reqMethod: 'POST',
          reqTimeout: 15,
        },
      },
    });
    return this.client;
  }

  private remaining(deadline: number) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ServiceUnavailableException('ai_timeout');
    return remaining;
  }

  private async cloudCall<T>(operation: () => Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
    const timeoutMs = Math.min(15_000, this.remaining(deadline));
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        action();
      };
      const timer = setTimeout(() => finish(() => reject(new ServiceUnavailableException('ai_timeout'))), timeoutMs);
      const cancel = () => finish(() => reject(new ServiceUnavailableException('ai_cancelled')));
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener('abort', cancel, { once: true });
      operation().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  private async wait(deadline: number, signal?: AbortSignal) {
    const duration = Math.min(this.config.aiAsrPollIntervalMs, this.remaining(deadline));
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const timer = setTimeout(finish, duration);
      const cancel = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        reject(new ServiceUnavailableException('ai_cancelled'));
      };
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  private mapProviderError(error: unknown): never {
    if (error instanceof ServiceUnavailableException || error instanceof UnprocessableEntityException) throw error;
    const detail = error && typeof error === 'object'
      ? `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`
      : String(error);
    if (/RequestLimitExceeded|LimitExceeded|429/iu.test(detail)) {
      throw new ServiceUnavailableException('ai_upstream_limited');
    }
    if (/AuthFailure|InvalidCredential|InvalidParameter\.Secret|Unauthorized|401/iu.test(detail)) {
      throw new ServiceUnavailableException('ai_upstream_auth_failed');
    }
    if (/FailedOperation\.UserHasNoAmount|InsufficientBalance|NoAmount|PaymentRequired|402/iu.test(detail)) {
      throw new ServiceUnavailableException('ai_upstream_balance_insufficient');
    }
    if (/NoUsefulAudio|no useful audio|no (?:valid )?(?:voice|speech)|无有效|无语音|静音/iu.test(detail)) {
      throw new UnprocessableEntityException('no_speech_detected');
    }
    if (/RequestTimeout|DeadlineExceeded|ETIMEDOUT|timed?\s*out/iu.test(detail)) {
      throw new ServiceUnavailableException('ai_timeout');
    }
    throw new ServiceUnavailableException('ai_upstream_failed');
  }

  private async recognize(url: string, model: TencentAsrModel, signal?: AbortSignal) {
    const deadline = Date.now() + this.config.aiAsrTimeoutMs;
    const client = this.sdk();
    try {
      const submitted = await this.cloudCall(() => client.CreateRecTask({
        EngineModelType: model,
        ChannelNum: 1,
        ResTextFormat: 0,
        SourceType: 0,
        Url: url,
      }), deadline, signal);
      const taskId = submitted.Data?.TaskId;
      if (typeof taskId !== 'number') throw new ServiceUnavailableException('ai_invalid_response');

      for (;;) {
        const response = await this.cloudCall(() => client.DescribeTaskStatus({ TaskId: taskId }), deadline, signal);
        const status = response.Data?.Status;
        if (status === 2) {
          const transcript = cleanTranscript(response.Data?.Result);
          if (!transcript) throw new UnprocessableEntityException('no_speech_detected');
          return {
            rawTranscript: transcript,
            meta: {
              attemptCount: 1,
              audioDurationSeconds: response.Data?.AudioDuration,
              upstreamStatus: 'success',
            } satisfies ProviderMeta,
          };
        }
        if (status === 3) this.mapProviderError(new Error(response.Data?.ErrorMsg || 'asr_task_failed'));
        if (status !== 0 && status !== 1) throw new ServiceUnavailableException('ai_invalid_response');
        await this.wait(deadline, signal);
      }
    } catch (error) {
      this.mapProviderError(error);
    }
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    model: TencentAsrModel,
    signal?: AbortSignal,
    correlationId?: string,
  ) {
    const staged = await this.audioStorage.stage(audio, mimeType, correlationId);
    try {
      return await this.recognize(staged.url, model, signal);
    } finally {
      await this.audioStorage.remove(staged.objectKey)
        .catch(() => this.logger.warn('asr_audio_cleanup_failed stage=request_finally'));
    }
  }
}
