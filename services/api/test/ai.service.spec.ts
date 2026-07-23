import { describe, expect, it, vi } from 'vitest';

import { AiService } from '../src/ai/ai.service';

type GenerateJsonCalls = { mock: { calls: Array<[string, string]> } };

function database() {
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'user-1' }] }) }) }),
      insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    },
  };
}

describe('AiService v2 text capabilities', () => {
  it('sends only transcript to the fixed grammar prompt and accepts an empty issue list', async () => {
    const generateJson = vi.fn(async () => ({ data: { correctedText: 'I am ready.', issues: [] }, meta: {} }));
    const service = new AiService(database() as never, {} as never, { generateJson, textModel: () => 'qwen-turbo' } as never, {} as never);

    const result = await service.grammarReview('user-1', 'request-1', {
      module: 'opi', questionId: 'question-1', questionText: 'Unused question context', transcript: 'I am ready.',
    });

    expect(result).toEqual({ correctedText: 'I am ready.', issues: [], promptVersion: 'grammar-review:v2' });
    const [system, prompt] = (generateJson as unknown as GenerateJsonCalls).mock.calls[0]!;
    expect(system).toContain('English grammar checker');
    expect(system).not.toContain('aviation');
    expect(JSON.parse(prompt)).toEqual({ transcript: 'I am ready.' });
  });

  it('rejects grammar output with a removed or extra field', async () => {
    const generateJson = vi.fn(async () => ({ data: { correctedText: 'I am ready.', issues: [], overallFeedbackZh: 'obsolete' }, meta: {} }));
    const service = new AiService(database() as never, {} as never, { generateJson, textModel: () => 'qwen-turbo' } as never, {} as never);

    await expect(service.grammarReview('user-1', 'request-1', {
      module: 'opi', questionId: 'question-1', questionText: 'Unused question context', transcript: 'I am ready.',
    })).rejects.toThrow();
  });

  it('uses corrected text only when supplied to the fixed OPI polish prompt', async () => {
    const generateJson = vi.fn(async () => ({ data: { polishedText: 'I informed ATC.' }, meta: {} }));
    const service = new AiService(database() as never, {} as never, { generateJson, textModel: () => 'qwen-turbo' } as never, {} as never);

    const result = await service.polish('user-1', 'request-2', {
      module: 'opi', questionId: 'question-2', questionText: 'Unused question context', transcript: 'I tell ATC.', correctedText: 'I inform ATC.',
    });

    expect(result).toEqual({ polishedText: 'I informed ATC.', promptVersion: 'polish:v2' });
    const [system, prompt] = (generateJson as unknown as GenerateJsonCalls).mock.calls[0]!;
    expect(system).toContain('English speaking-expression editor');
    expect(JSON.parse(prompt)).toEqual({ transcript: 'I tell ATC.', correctedText: 'I inform ATC.' });
  });

  it('rejects polish output with an extra field', async () => {
    const generateJson = vi.fn(async () => ({ data: { polishedText: 'I informed ATC.', issues: [] }, meta: {} }));
    const service = new AiService(database() as never, {} as never, { generateJson, textModel: () => 'qwen-turbo' } as never, {} as never);

    await expect(service.polish('user-1', 'request-2', {
      module: 'opi', questionId: 'question-2', questionText: 'Unused question context', transcript: 'I tell ATC.',
    })).rejects.toThrow();
  });
});
