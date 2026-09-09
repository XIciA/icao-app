import { describe, expect, it, vi } from 'vitest';
import { CURRENT_AI_CONSENT_FLOW_REVISION, CURRENT_AI_CONSENT_POLICY_VERSION } from '@icao/contracts';

import { AiService } from '../src/ai/ai.service';
import { ObservedAiServiceException } from '../src/ai/ai-error-observability';
import { AiController } from '../src/ai/ai.controller';
import { aiConsentAuthorities, aiConsentChallenges, aiConsents } from '../src/database/schema';

type ConsentRow = {
  userId: string;
  policyVersion: string;
  acceptedAt: Date;
  revision: number;
  revokedAt: Date | null;
};

type ConsentAuthorityRow = {
  userId: string;
  policyVersion: string;
  revision: number;
  active: boolean;
  updatedAt: Date;
};

function authorityFor(consent: ConsentRow | null): ConsentAuthorityRow | null {
  return consent ? {
    userId: consent.userId,
    policyVersion: consent.policyVersion,
    revision: consent.revision,
    active: consent.revokedAt === null,
    updatedAt: consent.acceptedAt,
  } : null;
}

function database(consent: ConsentRow | null = {
  userId: 'user-1',
  policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
  acceptedAt: new Date('2026-08-14T00:00:00.000Z'),
  revision: 1,
  revokedAt: null,
}) {
  const authority = authorityFor(consent);
  const values = vi.fn(() => ({ onConflictDoNothing: async () => undefined }));
  const transaction = {
    execute: vi.fn(async () => undefined),
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === aiConsentAuthorities
        ? (authority ? [authority] : [])
        : (consent ? [consent] : []),
    }) }) }),
    insert: () => ({ values }),
  };
  return {
    values,
    db: {
      ...transaction,
      transaction: <T>(action: (value: typeof transaction) => Promise<T>) => action(transaction),
    },
  };
}

async function operationGrant(ai: AiService, userId = 'user-1') {
  return ai.admitOperation(userId);
}

function consentDatabase(initialConsent: ConsentRow | null = {
  userId: 'user-1',
  policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
  acceptedAt: new Date('2026-08-14T00:00:00.000Z'),
  revision: 1,
  revokedAt: null,
}) {
  let consent = initialConsent;
  let authority = authorityFor(initialConsent);
  let challenges: Array<Record<string, unknown>> = [];
  let transactionTail = Promise.resolve();
  const execute = vi.fn<(query: unknown) => Promise<void>>();
  execute.mockResolvedValue(undefined);
  const transaction = {
    execute,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === aiConsents) return consent ? [consent] : [];
            if (table === aiConsentAuthorities) return authority ? [authority] : [];
            return challenges.slice(0, 1);
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table === aiConsentChallenges) challenges = [];
        if (table === aiConsents) consent = null;
      },
    }),
    update: (table: unknown) => ({
      set: (update: Partial<ConsentRow>) => ({
        where: async () => {
          if (table === aiConsents && consent) consent = { ...consent, ...update };
          if (table === aiConsentAuthorities && authority) {
            authority = { ...authority, ...update } as ConsentAuthorityRow;
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        if (table === aiConsentChallenges) {
          challenges = [value];
          return Promise.resolve();
        }
        if (table === aiConsents) {
          return {
            onConflictDoUpdate: async () => {
              consent = value as ConsentRow;
            },
          };
        }
        if (table === aiConsentAuthorities) {
          return {
            onConflictDoUpdate: async () => {
              authority = value as ConsentAuthorityRow;
            },
          };
        }
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  };
  const db = {
    ...transaction,
    transaction<T>(action: (value: typeof transaction) => Promise<T>) {
      const result = transactionTail.then(() => action(transaction));
      transactionTail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return {
    database: { db },
    execute,
    state: () => ({ authority, consent, challenges: [...challenges] }),
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

function pointBenefits() {
  return {
    reserveAiPoints: vi.fn(async () => ({ state: 'execute', operationId: 'request-1', points: 3 })),
    settleAiPoints: vi.fn(async (_transaction: unknown, input: { operationId: string; result: Record<string, unknown> }) => ({
      ...input.result,
      aiPoints: {
        operationId: input.operationId,
        ruleVersion: 'ai-points-v1',
        estimated: 3,
        charged: 3,
        remaining: 97,
      },
    })),
    releaseAiPoints: vi.fn(async () => ({ changed: true })),
  };
}

function service(output: unknown) {
  const review = reviewProvider(output);
  return {
    review,
    service: new AiService(database() as never, review as never, {} as never, pointBenefits() as never),
  };
}

describe('AiService DeepSeek review capabilities', () => {
  it('keeps a legacy v4 POST idempotent without refreshing an existing acceptance', async () => {
    const fixture = consentDatabase();
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);

    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
    })).resolves.toEqual({
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      acceptedAt: '2026-08-14T00:00:00.000Z',
    });
    expect(fixture.state().consent).toMatchObject({
      acceptedAt: new Date('2026-08-14T00:00:00.000Z'),
      revision: 1,
      revokedAt: null,
    });
  });

  it('never lets the shipped legacy v4 POST recreate revoked consent', async () => {
    const fixture = consentDatabase();
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);

    await ai.revokeConsent('user-1');
    await ai.issueConsentChallenge('user-1');
    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
    })).rejects.toThrow('ai_consent_challenge_required');
    expect(fixture.state()).toMatchObject({
      authority: { active: false, revision: 2 },
      consent: null,
    });
    expect(fixture.state().challenges).toHaveLength(1);
  });

  it('recreates consent only with a current explicit-flow one-time challenge', async () => {
    const fixture = consentDatabase();
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);

    await ai.revokeConsent('user-1');
    const challenge = await ai.issueConsentChallenge('user-1');
    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
      challenge: challenge.challenge,
    })).resolves.toMatchObject({ policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION });
    expect(fixture.state()).toMatchObject({
      challenges: [],
      consent: { revision: 3, revokedAt: null },
    });

    await ai.revokeConsent('user-1');
    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
      challenge: challenge.challenge,
    })).rejects.toThrow('ai_consent_challenge_required');
  });

  it('strictly validates and consumes a supplied challenge even when consent is already active', async () => {
    const fixture = consentDatabase();
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);
    const challenge = await ai.issueConsentChallenge('user-1');

    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
      challenge: challenge.challenge,
    })).resolves.toEqual({
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      acceptedAt: '2026-08-14T00:00:00.000Z',
    });
    expect(fixture.state().challenges).toHaveLength(0);

    await expect(ai.acceptConsent('user-1', {
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
      challenge: challenge.challenge,
    })).rejects.toThrow('ai_consent_challenge_required');
  });

  it('rejects an expired explicit consent challenge', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    try {
      const fixture = consentDatabase(null);
      const ai = new AiService(fixture.database as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);
      const challenge = await ai.issueConsentChallenge('user-1');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await expect(ai.acceptConsent('user-1', {
        accepted: true,
        policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
        flowRevision: CURRENT_AI_CONSENT_FLOW_REVISION,
        challenge: challenge.challenge,
      })).rejects.toThrow('ai_consent_challenge_required');
    } finally {
      vi.useRealTimers();
    }
  });

  it('orders revoke before multipart admission so no file or provider is touched', async () => {
    const fixture = consentDatabase();
    const asr = { transcribe: vi.fn() };
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, asr as never, pointBenefits() as never);
    const controller = new AiController(ai);
    const toBuffer = vi.fn(async () => Buffer.from('audio'));
    const file = vi.fn(async () => ({
      fields: { model: { type: 'field', value: '16k_en' } },
      mimetype: 'audio/wav',
      toBuffer,
    }));
    const request = {
      id: 'request-revoke-first',
      user: { id: 'user-1' },
      raw: { once: vi.fn() },
      file,
    };

    const revoke = ai.revokeConsent('user-1');
    const transcribe = expect(controller.transcribe(request as never)).rejects.toThrow('ai_consent_required');
    await revoke;
    await transcribe;

    expect(file).not.toHaveBeenCalled();
    expect(toBuffer).not.toHaveBeenCalled();
    expect(asr.transcribe).not.toHaveBeenCalled();
    const lockIds = fixture.execute.mock.calls.map(([query]) => (
      (query as { queryChunks: unknown[] }).queryChunks.find((chunk) => typeof chunk === 'string')
    ));
    expect(lockIds).toEqual(['ai-consent:user-1', 'ai-consent:user-1']);
  });

  it('rechecks the grant after file intake and blocks a revoke that committed meanwhile', async () => {
    const fixture = consentDatabase();
    const asr = { transcribe: vi.fn() };
    const ai = new AiService(fixture.database as never, reviewProvider({}) as never, asr as never, pointBenefits() as never);
    const controller = new AiController(ai);
    const toBuffer = vi.fn(async () => Buffer.from('audio'));
    let releaseFile!: (value: {
      fields: { model: { type: 'field'; value: string } };
      mimetype: string;
      toBuffer: typeof toBuffer;
    }) => void;
    const file = vi.fn(() => new Promise<Parameters<typeof releaseFile>[0]>((resolve) => { releaseFile = resolve; }));
    const request = {
      id: 'request-revoke-during-intake',
      user: { id: 'user-1' },
      raw: { once: vi.fn() },
      file,
    };

    const pending = controller.transcribe(request as never);
    await vi.waitFor(() => expect(file).toHaveBeenCalledTimes(1));
    await ai.revokeConsent('user-1');
    releaseFile({
      fields: { model: { type: 'field', value: '16k_en' } },
      mimetype: 'audio/wav',
      toBuffer,
    });

    await expect(pending).rejects.toThrow('ai_consent_required');
    expect(toBuffer).toHaveBeenCalledTimes(1);
    expect(asr.transcribe).not.toHaveBeenCalled();
  });

  it('returns accepted only for the current policy version', async () => {
    const { service: ai } = service({});

    await expect(ai.consentStatus('user-1')).resolves.toEqual({
      accepted: true,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
      acceptedAt: '2026-08-14T00:00:00.000Z',
    });
  });

  it('returns the current policy as not accepted for a new account', async () => {
    const db = database(null);
    const ai = new AiService(db as never, reviewProvider({}) as never, {} as never, pointBenefits() as never);

    await expect(ai.consentStatus('user-new')).resolves.toEqual({
      accepted: false,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
    });
  });

  it('requires renewed consent after a policy version change', async () => {
    const db = database({
      userId: 'user-1',
      policyVersion: 'ai-learning-privacy-v3',
      acceptedAt: new Date('2026-07-01T00:00:00.000Z'),
      revision: 1,
      revokedAt: null,
    });
    const review = reviewProvider({ grammar: { correctedText: 'Ready.', issues: [] } });
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    await expect(ai.consentStatus('user-1')).resolves.toEqual({
      accepted: false,
      policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
    });
    await expect(ai.admitOperation('user-1')).rejects.toThrow('ai_consent_required');
    expect(review.generateValidated).not.toHaveBeenCalled();
  });

  it('releases the consent transaction before calling a slow provider or writing usage', async () => {
    const fixture = database();
    let transactionDepth = 0;
    const originalTransaction = fixture.db.transaction;
    fixture.db.transaction = async (action) => {
      transactionDepth += 1;
      try {
        return await originalTransaction(action);
      } finally {
        transactionDepth -= 1;
      }
    };
    const review = reviewProvider({
      grammar: { correctedText: 'Ready.', issues: [] },
    });
    review.generateValidated.mockImplementation(async (input: ReviewCall) => {
      expect(transactionDepth).toBe(0);
      return { data: input.validate({ grammar: { correctedText: 'Ready.', issues: [] } }), meta: {} };
    });
    const ai = new AiService(fixture as never, review as never, {} as never, pointBenefits() as never);

    await expect(ai.review('user-1', 'request-no-held-transaction', {
      mode: 'grammar', module: 'atc', questionId: 'question-no-held-transaction', transcript: 'Ready.',
    }, await operationGrant(ai))).resolves.toMatchObject({ grammar: { correctedText: 'Ready.' } });
    expect(transactionDepth).toBe(0);
  });

  it('sends only the transcript to the unified grammar review and returns structured issues', async () => {
    const db = database();
    const review = reviewProvider({
      grammar: {
        correctedText: 'He has informed ATC.',
        issues: [{ before: 'He have', after: 'He has', reasonZh: '主语 He 为第三人称单数，应使用 has。' }],
      },
    });
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    const result = await ai.review('user-1', 'request-1', {
      mode: 'grammar', module: 'opi', questionId: 'question-1', transcript: 'He have informed ATC.',
    }, await operationGrant(ai));

    expect(result).toEqual(expect.objectContaining({
      grammar: {
        correctedText: 'He has informed ATC.',
        issues: [{ before: 'He have', after: 'He has', reasonZh: '主语 He 为第三人称单数，应使用 has。' }],
      },
      promptVersion: 'deepseek-review:v1',
    }));
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
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    const result = await ai.review('user-1', 'request-2', {
      mode: 'opi', module: 'opi', questionId: 'question-2', transcript: 'I encountered turbulence.',
    }, await operationGrant(ai));

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
    }, await operationGrant(ai));

    expect(result).toEqual(expect.objectContaining({
      correctedText: 'He has informed ATC.',
      issues: ['“He have” → “He has”：主谓一致错误。'],
      promptVersion: 'deepseek-review:v1',
    }));
  });

  it('keeps legacy polish output compatible while using DeepSeek', async () => {
    const { review, service: ai } = service({
      grammar: { correctedText: 'I informed ATC.', issues: [] },
      polishedText: 'I informed ATC.',
    });

    const result = await ai.polish('user-1', 'request-legacy-polish', {
      module: 'opi', questionId: 'question-polish', questionText: 'not sent', transcript: 'I tell ATC.', correctedText: 'I informed ATC.',
    }, await operationGrant(ai));

    expect(result).toEqual(expect.objectContaining({ polishedText: 'I informed ATC.', promptVersion: 'deepseek-review:v1' }));
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
    }, await operationGrant(ai))).rejects.toThrow();
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
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    await expect(ai.review('user-1', 'request-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-5', transcript: 'Ready.',
    }, await operationGrant(ai))).rejects.toThrow('ai_invalid_response');

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
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    await expect(ai.review('user-1', 'request-private-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-6', transcript: 'Ready.',
    }, await operationGrant(ai))).rejects.toThrow('ai_upstream_failed');

    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({
      failureCode: 'internal_error',
      requestId: 'request-private-failure',
      upstreamStatus: 'failed',
    }));
  });

  it('returns a successful paid result even when usage telemetry cannot be persisted', async () => {
    const failingValues = vi.fn(() => ({ onConflictDoNothing: async () => { throw new Error('database unavailable'); } }));
    const transactionDb = {
      select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === aiConsentAuthorities
        ? [{
            userId: 'user-1',
            policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
            revision: 1,
            active: true,
          }]
        : [{
            userId: 'user-1',
            policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION,
            acceptedAt: new Date('2026-08-14T00:00:00.000Z'),
            revision: 1,
            revokedAt: null,
          }] }) }) }),
      insert: () => ({ values: failingValues }),
      execute: vi.fn<(query: unknown) => Promise<void>>().mockResolvedValue(undefined),
    };
    const db = {
      values: failingValues,
      db: {
        ...transactionDb,
        transaction: <T>(action: (transaction: typeof transactionDb) => Promise<T>) => action(transactionDb),
      },
    };
    const review = reviewProvider({
      grammar: { correctedText: 'Ready.', issues: [] },
    });
    const ai = new AiService(db as never, review as never, {} as never, pointBenefits() as never);

    await expect(ai.review('user-1', 'request-telemetry-failure', {
      mode: 'grammar', module: 'atc', questionId: 'question-7', transcript: 'Ready.',
    }, await operationGrant(ai))).resolves.toMatchObject({ grammar: { correctedText: 'Ready.' } });
    expect(failingValues).toHaveBeenCalled();
  });
});

describe('AiService combined transcription and review', () => {
  it.each([
    ['grammar', 'atc', 'transcription_grammar'],
    ['opi', 'opi', 'transcription_opi'],
  ] as const)('uses a single %s reservation and stores the complete replayable result', async (mode, module, capability) => {
    const fixture = database();
    const output = { grammar: { issues: [], correctedText: 'We are ready for departure.' }, ...(mode === 'opi' ? { polishedText: 'We are ready for departure.' } : {}) };
    const review = reviewProvider(output);
    const asr = { transcribe: vi.fn(async () => ({ rawTranscript: 'We are ready for departure.', meta: {} })) };
    const benefits = pointBenefits();
    const ai = new AiService(fixture as never, review as never, asr as never, benefits as never);
    const grant = await ai.admitOperation('user-1', 'sandbox');
    const input = { mode, module, questionId: 'question-1' };
    const first = await ai.transcribeReview('user-1', 'combined-1', Buffer.from('audio'), 'audio/wav', '16k_en', input, grant, undefined, 'stable-operation');
    expect(first).toMatchObject({ transcript: 'We are ready for departure.', review: output, aiPoints: { operationId: 'stable-operation' } });
    expect(benefits.reserveAiPoints).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ capability, environment: 'sandbox', operationId: 'stable-operation' }));
    expect(benefits.settleAiPoints).toHaveBeenCalledTimes(1);
    expect(benefits.settleAiPoints).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ environment: 'sandbox', result: expect.objectContaining({ transcript: first.transcript, review: first.review }) }));
    expect(asr.transcribe).toHaveBeenCalledTimes(1);
    expect(review.generateValidated).toHaveBeenCalledTimes(1);
    benefits.reserveAiPoints.mockResolvedValueOnce({ state: 'replay', data: first } as never);
    expect(await ai.transcribeReview('user-1', 'combined-retry', Buffer.from('audio'), 'audio/wav', '16k_en', input, grant, undefined, 'stable-operation')).toEqual(first);
    expect(asr.transcribe).toHaveBeenCalledTimes(1);
    expect(review.generateValidated).toHaveBeenCalledTimes(1);
    expect(benefits.settleAiPoints).toHaveBeenCalledTimes(1);
  });

  it('releases the entire combination if review fails after transcription, retaining provider usage only', async () => {
    const fixture = database();
    const review = reviewProvider({ malformed: true });
    const asr = { transcribe: vi.fn(async () => ({ rawTranscript: 'We are ready.', meta: {} })) };
    const benefits = pointBenefits();
    const ai = new AiService(fixture as never, review as never, asr as never, benefits as never);
    const grant = await operationGrant(ai);
    await expect(ai.transcribeReview('user-1', 'combined-failure', Buffer.from('audio'), 'audio/wav', '16k_en', { mode: 'grammar', module: 'atc', questionId: 'q-1' }, grant, undefined, 'operation-failure')).rejects.toThrow();
    expect(asr.transcribe).toHaveBeenCalledTimes(1);
    expect(benefits.settleAiPoints).not.toHaveBeenCalled();
    expect(benefits.releaseAiPoints).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ operationId: 'operation-failure', environment: 'production' }));
    expect(fixture.values).toHaveBeenCalledWith(expect.objectContaining({ capability: 'transcribe', status: 'success', quotaUnits: 0 }));
  });
});
