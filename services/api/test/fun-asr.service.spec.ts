import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import {
  resolveAsrAudioFormat,
  type AsrAudioStorageService,
} from '../src/ai/asr-audio-storage.service';
import { FunAsrService } from '../src/ai/fun-asr.service';

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
    dashscopeApiKey: 'test-dashscope-key',
    dashscopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    dashscopeAsrBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    aiTextModel: 'qwen-turbo',
    aiAsrModel: 'fun-asr-2025-11-07',
    aiAsrHotwordsMode: 'vocabulary',
    aiAsrVocabularyId: 'vocab-icaoasr-test',
    aiAsrHotwordsVersion: 'aviation-hotwords:v1',
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

describe('FunAsrService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits the configured hotword list, returns the raw text, and cleans up', async () => {
    const fakeStorage = storage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: 'task-1', task_status: 'PENDING' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          task_id: 'task-1',
          task_status: 'SUCCEEDED',
          results: [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://results.example.com/task-1.json' }],
        },
        usage: { duration: 7.25 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        transcripts: [{ text: 'I has turbulence at flight level two niner zero' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new FunAsrService(config(), fakeStorage as unknown as AsrAudioStorageService)
      .transcribe(Buffer.from('audio'), 'audio/wav');

    expect(result.rawTranscript).toBe('I has turbulence at flight level two niner zero');
    expect(result.meta.audioDurationSeconds).toBe(7.25);
    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
    const submit = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(submit[1]?.body));
    expect(body).toMatchObject({
      model: 'fun-asr-2025-11-07',
      input: { file_urls: ['https://cloud.example.com/signed-audio'] },
      parameters: { language_hints: ['en'], vocabulary_id: 'vocab-icaoasr-test' },
    });
  });

  it('omits vocabulary_id for an explicit no-hotword evaluation URL', async () => {
    const fakeStorage = storage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: 'task-none', task_status: 'PENDING' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          results: [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://results.example.com/task-none.json' }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ text: 'clear to land' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new FunAsrService(config(), fakeStorage as unknown as AsrAudioStorageService)
      .transcribeUrlForEvaluation('https://cloud.example.com/question-audio', { mode: 'none' });

    expect(result.rawTranscript).toBe('clear to land');
    expect(fakeStorage.stage).not.toHaveBeenCalled();
    expect(fakeStorage.remove).not.toHaveBeenCalled();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.parameters).not.toHaveProperty('vocabulary_id');
  });

  it('omits vocabulary_id for the configured production no-hotword mode', async () => {
    const fakeStorage = storage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: 'task-configured-none', task_status: 'PENDING' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          results: [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://results.example.com/task-configured-none.json' }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ text: 'clear to land' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const noHotwords = { ...config(), aiAsrHotwordsMode: 'none' as const, aiAsrVocabularyId: undefined };

    await new FunAsrService(noHotwords, fakeStorage as unknown as AsrAudioStorageService)
      .transcribe(Buffer.from('audio'), 'audio/wav');

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.parameters).not.toHaveProperty('vocabulary_id');
  });

  it('uses an isolated vocabulary override for candidate evaluation', async () => {
    const fakeStorage = storage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: 'task-candidate', task_status: 'PENDING' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          results: [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://results.example.com/task-candidate.json' }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ text: 'QNH one zero one three' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new FunAsrService(config(), fakeStorage as unknown as AsrAudioStorageService)
      .transcribeUrlForEvaluation('https://cloud.example.com/question-audio', {
        mode: 'vocabulary',
        vocabularyId: 'vocab-isolated-candidate',
      });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.parameters.vocabulary_id).toBe('vocab-isolated-candidate');
  });

  it('cleans up the staged audio when the provider rejects the task', async () => {
    const fakeStorage = storage();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    await expect(new FunAsrService(config(), fakeStorage as unknown as AsrAudioStorageService)
      .transcribe(Buffer.from('audio'), 'audio/wav')).rejects.toThrow('ai_upstream_failed');

    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
  });

  it('maps the provider no-words result to a user-correctable error', async () => {
    const fakeStorage = storage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: { task_id: 'task-no-words', task_status: 'PENDING' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          code: 'ASR_RESPONSE_HAVE_NO_WORDS',
          message: 'ASR_RESPONSE_HAVE_NO_WORDS',
          task_id: 'task-no-words',
          task_status: 'FAILED',
        },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new FunAsrService(config(), fakeStorage as unknown as AsrAudioStorageService)
      .transcribe(Buffer.from('silent audio'), 'audio/webm')).rejects.toThrow('no_speech_detected');

    expect(fakeStorage.remove).toHaveBeenCalledWith('temporary-audio.wav');
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
});
