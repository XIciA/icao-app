import {
  clearSafeDiagnosticCorrelation,
  getSafeDiagnosticBundleForCorrelation,
  purgeExpiredSafeDiagnostics,
  recordSafeDiagnosticEvent,
  resetSafeDiagnosticStoreForTests,
} from '../safe-diagnostic-store';

const mockValues = new Map<string, string>();

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
  },
}));

const context = {
  appVersion: '1.0.0',
  build: '42',
  platform: 'ios' as const,
  osVersion: '19.0',
};

describe('safe diagnostic store', () => {
  beforeEach(async () => {
    mockValues.clear();
    await resetSafeDiagnosticStoreForTests();
  });

  it('returns only the explicitly requested failed correlation and clears only that association', async () => {
    await recordSafeDiagnosticEvent({
      feature: 'recording', correlationId: 'R-OLD-01', stage: 'prepare', code: 'old_failure', level: 'error',
    });
    await recordSafeDiagnosticEvent({
      feature: 'recording', correlationId: 'R-NEW-02', stage: 'prepare', code: 'prepare_started', level: 'info',
    });
    await recordSafeDiagnosticEvent({
      feature: 'recording', correlationId: 'R-NEW-02', stage: 'prepare', code: 'recording_native_prepare_failed', level: 'error',
      canRecord: false, recorderState: 'preparing',
    });

    const bundle = await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'R-NEW-02');
    expect(bundle).toMatchObject({ feature: 'recording', correlationId: 'R-NEW-02', events: [
      { offsetMs: 0, code: 'prepare_started' },
      { code: 'recording_native_prepare_failed', canRecord: false },
    ] });

    await clearSafeDiagnosticCorrelation('recording', 'R-NEW-02');
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'R-NEW-02')).toBeUndefined();
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'R-OLD-01')).toMatchObject({
      correlationId: 'R-OLD-01',
    });
  });

  it('never substitutes the latest failure from the same or another feature', async () => {
    await recordSafeDiagnosticEvent({
      feature: 'recording', correlationId: 'R-SAFE-01', stage: 'native_prepare', code: 'recording_native_prepare_failed', level: 'error',
    });
    await recordSafeDiagnosticEvent({
      feature: 'ai', correlationId: 'A-SAFE-02', stage: 'api', code: 'ai_timeout', level: 'error', capability: 'grammar',
    });

    expect(await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'R-SAFE-01')).toMatchObject({
      feature: 'recording',
      correlationId: 'R-SAFE-01',
    });
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'ai', 'A-SAFE-02')).toMatchObject({
      feature: 'ai',
      correlationId: 'A-SAFE-02',
    });
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'A-SAFE-02')).toBeUndefined();
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'ai', 'A-MISSING-03')).toBeUndefined();
  });

  it('rejects unsafe identifiers and silently drops fields outside the contract', async () => {
    expect(await recordSafeDiagnosticEvent({
      feature: 'ai', correlationId: 'https://example.test/?token=secret', stage: 'api', code: 'ai_timeout', level: 'error',
    })).toBe(false);
    expect(await getSafeDiagnosticBundleForCorrelation(context, 'ai', 'https://example.test/?token=secret')).toBeUndefined();

    await recordSafeDiagnosticEvent({
      feature: 'ai', correlationId: 'A-SAFE-01', stage: 'api', code: 'ai_timeout', level: 'error',
      capability: 'grammar', requestId: 'req_safe-1', retryable: true, httpStatus: 504,
      ...({ uri: 'file:///secret.m4a', token: 'secret', content: 'answer' } as object),
    });
    const bundle = await getSafeDiagnosticBundleForCorrelation(context, 'ai', 'A-SAFE-01');
    expect(bundle?.events[0]).toEqual({
      offsetMs: 0,
      stage: 'api',
      code: 'ai_timeout',
      level: 'error',
      capability: 'grammar',
      requestId: 'req_safe-1',
      retryable: true,
      httpStatus: 504,
    });
    expect(JSON.stringify(bundle)).not.toContain('secret');
    expect(JSON.stringify(bundle)).not.toContain('file:///');
    expect(JSON.stringify(bundle)).not.toContain('answer');
  });

  it('caps persistence at 50 events and a submitted correlation at 30 events', async () => {
    for (let index = 0; index < 55; index += 1) {
      await recordSafeDiagnosticEvent({
        feature: 'recording', correlationId: 'R-CAPPED-01', stage: 'recording',
        code: index === 54 ? 'recording_failed' : 'recording_progress',
        level: index === 54 ? 'error' : 'info',
      });
    }
    const bundle = await getSafeDiagnosticBundleForCorrelation(context, 'recording', 'R-CAPPED-01');
    expect(bundle?.events).toHaveLength(30);
    const stored = JSON.parse([...mockValues.values()][0]) as unknown[];
    expect(stored).toHaveLength(50);
  });

  it('actively removes diagnostics older than 24 hours without waiting for a submission read', async () => {
    const now = Date.now();
    mockValues.set('icao.safe-diagnostics.v1', JSON.stringify([{
      recordedAt: now - 24 * 60 * 60 * 1_000 - 1,
      feature: 'recording',
      correlationId: 'R-EXPIRED-01',
      event: { stage: 'prepare', code: 'expired_failure', level: 'error' },
    }]));
    await purgeExpiredSafeDiagnostics(now);
    expect(mockValues.has('icao.safe-diagnostics.v1')).toBe(false);
  });
});
