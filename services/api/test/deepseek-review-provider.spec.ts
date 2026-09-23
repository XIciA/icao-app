import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeepSeekReviewProviderService } from '../src/ai/deepseek-review-provider.service';
import { loadConfig } from '../src/config';
import { learningReviewPrompt, validateLearningReview } from '../src/ai/learning-review';

function config(maxConcurrency = '50') {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    SUPABASE_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLIC_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-that-is-long-enough',
    SUPABASE_SECRET_KEY: 'test-secret-key-that-is-long-enough',
    INVITE_AUTH_SECRET: 'test-invite-auth-secret-that-is-long-enough',
    ACCOUNT_IDENTITY_HASH_SECRET: 'test-account-identity-secret-that-is-long-enough',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    AI_REVIEW_MAX_CONCURRENCY: maxConcurrency,
  });
}

function response(content: string, finishReason = 'stop') {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { prompt_tokens: 12, completion_tokens: 8 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DeepSeekReviewProviderService', () => {
  it('uses the fixed low-cost DeepSeek request parameters', async () => {
    const fetchMock = vi.fn(async () => response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    const result = await provider.generateValidated({
      mode: 'grammar',
      system: 'Return JSON.',
      prompt: '{"transcript":"Ready."}',
      userId: 'private-user-id',
      validate: (data) => data as { ok: boolean },
    });

    expect(result).toEqual({
      data: { ok: true },
      meta: { attemptCount: 1, inputTokens: 12, outputTokens: 8, upstreamStatus: 'success', timings: { queueMs: expect.any(Number), generationMs: expect.any(Number) } },
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const request = JSON.parse(String(calls[0]![1].body));
    expect(request).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 2048,
      stream: false,
    });
    expect(request).not.toHaveProperty('user_id');
  });

  it('retries invalid JSON once and returns only validated data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(''))
      .mockResolvedValueOnce(response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    const result = await provider.generateValidated({
      mode: 'opi', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data as { ok: boolean },
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.meta).toMatchObject({ attemptCount: 2, upstreamStatus: 'recovered' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('repairs a model refusal of a short answer into evidence-backed feedback', async () => {
    const input = { module: 'atc' as const, mode: 'grammar' as const, questionId: 'q', transcript: 'My life.' };
    const materials = { questionText: 'Contact company operations to offload the baggage.', contextText: '', referenceText: '', hasUnseenImage: false };
    const feedback = { grammarErrors: [], missingInformation: [{ sourceQuote: materials.questionText, reasonZh: '没有向公司运行部门提出卸下行李的请求' }], incorrectInformation: [], extraInformation: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify({ error: { code: 'invalid_answer', reasonZh: '回答太短' } })))
      .mockResolvedValueOnce(response(JSON.stringify(feedback)));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new DeepSeekReviewProviderService(config()).generateValidated({
      mode: input.mode, system: learningReviewPrompt(input.module), prompt: JSON.stringify({ ...materials, answerText: input.transcript }), userId: 'user-1',
      validate: (data) => validateLearningReview(data, input, materials),
    });
    expect(result.data.analysis).toEqual({ module: 'atc', ...feedback });
    expect(result.meta).toMatchObject({ attemptCount: 2, upstreamStatus: 'recovered' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not convert repeated model refusals to success or a learner input error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(JSON.stringify({ error: { code: 'invalid_answer', reasonZh: '回答太短' } }))));
    const input = { module: 'atc' as const, mode: 'grammar' as const, questionId: 'q', transcript: 'FL310.' };
    const materials = { questionText: 'Report fuel endurance.', contextText: '', referenceText: '', hasUnseenImage: false };
    await expect(new DeepSeekReviewProviderService(config()).generateValidated({
      mode: input.mode, system: learningReviewPrompt(input.module), prompt: JSON.stringify({ ...materials, answerText: input.transcript }), userId: 'user-1',
      validate: (data) => validateLearningReview(data, input, materials),
    })).rejects.toMatchObject({ failureCode: 'ai_invalid_response', attemptCount: 2 });
  });

  it('preserves metered token metadata when both repair attempts are invalid', async () => {
    const fetchMock = vi.fn(async () => response(''));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    await expect(provider.generateValidated({
      mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data,
    })).rejects.toMatchObject({
      attemptCount: 2,
      failureCode: 'ai_invalid_response',
      meta: {
        attemptCount: 2,
        inputTokens: 24,
        outputTokens: 16,
        upstreamStatus: 'invalid_response',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-recoverable authentication errors', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    await expect(provider.generateValidated({
      mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data,
    })).rejects.toThrow('ai_upstream_auth_failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, 'ai_upstream_limited'],
    [500, 'ai_upstream_failed'],
    [503, 'ai_upstream_failed'],
  ])('does not repeat a potentially chargeable request after HTTP %s', async (status, code) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    await expect(provider.generateValidated({
      mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data,
    })).rejects.toThrow(code);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a timed out provider request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config());

    const pending = provider.generateValidated({
      mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data,
    });
    const observed = expect(pending).rejects.toThrow('ai_timeout');
    await vi.advanceTimersByTimeAsync(20_001);
    await observed;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('queues requests above the configured in-memory concurrency limit', async () => {
    let finishFirst!: (value: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(response('{"request":2}'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config('1'));
    const first = provider.generateValidated({ mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-1', validate: (data) => data });
    const second = provider.generateValidated({ mode: 'grammar', system: 'Return JSON.', prompt: '{}', userId: 'user-2', validate: (data) => data });

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishFirst(response('{"request":1}'));
    await expect(first).resolves.toMatchObject({ data: { request: 1 } });
    await expect(second).resolves.toMatchObject({ data: { request: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('removes timed-out queue entries so they cannot execute later or consume another slot', async () => {
    vi.useFakeTimers();
    let finishFirst!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finishFirst = resolve; })).mockResolvedValue(response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new DeepSeekReviewProviderService(config('1'));
    const input = { mode: 'grammar' as const, system: 'Return JSON.', prompt: '{}', userId: 'user', validate: (data: unknown) => data };
    const first = provider.generateValidated(input);
    const queued = expect(provider.generateValidated(input)).rejects.toThrow('ai_upstream_limited');
    await vi.advanceTimersByTimeAsync(15_001); await queued;
    finishFirst(response('{"ok":true}')); await first;
    await expect(provider.generateValidated(input)).resolves.toMatchObject({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
