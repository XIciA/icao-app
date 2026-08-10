import { describe, expect, it, vi } from 'vitest';

import type { TencentAsrModel } from '@icao/contracts';

import type { ApiConfig } from '../src/config';
import {
  resolveAsrAudioFormat,
  type AsrAudioStorageService,
} from '../src/ai/asr-audio-storage.service';
import { TencentAsrService } from '../src/ai/tencent-asr.service';

function config(): ApiConfig {
  return {
    databaseUrl: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    host: '127.0.0.1',
    nodeEnv: 'test',
    port: 3101,
    supabasePublishableKey: 'test-publishable-key-that-is-long-enough',
    supabasePublicUrl: 'https://cloud.example.com',
    supabaseSecretKey: 'test-secret-key-that-is-long-enough',
    supabaseUrl: 'http://supabase.internal:8000',
    inviteAuthSecret: 'test-invite-auth-secret-that-is-long-enough',
    dashscopeApiKey: 'test-dashscope-key',
    dashscopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    aiTextModel: 'qwen-turbo',
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

function service(client: object) {
  const fakeStorage = storage();
  const instance = new TencentAsrService(config(), fakeStorage as unknown as AsrAudioStorageService);
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

      const result = await instance.transcribe(Buffer.from('audio'), 'audio/wav', model);

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
    },
  );

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

  it('reports when the selected Tencent model has no activated quota', async () => {
    const { instance } = service({
      CreateRecTask: vi.fn(async () => { throw Object.assign(new Error('no package'), { code: 'FailedOperation.UserHasNoAmount' }); }),
      DescribeTaskStatus: vi.fn(),
    });

    await expect(instance.transcribe(Buffer.from('audio'), 'audio/wav', '16k_zh_en_2.0'))
      .rejects.toThrow('asr_model_unavailable');
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
