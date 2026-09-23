import { describe, expect, it, vi } from 'vitest';

import type { TencentAsrModel } from '@icao/contracts';

import type { ApiConfig } from '../src/config';
import {
  AsrAudioStorageService,
  resolveAsrAudioFormat,
} from '../src/ai/asr-audio-storage.service';
import { TencentAsrService } from '../src/ai/tencent-asr.service';

function config(): ApiConfig {
  return {
    apiReleaseId: 'test',
    databaseUrl: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    host: '127.0.0.1',
    nodeEnv: 'test',
    port: 3101,
    supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
    supabasePublicUrl: 'https://cloud.example.com',
    supabaseSecretKey: 'test-secret-key-that-is-long-enough',
    supabaseUrl: 'http://supabase.internal:8000',
    inviteAuthSecret: 'test-invite-auth-secret-that-is-long-enough',
    accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough',
    appleIapBundleId: 'com.readyoufife.ios',
    appleIapRootCertificates: [],
    aiTextProvider: 'deepseek',
    deepseekApiKey: 'test-deepseek-key',
    deepseekBaseUrl: 'https://api.deepseek.com',
    aiGrammarModel: 'deepseek-v4-flash',
    aiPolishModel: 'deepseek-v4-flash',
    aiReviewMaxConcurrency: 50,
    tencentCloudSecretId: 'test-tencent-secret-id',
    tencentCloudSecretKey: 'test-tencent-secret-key',
    tencentAsrEndpoint: 'asr.tencentcloudapi.com',
    aiAsrStagingBucket: 'ai-transcription-inputs',
    aiAsrPollIntervalMs: 250,
    aiAsrTimeoutMs: 5_000,
    aiAsrSignedUrlTtlSeconds: 600,
    aiAsrStaleAudioTtlSeconds: 86_400,
    corsOrigins: ['http://localhost:8081'],
  };
}

function storage() {
  return {
    stage: vi.fn(async () => ({ objectKey: 'temporary-audio.wav', url: 'https://cloud.example.com/signed-audio' })),
    remove: vi.fn(async () => undefined),
  };
}

function service(client: object, overrides: Partial<ApiConfig> = {}) {
  const fakeStorage = storage();
  const instance = new TencentAsrService({ ...config(), ...overrides }, fakeStorage as unknown as AsrAudioStorageService);
  Reflect.set(instance, 'client', client);
  return { fakeStorage, instance };
}

describe('TencentAsrService', () => {
  it.each<TencentAsrModel>(['16k_zh_en_2.0', '16k_en_large', '16k_en'])(
    'sends the selected model %s without optimization parameters',
    async (model) => {
      const client = {
        CreateRecTask: vi.fn(async () => ({ Data: { TaskId: 42 } })),
        DescribeTaskStatus: vi.fn(async () => ({
          Data: {
            Status: 2,
            Result: '[0:0.000,0:2.500] cleared to land runway two seven',
            AudioDuration: 2.5,
          },
        })),
      };
      const { fakeStorage, instance } = service(client);

      const result = await instance.transcribe(
        Buffer.from('audio'),
        'audio/wav',
        model,
        undefined,
        'request-42',
      );

      expect(result.rawTranscript).toBe('cleared to land runway two seven');
      expect(result.meta.audioDurationSeconds).toBe(2.5);
      expect(client.CreateRecTask).toHaveBeenCalledWith({
        EngineModelType: model,
        ChannelNum: 1,
        ResTextFormat: 0,
        SourceType: 0,
        Url: 'https://cloud.example.com/signed-audio',
      });
      expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
      expect(fakeStorage.stage).toHaveBeenCalledWith(
        Buffer.from('audio'),
        'audio/wav',
        'request-42',
      );
    },
  );

  it.each<TencentAsrModel>(['16k_en', '16k_en_large', '16k_zh_en_2.0'])(
    'attaches account assets only to their matching English engine: %s', async (model) => {
      const client = {
        CreateRecTask: vi.fn<(request: Record<string, unknown>) => Promise<{ Data: { TaskId: number } }>>().mockResolvedValue({ Data: { TaskId: 90 } }),
        DescribeTaskStatus: vi.fn(async () => ({ Data: { Status: 2, Result: 'flight level 310' } })),
      };
      const { instance } = service(client, {
        tencentAsrHotwordId: 'a'.repeat(32), tencentAsrCustomizationId: 'b'.repeat(32),
      });
      const result = await instance.transcribe(Buffer.from('audio'), 'audio/wav', model);
      const request = client.CreateRecTask.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(request).toMatchObject({ EngineModelType: model });
      expect(request?.HotwordId).toBe(model === '16k_en' ? 'a'.repeat(32) : undefined);
      expect(request?.CustomizationId).toBe(model === '16k_en' ? 'b'.repeat(32) : undefined);
      expect(request).not.toHaveProperty('ReplaceTextId');
      expect(result.rawTranscript).toBe('flight level 310');
    },
  );

  it('polls early twice then returns to the configured interval, preserving the recognized words', async () => {
    const client = { CreateRecTask: vi.fn(async () => ({ Data: { TaskId: 7 } })),
      DescribeTaskStatus: vi.fn().mockResolvedValueOnce({ Data: { Status: 0 } }).mockResolvedValueOnce({ Data: { Status: 1 } }).mockResolvedValueOnce({ Data: { Status: 1 } }).mockResolvedValue({ Data: { Status: 2, Result: 'do not cross runway 27' } }) };
    const { instance } = service(client, { aiAsrPollIntervalMs: 2000 });
    const waits: number[] = [];
    Reflect.set(instance, 'wait', async (_deadline: number, _signal: unknown, duration: number) => { waits.push(duration); });
    const result = await instance.transcribe(Buffer.from('audio'), 'audio/wav', '16k_en');
    expect(waits.filter((value) => value >= 500)).toEqual([500, 1000, 2000]);
    expect(result.rawTranscript).toBe('do not cross runway 27');
    expect(result.meta.timings?.pollCount).toBe(4);
  });

  it('maps an empty successful response to no speech and still removes staged audio', async () => {
    const { fakeStorage, instance } = service({
      CreateRecTask: vi.fn(async () => ({ Data: { TaskId: 43 } })),
      DescribeTaskStatus: vi.fn(async () => ({ Data: { Status: 2, Result: '' } })),
    });

    await expect(instance.transcribe(Buffer.from('silence'), 'audio/webm', '16k_en'))
      .rejects.toThrow('no_speech_detected');
    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
  });

  it('maps Tencent request throttling to the stable limited error', async () => {
    const { fakeStorage, instance } = service({
      CreateRecTask: vi.fn(async () => { throw Object.assign(new Error('too many requests'), { code: 'RequestLimitExceeded' }); }),
      DescribeTaskStatus: vi.fn(),
    });

    await expect(instance.transcribe(Buffer.from('audio'), 'audio/m4a', '16k_en_large'))
      .rejects.toThrow('ai_upstream_limited');
    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
  });

  it('maps an unavailable Tencent balance to the stable non-retryable error', async () => {
    const { instance } = service({
      CreateRecTask: vi.fn(async () => { throw Object.assign(new Error('no package'), { code: 'FailedOperation.UserHasNoAmount' }); }),
      DescribeTaskStatus: vi.fn(),
    });

    await expect(instance.transcribe(Buffer.from('audio'), 'audio/wav', '16k_zh_en_2.0'))
      .rejects.toThrow('ai_upstream_balance_insufficient');
  });

  it.each([
    ['AuthFailure.SignatureFailure', 'ai_upstream_auth_failed'],
    ['RequestTimeout', 'ai_timeout'],
  ])('maps Tencent error %s to %s', async (providerCode, expectedCode) => {
    const { fakeStorage, instance } = service({
      CreateRecTask: vi.fn(async () => { throw Object.assign(new Error(providerCode), { code: providerCode }); }),
      DescribeTaskStatus: vi.fn(),
    });

    await expect(instance.transcribe(Buffer.from('audio'), 'audio/m4a', '16k_en'))
      .rejects.toThrow(expectedCode);
    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
  });

  it('keeps a successful transcript while surfacing a safe cleanup warning', async () => {
    const { fakeStorage, instance } = service({
      CreateRecTask: vi.fn(async () => ({ Data: { TaskId: 44 } })),
      DescribeTaskStatus: vi.fn(async () => ({ Data: { Status: 2, Result: 'ready for departure' } })),
    });
    fakeStorage.remove.mockRejectedValueOnce(new Error('storage provider detail'));
    const logger = Reflect.get(instance, 'logger') as { warn: (message: string) => void };
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    await expect(instance.transcribe(Buffer.from('audio'), 'audio/m4a', '16k_en'))
      .resolves.toMatchObject({ rawTranscript: 'ready for departure' });
    expect(warning).toHaveBeenCalledWith('asr_audio_cleanup_failed stage=request_finally');
  });
});

describe('AsrAudioStorageService stale cleanup', () => {
  it('runs stale cleanup on service startup and releases its timer on shutdown', async () => {
    const instance = new AsrAudioStorageService({ ...config(), nodeEnv: 'production' });
    const cleanup = vi.spyOn(instance, 'cleanupStale').mockResolvedValue(undefined);

    instance.onModuleInit();
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    expect(Reflect.get(instance, 'cleanupTimer')).toBeDefined();

    instance.onModuleDestroy();
  });

  it('re-reads the oldest page until every stale object in the bounded pass is removed', async () => {
    const staleCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString();
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      created_at: staleCreatedAt,
      name: `stale-${index}.m4a`,
    }));
    const secondPage = [{ created_at: staleCreatedAt, name: 'stale-final.m4a' }];
    const bucket = {
      list: vi.fn()
        .mockResolvedValueOnce({ data: firstPage, error: null })
        .mockResolvedValueOnce({ data: secondPage, error: null }),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const instance = new AsrAudioStorageService(config());
    Reflect.set(instance, 'storage', { storage: { from: () => bucket } });

    await instance.cleanupStale();

    expect(bucket.list).toHaveBeenCalledTimes(2);
    expect(bucket.remove).toHaveBeenNthCalledWith(1, firstPage.map((entry) => entry.name));
    expect(bucket.remove).toHaveBeenNthCalledWith(2, ['stale-final.m4a']);
  });

  it('does not silently accept a failed stale-object listing', async () => {
    const bucket = {
      list: vi.fn(async () => ({ data: null, error: new Error('provider detail') })),
      remove: vi.fn(),
    };
    const instance = new AsrAudioStorageService(config());
    Reflect.set(instance, 'storage', { storage: { from: () => bucket } });

    await expect(instance.cleanupStale()).rejects.toThrow('asr_audio_cleanup_list_failed');
  });
});

describe('resolveAsrAudioFormat', () => {
  it('removes MediaRecorder codec parameters before staging browser WebM audio', () => {
    expect(resolveAsrAudioFormat('audio/webm;codecs=opus')).toEqual({
      contentType: 'audio/webm',
      extension: 'webm',
    });
  });

  it('normalizes MIME casing and whitespace', () => {
    expect(resolveAsrAudioFormat(' Audio/MP4 ; codecs=mp4a.40.2')).toEqual({
      contentType: 'audio/mp4',
      extension: 'm4a',
    });
  });

  it.each(['audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/x-pn-wav'])(
    'canonicalizes the iOS WAV alias %s before storage upload',
    (mimeType) => {
      expect(resolveAsrAudioFormat(mimeType)).toEqual({
        contentType: 'audio/wav',
        extension: 'wav',
      });
    },
  );

  it('canonicalizes the non-standard iOS M4A alias before storage upload', () => {
    expect(resolveAsrAudioFormat('audio/x-m4a')).toEqual({
      contentType: 'audio/mp4',
      extension: 'm4a',
    });
  });
});
