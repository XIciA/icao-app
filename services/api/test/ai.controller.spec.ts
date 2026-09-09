import { describe, expect, it, vi } from 'vitest';

import { COMMERCE_ENVIRONMENT_HEADER } from '@icao/contracts';

import { AiController } from '../src/ai/ai.controller';

function request(headers: Record<string, string> = {}) {
  return {
    headers,
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

  it('issues the explicit Native consent challenge only for the current flow revision', async () => {
    const challenge = {
      challenge: 'challenge-token-12345678901234567890',
      expiresAt: '2026-08-25T00:05:00.000Z',
      flowRevision: 'native-explicit-consent-v1' as const,
      policyVersion: 'ai-learning-privacy-v4' as const,
    };
    const issueConsentChallenge = vi.fn(async () => challenge);
    const controller = new AiController({ issueConsentChallenge } as never);

    await expect(controller.consentChallenge({
      flowRevision: 'native-explicit-consent-v1',
      policyVersion: 'ai-learning-privacy-v4',
    }, request() as never)).resolves.toEqual({ requestId: 'request-1', data: challenge });
    expect(issueConsentChallenge).toHaveBeenCalledWith('user-1');

    await expect(controller.consentChallenge({
      flowRevision: 'legacy-auto-consent-v0',
      policyVersion: 'ai-learning-privacy-v4',
    }, request() as never)).rejects.toThrow('invalid_ai_consent_challenge');
  });

  it('passes a valid unified review request to the service', async () => {
    const result = {
      grammar: { issues: [], correctedText: 'We were ready.' },
      promptVersion: 'deepseek-review:v1' as const,
    };
    const grant = {
      userId: 'user-1', policyVersion: 'ai-learning-privacy-v4' as const,
      consentRevision: 1, nonce: 'grant-1', expiresAt: Date.now() + 60_000,
    };
    const admitOperation = vi.fn(async () => grant);
    const review = vi.fn(async () => result);
    const controller = new AiController({ admitOperation, review } as never);
    const body = { mode: 'grammar' as const, module: 'atc' as const, questionId: 'q-1', transcript: 'We were ready.' };

    await expect(controller.review(body, request({
      'x-ai-operation-id': '82000000-0000-4000-8000-000000000001',
    }) as never)).resolves.toEqual({ requestId: 'request-1', data: result });
    expect(admitOperation).toHaveBeenCalledWith('user-1');
    expect(review).toHaveBeenCalledWith(
      'user-1',
      'request-1',
      body,
      grant,
      expect.any(AbortSignal),
      '82000000-0000-4000-8000-000000000001',
    );
  });

  it('rejects a malformed AI operation id before admitting provider work', async () => {
    const admitOperation = vi.fn();
    const review = vi.fn();
    const controller = new AiController({ admitOperation, review } as never);

    await expect(controller.review({
      mode: 'grammar', module: 'atc', questionId: 'q-1', transcript: 'Ready.',
    }, request({ 'x-ai-operation-id': 'not-an-operation-id' }) as never)).rejects.toThrow('invalid_ai_operation_id');
    expect(admitOperation).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects an OPI review with a non-OPI module', async () => {
    const controller = new AiController({ admitOperation: vi.fn(async () => ({})), review: vi.fn() } as never);
    await expect(controller.review({
      mode: 'opi', module: 'atc', questionId: 'q-2', transcript: 'Ready.',
    }, request() as never)).rejects.toThrow('invalid_ai_review');
  });
});

describe('AiController authorized commerce environment and combined request', () => {
  it('rejects an unverified sandbox header before uploading or performing provider work', async () => {
    const admitOperation = vi.fn();
    const file = vi.fn();
    const authorize = vi.fn(async () => { throw new Error('commerce_sandbox_session_not_authorized'); });
    const controller = new AiController({ admitOperation } as never, { assertEnvironmentAuthorized: authorize } as never);
    await expect(controller.transcribeReview({ ...request({ [COMMERCE_ENVIRONMENT_HEADER]: 'sandbox' }), auth: { sessionId: 'session-1' }, file } as never)).rejects.toThrow('commerce_sandbox_session_not_authorized');
    expect(authorize).toHaveBeenCalledWith('user-1', 'session-1', 'sandbox', expect.any(Date));
    expect(admitOperation).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it('passes one multipart audio, validated review context and stable operation id', async () => {
    const grant = { environment: 'sandbox' };
    const admitOperation = vi.fn(async () => grant);
    const transcribeReview = vi.fn(async () => ({ transcript: 'Ready.', review: {} }));
    const authorize = vi.fn(async () => undefined);
    const controller = new AiController({ admitOperation, transcribeReview } as never, { assertEnvironmentAuthorized: authorize } as never);
    const file = { mimetype: 'audio/wav', toBuffer: async () => Buffer.from('audio'), fields: Object.fromEntries(Object.entries({ mode: 'opi', module: 'opi', questionId: 'q-1', model: '16k_en' }).map(([key, value]) => [key, { type: 'field', value }])) };
    const headers = { [COMMERCE_ENVIRONMENT_HEADER]: 'sandbox', 'x-ai-operation-id': '82000000-0000-4000-8000-000000000002' };
    await controller.transcribeReview({ ...request(headers), auth: { sessionId: 'session-1' }, file: async () => file } as never);
    expect(admitOperation).toHaveBeenCalledExactlyOnceWith('user-1', 'sandbox');
    expect(transcribeReview).toHaveBeenCalledExactlyOnceWith('user-1', 'request-1', Buffer.from('audio'), 'audio/wav', '16k_en', { mode: 'opi', module: 'opi', questionId: 'q-1' }, grant, expect.any(AbortSignal), headers['x-ai-operation-id']);
    file.fields.module = { type: 'field', value: 'atc' };
    await expect(controller.transcribeReview({ ...request(headers), auth: { sessionId: 'session-1' }, file: async () => file } as never)).rejects.toThrow('invalid_transcribe_review');
    expect(transcribeReview).toHaveBeenCalledTimes(1);
  });
});


describe('AI operation result recovery', () => {
  it('returns owned results without consent or current membership admission', async () => {
    const operationResult = vi.fn(async () => ({ state: 'completed', capability: 'transcription', result: { transcript: 'Ready.' } }));
    const admitOperation = vi.fn();
    const controller = new AiController({ operationResult, admitOperation } as never);
    const id = '82000000-0000-4000-8000-000000000099';
    expect((await controller.operation(id, request() as never)).data).toMatchObject({ state: 'completed' });
    expect(operationResult).toHaveBeenCalledExactlyOnceWith('user-1', 'production', id);
    expect(admitOperation).not.toHaveBeenCalled();
    await expect(controller.operation('bad', request() as never)).rejects.toThrow('invalid_ai_operation_id');
  });

  it('checks sandbox authorization before any result read', async () => {
    const operationResult = vi.fn();
    const authorize = vi.fn(async () => { throw new Error('commerce_sandbox_session_not_authorized'); });
    const controller = new AiController({ operationResult } as never, { assertEnvironmentAuthorized: authorize } as never);
    await expect(controller.operation('82000000-0000-4000-8000-000000000099', {
      ...request({ [COMMERCE_ENVIRONMENT_HEADER]: 'sandbox' }), auth: { sessionId: 'session-1' },
    } as never)).rejects.toThrow('commerce_sandbox_session_not_authorized');
    expect(operationResult).not.toHaveBeenCalled();
  });
});
