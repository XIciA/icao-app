import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
const root = new URL('../../../', import.meta.url);
function evaluate(path, modules, extras = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => { if (!(name in modules)) throw new Error(`unexpected_import:${name}`); return modules[name]; },
    Map, Set, Date, Error, DOMException, AbortController, Headers, Response, setTimeout, clearTimeout, __DEV__: false, ...extras });
  return exports;
}
const response = (data) => new Response(JSON.stringify({ data }), { status: 200 });
const failure = (code, status) => new Response(JSON.stringify({ error: { code } }), { status });
function fixture() {
  const fetch = vi.fn(); const storage = new Map(); const listeners = new Set(); let token = 'token-a';
  let owner = { accountId: 'a', generation: 1, status: 'active', environment: 'sandbox' };
  const api = evaluate('src/platform/api-client.ts', {}, { process: { env: { EXPO_PUBLIC_ICAO_API_URL: 'https://api.test' } }, fetch });
  api.setApiAccessTokenProvider(async () => token);
  const errors = evaluate('src/features/ai/ai-operation-failure.native.ts', { '@/platform/api-client': api });
  const client = evaluate('src/features/ai/ai-client.native.ts', {
    '@icao/contracts': { COMMERCE_ENVIRONMENT_HEADER: 'x-icao-commerce-environment', CURRENT_AI_CONSENT_POLICY_VERSION: 'v1', CURRENT_AI_CONSENT_FLOW_REVISION: '1' },
    'expo-crypto': { randomUUID: () => 'new-operation-id' }, '@/platform/api-client': api,
    '@/platform/storage': { getItem: async (key) => storage.get(key), setItem: async (key, value) => storage.set(key, value), removeItem: async (key) => storage.delete(key) },
    '@/platform/audio-upload': { createAudioUploadForm: async (uri, model) => ({ fetch, form: { values: { audio: uri, model }, append(key, value) { this.values[key] = value; } } }) },
    '@/features/native-commercial-testflight/commerce-environment.native': {
      getNativeCommerceEnvironmentState: () => owner,
      subscribeNativeCommerceEnvironment: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    },
    './ai-operation-failure.native': errors, './asr-model-preference': { getAsrModel: async () => '16k_en' },
  });
  function switchAccount(accountId, status = 'active') { token = `token-${accountId}`; owner = { ...owner, accountId, status, generation: owner.generation + 1 }; for (const listener of listeners) listener(); }
  return { client, api, fetch, switchAccount, errors };
}
const review = { grammar: { correctedText: 'We are ready.', issues: [] }, promptVersion: 'deepseek-review:v1' };
describe('native metered AI requests', () => {
  it('sends sandbox ownership and stable operation id on standalone requests', async () => {
    const f = fixture(); f.fetch.mockResolvedValue(response(review));
    await f.client.reviewExpression({ mode: 'grammar', module: 'atc', questionId: 'q', transcript: 'We ready.' }, undefined, 'fixed-op');
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/ai/review');
    expect(init.headers.get('x-icao-commerce-environment')).toBe('sandbox');
    expect(init.headers.get('x-ai-operation-id')).toBe('fixed-op');
    expect(init.headers.get('authorization')).toBe('Bearer token-a');
  });
  it('uploads exactly one atomic combination and returns both results', async () => {
    const f = fixture(); const result = { transcript: 'We are ready.', review };
    f.fetch.mockResolvedValue(response(result));
    expect(await f.client.transcribeAndReviewRecording('file:///recording.m4a', { mode: 'opi', module: 'opi', questionId: 'original-q' }, undefined, 'combo-op')).toEqual(result);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/ai/transcribe-review');
    expect(init.body.values).toEqual({ audio: 'file:///recording.m4a', model: '16k_en', mode: 'opi', module: 'opi', questionId: 'original-q' });
    expect(init.headers['x-ai-operation-id']).toBe('combo-op');
    expect(init.headers['x-icao-commerce-environment']).toBe('sandbox');
  });
  it('shows authoritative quota reset or expiry without internal units', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(failure('insufficient_ai_points', 402)).mockResolvedValueOnce(response({ environment: 'sandbox', allowance: { mode: 'weekly', resetAt: '2026-10-02T03:04:00Z', membershipExpiresAt: '2026-11-01T00:00:00Z' } }));
    const error = await f.client.transcribeRecording('file:///recording.m4a').catch((value) => value);
    expect(error.code).toBe('insufficient_ai_points'); expect(error.userMessage).toContain('恢复'); expect(error.userMessage).not.toMatch(/点数|扣|500|余额/);
    expect(f.errors.aiFailureDisplayMessage(error)).toBe(error.userMessage);
    expect(f.fetch.mock.calls[1][0]).toBe('https://api.test/v1/commerce/allowance/current');
    expect(f.fetch.mock.calls[1][1].headers.get('x-icao-commerce-environment')).toBe('sandbox');
    expect(f.client.allowanceFailureMessage({ allowance: { mode: 'expired' } })).toContain('会员已到期');
    expect(f.client.allowanceFailureMessage({ allowance: { mode: 'trial' } })).not.toContain('每周');
  });
  it('does not upload an old recording under a new account on 401 retry', async () => {
    const f = fixture(); f.fetch.mockImplementationOnce(async () => { f.switchAccount('b'); return failure('invalid_session', 401); });
    const error = await f.client.transcribeAndReviewRecording('file:///a.m4a', { mode: 'grammar', module: 'atc', questionId: 'a-q' }, undefined, 'a-op').catch((value) => value);
    expect(error.cancelled).toBe(true); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('aborts JSON replay and rejects late success from a previous owner', async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(async () => { f.switchAccount('b'); return failure('invalid_session', 401); })
      .mockImplementationOnce(async (_url, init) => { if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError'); return response(review); });
    const error = await f.client.reviewExpression({ mode: 'grammar', module: 'atc', questionId: 'a', transcript: 'private a' }).catch((value) => value);
    expect(error.cancelled).toBe(true);
    if (f.fetch.mock.calls.length > 1) expect(f.fetch.mock.calls[1][1].signal.aborted).toBe(true);
    const g = fixture(); g.fetch.mockImplementationOnce(async () => { g.switchAccount('b'); return response({ transcript: 'private a' }); });
    expect((await g.client.transcribeRecording('file:///a').catch((value) => value)).cancelled).toBe(true);
  });
  it('does not fall back to production while account environment activates', async () => {
    const f = fixture(); f.switchAccount('a', 'activating');
    const error = await f.client.transcribeRecording('file:///a').catch((value) => value);
    expect(error.code).toBe('commerce_environment_unavailable'); expect(f.fetch).not.toHaveBeenCalled();
  });
});

function recoveryFixture() {
  const values = new Map(); let epoch = 1;
  let owner = { accountId: 'account-a', generation: 1, status: 'active', environment: 'sandbox' };
  const context = () => ({ ownerToken: String(epoch), aiToken: epoch });
  const assert = (captured) => { if (captured.ownerToken !== String(epoch) || captured.aiToken !== epoch) throw new Error('learning_owner_or_generation_changed'); };
  const storage = {
    getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value),
    multiSet: async (entries) => entries.forEach(([key, value]) => values.set(key, value)),
    multiRemove: async (keys) => keys.forEach((key) => values.delete(key)), getAllKeys: async () => [...values.keys()],
  };
  const records = evaluate('src/features/question-bank/platform/learning-record-storage.native.ts', {
    '@/platform/storage': storage, '../lib/study-review.native': { captureStudyReview: (value) => value, getStudyReview: () => undefined },
  });
  const lookup = vi.fn(); const enqueue = vi.fn();
  const sync = vi.fn(async () => ({ boundUserId: 'account-a' }));
  const recovery = evaluate('src/features/ai/ai-operation-recovery.native.ts', {
    '@/features/native-commercial-testflight/commerce-environment.native': { getNativeCommerceEnvironmentState: () => owner },
    '@/features/sync/learning-sync.native': { assertLearningWriteContext: assert, captureLearningWriteContext: context, enqueueLearningRecord: enqueue, runLearningSync: sync },
    '@/features/question-bank/platform/learning-store.native': { sqliteLearningStore: { addRecord: (record, captured) => records.upsertLearningRecord(record, () => assert(captured)) } },
    '@/features/question-bank/platform/learning-record-storage.native': records,
    './ai-client.native': { lookupAiOperation: lookup },
  });
  const record = { id: 'ai-study-1-q1', recordType: 'ai_result', sessionId: 'study-1', cardId: 'q1', bankId: 'opi', createdAt: new Date().toISOString(),
    aiResult: { questionId: 'q1', itemId: 'item1', transcript: 'Manual answer.' } };
  return { recovery, records, record, context, lookup, enqueue, sync,
    switchOwner: () => { epoch++; owner = { ...owner, accountId: 'account-b', generation: 2 }; },
  };
}
describe('AI result recovery inside the existing learning rows', () => {
  it('recovers both outputs without overwriting manual answers or creating another record', async () => {
    const f = recoveryFixture();
    await f.recovery.savePendingAiOperation(f.record, 'op1', f.context());
    f.lookup.mockResolvedValue({ state: 'completed', capability: 'opi_with_transcription', result: { transcript: 'Recorded answer.', review } });
    await f.recovery.recoverPendingAiOperations();
    const saved = await f.records.loadLearningAiRecord(f.record.id);
    expect(saved.aiOperation.status).toBe('complete'); expect(saved.aiResult.transcript).toBe('Manual answer.');
    expect(saved.aiResult.rawTranscript).toBe('Recorded answer.'); expect(saved.aiResult.analyzedTranscript).toBe('Recorded answer.');
    expect((await f.records.getLearningRecords()).length).toBe(1); expect(f.enqueue).toHaveBeenCalledTimes(1);
    await f.recovery.recoverPendingAiOperations(); expect(f.lookup).toHaveBeenCalledTimes(1);
  });
  it('ties recovered text analysis to its exact original input', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op1', f.context(), 'Original text submitted.');
    f.lookup.mockResolvedValue({ state: 'completed', capability: 'grammar_correction', result: review });
    await f.recovery.recoverPendingAiOperations();
    expect((await f.records.loadLearningAiRecord(f.record.id)).aiResult.analyzedTranscript).toBe('Original text submitted.');
  });
  it('uses a queued compare-and-set so an old operation cannot replace a newer pending request', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op-a', f.context());
    f.lookup.mockImplementationOnce(async () => {
      await f.recovery.savePendingAiOperation(f.record, 'op-b', f.context());
      return { state: 'completed', capability: 'transcription', result: { transcript: 'Old A' } };
    });
    await f.recovery.recoverPendingAiOperations();
    const saved = await f.records.loadLearningAiRecord(f.record.id);
    expect(saved.aiOperation.operationId).toBe('op-b'); expect(saved.aiOperation.status).toBe('pending');
    expect(saved.aiResult.rawTranscript).toBeUndefined(); expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('honours a parent history deletion received while the result lookup was in flight', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op1', f.context());
    f.lookup.mockImplementationOnce(async () => {
      await f.records.deleteLearningRecord('parent-history', { sessionId: 'study-1', recordType: 'study' });
      return { state: 'completed', capability: 'transcription', result: { transcript: 'Deleted answer' } };
    });
    await f.recovery.recoverPendingAiOperations();
    expect(await f.records.loadLearningAiRecord(f.record.id)).toBeUndefined(); expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('runs the existing sync before recovery so privacy resets remove old pending rows', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op1', f.context());
    f.sync.mockImplementationOnce(async () => { await f.records.clearAiResultRecords(); return { boundUserId: 'account-a' }; });
    await f.recovery.recoverPendingAiOperations(); expect(f.lookup).not.toHaveBeenCalled();
  });
  it('retains pending metadata on network failure and rejects late cross-account delivery', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op1', f.context());
    f.lookup.mockRejectedValueOnce(new Error('offline'));
    await expect(f.recovery.recoverPendingAiOperations()).rejects.toThrow('offline');
    expect((await f.records.loadLearningAiRecord(f.record.id)).aiOperation.status).toBe('pending');
    f.lookup.mockImplementationOnce(async () => { f.switchOwner(); return { state: 'completed', capability: 'transcription', result: { transcript: 'A private text' } }; });
    await expect(f.recovery.recoverPendingAiOperations()).rejects.toThrow('learning_owner_or_generation_changed');
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('marks released tasks complete without new charging and ignores other environments', async () => {
    const f = recoveryFixture(); await f.recovery.savePendingAiOperation(f.record, 'op1', f.context());
    f.lookup.mockResolvedValue({ state: 'released' });
    await f.recovery.recoverPendingAiOperations();
    expect((await f.records.loadLearningAiRecord(f.record.id)).aiOperation.status).toBe('complete');
    const other = { ...f.record, id: 'other-env', aiOperation: { operationId: 'production-op', status: 'pending', environment: 'production' } };
    await f.records.upsertLearningRecord(other); await f.recovery.recoverPendingAiOperations();
    expect(f.lookup).toHaveBeenCalledTimes(1);
  });
});
