import { describe, expect, it, vi } from 'vitest';

import { AiService } from '../src/ai/ai.service';
import { ObservedAiServiceException } from '../src/ai/ai-error-observability';

function database() {
  const values = vi.fn(() => ({ onConflictDoNothing: async () => undefined }));
  return {
    values,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'user-1' }] }) }) }),
      insert: () => ({ values }),
    },
  };
}

type ReviewCall = {
  mode: string;
  prompt: string;
  system: string;
  validate: (data: unknown) => unknown;
};

function reviewProvider(output: unknown) {
  return {
    generateValidated: vi.fn(async (input: ReviewCall) => ({ data: input.validate(output), meta: {} })),
    textModel: vi.fn(() => 'deepseek-v4-flash'),
  };
}

function service(output: unknown) {
  const review = reviewProvider(output);
  return {
    review,
    service: new AiService(database() as never, review as never, {} as never),
  };
}

describe('AiService DeepSeek review capabilities', () => {
  it('sends only the transcript to the unified grammar review and returns structured issues', async () => {
    const db = database();
    const review = reviewProvider({
      grammar: {
        correctedText: 'He has informed ATC.',
        issues: [{ before: 'He have', after: 'He has', reasonZh: '主语 He 为第三人称单数，应使用 has。' }],
      },
    });
    const ai = new AiService(db as never, review as never, {} as never);

    const result = await ai.review('user-1', 'request-1', {
      mode: 'grammar', module: 'opi', questionId: 'question-1', transcript: 'He have informed ATC.',
    });

    expect(result).toEqual({
      grammar: {
        correctedText: 'He has informed ATC.',
        issues: [{ before: 'He have', after: 'He has', reasonZh: '主语 He 为第三人称单数，应使用 has。' }],
      },
      promptVersion: 'deepseek-review:v1',
    });
    const call = review.generateValidated.mock.calls[0]![0];
    expect(call.mode).toBe('grammar');
    expect(JSON.parse(call.prompt)).toEqual({ transcript: 'He have informed ATC.' });
    expect(call.system).toContain('JSON object');
    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({ capability: 'grammar_review' }));
  });

  it('returns grammar and polish from one OPI provider call', async () => {
    const db = database();
    const review = reviewProvider({
      grammar: { correctedText: 'I encountered turbulence.', issues: [] },
      polishedText: 'I encountered turbulence.',
    });
    const ai = new AiService(db as never, review as never, {} as never);

    const result = await ai.review('user-1', 'request-2', {
      mode: 'opi', module: 'opi', questionId: 'question-2', transcript: 'I encountered turbulence.',
    });

    expect(result.polishedText).toBe('I encountered turbulence.');
    expect(review.generateValidated).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({ capability: 'polish' }));
  });

  it('keeps legacy grammar output compatible while using the structured provider', async () => {
    const { service: ai } = service({
      grammar: {
        correctedText: 'He has informed ATC.',
        issues: [{ before: 'He have', after: 'He has', reasonZh: '主谓一致错误。' }],
      },
    });

    const result = await ai.grammarReview('user-1', 'request-3', {
      module: 'opi', questionId: 'question-3', questionText: 'not sent', transcript: 'He have informed ATC.',
    });

    expect(result).toEqual({
      correctedText: 'He has informed ATC.',
      issues: ['“He have” → “He has”：主谓一致错误。'],
      promptVersion: 'deepseek-review:v1',
    });
  });

  it('keeps legacy polish output compatible while using DeepSeek', async () => {
    const { review, service: ai } = service({
      grammar: { correctedText: 'I informed ATC.', issues: [] },
      polishedText: 'I informed ATC.',
    });

    const result = await ai.polish('user-1', 'request-legacy-polish', {
      module: 'opi', questionId: 'question-polish', questionText: 'not sent', transcript: 'I tell ATC.', correctedText: 'I informed ATC.',
    });

    expect(result).toEqual({ polishedText: 'I informed ATC.', promptVersion: 'deepseek-review:v1' });
    const call = review.generateValidated.mock.calls[0]![0];
    expect(JSON.parse(call.prompt)).toEqual({ transcript: 'I informed ATC.' });
  });

  it('rejects invalid protected-token output before it reaches the client', async () => {
    const { service: ai } = service({
      grammar: {
        correctedText: 'We were maintaining FL190.',
        issues: [{ before: 'We was', after: 'We were', reasonZh: '主谓一致错误。' }],
      },
    });

    await expect(ai.review('user-1', 'request-4', {
      mode: 'grammar', module: 'atc', questionId: 'question-4', transcript: 'We was maintaining FL180.',
    })).rejects.toThrow();
  });

  it('records only the typed failure code, category, and attempt count for a failed request', async () => {
    const db = database();
    const review = {
      generateValidated: vi.fn(async () => {
        throw new ObservedAiServiceException('ai_invalid_response', 'invalid_response', 2, {
          attemptCount: 2,
          inputTokens: 24,
          outputTokens: 16,
          upstreamStatus: 'invalid_response',
        });
      }),
      textModel: vi.fn(() => 'deepseek-v4-flash'),
    };
    const ai = new AiService(db as never, review as never, {} as never);

    await expect(ai.review('user-1', 'request-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-5', transcript: 'Ready.',
    })).rejects.toThrow('ai_invalid_response');

    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({
      attemptCount: 2,
      failureCode: 'ai_invalid_response',
      inputTokens: 24,
      outputTokens: 16,
      quotaUnits: 0,
      requestId: 'request-failure',
      status: 'failed',
      upstreamStatus: 'invalid_response',
    }));
  });

  it('does not expose an unknown provider error while still logging a stable internal category', async () => {
    const db = database();
    const review = {
      generateValidated: vi.fn(async () => { throw new Error('provider secret and private detail'); }),
      textModel: vi.fn(() => 'deepseek-v4-flash'),
    };
    const ai = new AiService(db as never, review as never, {} as never);

    await expect(ai.review('user-1', 'request-private-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-6', transcript: 'Ready.',
    })).rejects.toThrow('ai_upstream_failed');

    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({
      failureCode: 'internal_error',
      requestId: 'request-private-failure',
      upstreamStatus: 'failed',
    }));
  });

  it('returns a successful paid result even when usage telemetry cannot be persisted', async () => {
    const failingValues = vi.fn(() => ({ onConflictDoNothing: async () => { throw new Error('database unavailable'); } }));
    const db = {
      values: failingValues,
      db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'user-1' }] }) }) }),
        insert: () => ({ values: failingValues }),
      },
    };
    const review = reviewProvider({
      grammar: { correctedText: 'Ready.', issues: [] },
    });
    const ai = new AiService(db as never, review as never, {} as never);

    await expect(ai.review('user-1', 'request-telemetry-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-7', transcript: 'Ready.',
    })).resolves.toMatchObject({ grammar: { correctedText: 'Ready.' } });
    expect(failingValues).toHaveBeenCalled();
  });
});
