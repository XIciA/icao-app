import { describe, expect, it, vi } from 'vitest';

import { AiController } from '../src/ai/ai.controller';

function request() {
  return {
    id: 'request-1',
    user: { id: 'user-1' },
    raw: { once: vi.fn() },
  };
}

describe('AiController review endpoint', () => {
  it('returns the authenticated account current consent status', async () => {
    const status = { accepted: false, policyVersion: 'ai-learning-privacy-v4' as const };
    const consentStatus = vi.fn(async () => status);
    const controller = new AiController({ consentStatus } as never);

    await expect(controller.consentStatus(request() as never)).resolves.toEqual({ requestId: 'request-1', data: status });
    expect(consentStatus).toHaveBeenCalledWith('user-1');
  });

  it('rejects accepting a superseded policy version', async () => {
    const acceptConsent = vi.fn();
    const controller = new AiController({ acceptConsent } as never);

    await expect(controller.consent({
      accepted: true,
      policyVersion: 'ai-learning-privacy-v3',
    }, request() as never)).rejects.toThrow('invalid_ai_consent');
    expect(acceptConsent).not.toHaveBeenCalled();
  });

  it('passes a valid unified review request to the service', async () => {
    const result = {
      grammar: { issues: [], correctedText: 'We were ready.' },
      promptVersion: 'deepseek-review:v1' as const,
    };
    const review = vi.fn(async () => result);
    const controller = new AiController({ review } as never);
    const body = { mode: 'grammar' as const, module: 'atc' as const, questionId: 'q-1', transcript: 'We were ready.' };

    await expect(controller.review(body, request() as never)).resolves.toEqual({ requestId: 'request-1', data: result });
    expect(review).toHaveBeenCalledWith('user-1', 'request-1', body, expect.any(AbortSignal));
  });

  it('rejects an OPI review with a non-OPI module', async () => {
    const controller = new AiController({ review: vi.fn() } as never);
    await expect(controller.review({
      mode: 'opi', module: 'atc', questionId: 'q-2', transcript: 'Ready.',
    }, request() as never)).rejects.toThrow('invalid_ai_review');
  });
});
