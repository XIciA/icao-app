import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import type { DocumentMutation, LearningRecordMutation, SyncPushResult } from '@icao/contracts';
import type { DatabaseService } from '../src/database/database.service';
import { SyncService } from '../src/sync/sync.service';
import { learningRecords, syncChanges, userDocuments } from '../src/database/schema';

const createdAt = '2026-09-09T00:00:00.000Z';
function mutation(deleted = false, ai = false): LearningRecordMutation {
  return { mutationId: 'mutation-1', kind: 'learning_record', payload: { recordId: ai ? 'ai-one' : 'history-one',
    record: { recordType: ai ? 'ai_result' : 'session', sessionId: 'session-one' },
    ...(deleted ? { deleted: true } : {}), occurredAt: createdAt, updatedAt: createdAt, version: 1 } };
}
const row = (payload: Record<string, unknown>, id = 'history-one') => ({ userId: 'user', clientRecordId: id, payload, version: 3, occurredAt: new Date(createdAt), updatedAt: new Date(createdAt) });
function fixture(selections: unknown[][]) {
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  const tx = {
    execute: vi.fn(async () => undefined),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    select: vi.fn(() => { const rows = selections.shift() ?? []; return { from: () => ({ where: () => ({ limit: async () => rows, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) }) }) }; }),
    insert: vi.fn((table: unknown) => ({ values: (values: Record<string, unknown>) => { inserts.push({ table, values }); return { onConflictDoNothing: async () => undefined, onConflictDoUpdate: () => ({ returning: async () => [values] }) }; } })),
  };
  const database = { db: { transaction: async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx), select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ sequence: 0 }] }) }) }) }) } };
  const service = new SyncService(database as unknown as DatabaseService);
  const internals = service as unknown as {
    applyDocument: (transaction: unknown, user: string, entry: DocumentMutation) => Promise<SyncPushResult>;
    applyLearningRecord: (transaction: unknown, user: string, entry: LearningRecordMutation, generation: number) => Promise<SyncPushResult>;
    scrubRecordSyncPayloads: (transaction: unknown, user: string, id: string, authoritative: unknown) => Promise<void>;
    writeAiResultTombstone: (transaction: unknown, user: string, child: unknown, generation: number) => Promise<void>;
    withPrivacyDeletionReceipt: (user: string, action: unknown, request: unknown, operation: (transaction: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  return { service, internals, tx, inserts };
}
it('AI generation reset discards obsolete AI writes but still accepts history deletion', async () => {
  const { service, internals } = fixture([[{ aiResultGeneration: 2, dataGeneration: 0 }], []]);
  const apply = vi.spyOn(internals, 'applyLearningRecord').mockResolvedValue({ mutationId: 'mutation-1', status: 'accepted' });
  const result = await service.push('user', { dataGeneration: 0, aiResultGeneration: 0, mutations: [mutation(true), { ...mutation(false, true), mutationId: 'obsolete-ai' }] });
  expect(apply).toHaveBeenCalledTimes(1);
  expect(result.results).toEqual([{ mutationId: 'mutation-1', status: 'accepted' }, { mutationId: 'obsolete-ai', status: 'discarded' }]);
});
it('a history tombstone rejects a newer offline copy and retains session identity in the response', async () => {
  const deleted = row({ deleted: true, recordType: 'session', sessionId: 'session-one' });
  const { internals, tx, inserts } = fixture([[deleted]]);
  const incoming = mutation(); incoming.payload.version = 99;
  const result = await internals.applyLearningRecord(tx, 'user', incoming, 0);
  expect(result.status).toBe('conflict'); expect(result.authoritative).toMatchObject({ deleted: true, version: 99, record: { sessionId: 'session-one' } });
  expect(inserts).toEqual([]);
});
it('AI arriving after its parent session was deleted is discarded without recreating content', async () => {
  const { internals, tx, inserts } = fixture([[], [row({ deleted: true, recordType: 'session', sessionId: 'session-one' })]]);
  const result = await internals.applyLearningRecord(tx, 'user', mutation(false, true), 0);
  expect(result.status).toBe('discarded'); expect(result.authoritative?.deleted).toBe(true); expect(inserts).toEqual([]);
});
it('session deletion wins over older local versions and cascades only same-session AI', async () => {
  const child = row({ recordType: 'ai_result', sessionId: 'session-one' }, 'ai-one');
  const { internals, tx, inserts } = fixture([[row({ recordType: 'session', sessionId: 'session-one', studyReview: 'private' })], [child]]);
  const scrub = vi.spyOn(internals, 'scrubRecordSyncPayloads').mockResolvedValue();
  const cascade = vi.spyOn(internals, 'writeAiResultTombstone').mockResolvedValue();
  const result = await internals.applyLearningRecord(tx, 'user', mutation(true), 4);
  expect(result.status).toBe('accepted'); expect(result.authoritative?.version).toBe(4);
  const stored = inserts.find(entry => entry.table === learningRecords)?.values.payload;
  expect(stored).toEqual({ deleted: true, recordType: 'session', sessionId: 'session-one' });
  expect(scrub).toHaveBeenCalledTimes(1); expect(cascade).toHaveBeenCalledWith(tx, 'user', child, 4);
});
it('a learning reset preserves account_profile and emits it again for reset clients', async () => {
  const { service, internals, tx, inserts } = fixture([[{ documentKey: 'account_profile', payload: { displayName: '机长' }, version: 7, updatedAt: new Date(createdAt) }]]);
  const whereCalls: { table: unknown; clause: unknown }[] = [];
  const transaction = { ...tx,
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ aiResultGeneration: 1, dataGeneration: 1 }] }) }) }),
    delete: (table: unknown) => ({ where: (clause: unknown) => { whereCalls.push({ table, clause }); return { returning: async () => [] }; } }),
  };
  vi.spyOn(internals, 'withPrivacyDeletionReceipt').mockImplementation(async (_user, _action, _request, operation) => operation(transaction));
  await service.clearLearningData('user', { confirmation: '清除学习数据', idempotencyKey: '10000000-0000-4000-8000-000000000001' });
  const documentDelete = whereCalls.find(entry => entry.table === userDocuments);
  expect(new PgDialect().sqlToQuery(documentDelete!.clause as SQL).params).toEqual(expect.arrayContaining(['account_profile', 'legal-consent']));
  expect(inserts.find(entry => entry.table === syncChanges)?.values).toMatchObject({ entityKey: 'account_profile', version: 7, payload: { document: { displayName: '机长' } } });
});

it('rejects legal consent forged through the generic document sync endpoint', async () => {
  const { internals, tx } = fixture([]);
  const document: DocumentMutation = { kind: 'document', mutationId: 'forged', payload: { documentKey: 'legal-consent', document: { termsVersion: 'future', accepted: true }, updatedAt: createdAt, version: 1 } };
  await expect(internals.applyDocument(tx, 'user', document)).rejects.toThrow('reserved_document_key');
  expect(tx.select).not.toHaveBeenCalled(); expect(tx.insert).not.toHaveBeenCalled();
});

it.each([undefined, 'all'] as const)('keeps a saved scope for older profile writers and accepts an explicit %s change', async (studyScope) => {
  const current = { documentKey: 'account_profile', payload: { displayName: '机长', avatarUri: null, target: 'icao4-first', studyScope: 'crash' }, version: 4, updatedAt: new Date(createdAt) };
  const { internals, tx } = fixture([[current]]);
  const update = vi.fn();
  const transaction = { ...tx, update: () => ({ set: (value: unknown) => { update(value); return { where: async () => undefined }; } }) };
  const entry: DocumentMutation = { kind: 'document', mutationId: 'profile-edit', payload: { documentKey: 'account_profile',
    document: { displayName: '新名称', avatarUri: null, target: 'icao5-first', ...(studyScope ? { studyScope } : {}) }, version: 5, updatedAt: createdAt } };
  const result = await internals.applyDocument(transaction, 'user', entry);
  expect(result).toMatchObject({ status: 'accepted', authoritative: { document: { displayName: '新名称', studyScope: studyScope ?? 'crash' } } });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ studyScope: studyScope ?? 'crash' }) }));
});

it('clears a retired card even when an old device sends a higher version and completed state', async () => {
  const { service, tx, inserts } = fixture([[{ bankId: 'listening', topicId: 'listening-topic-03', cardId: 'listening-main-1010', version: 2, state: { visited: true, completed: true, note: 'private' } }]]);
  const internals = service as unknown as { applyCardState: (transaction: unknown, user: string, mutation: unknown) => Promise<SyncPushResult> };
  const result = await internals.applyCardState(tx, 'user', { mutationId: 'old-card', kind: 'card_state', payload: { bankId: 'listening', topicId: 'listening-topic-03', cardId: 'listening-main-1010', version: 999, updatedAt: createdAt, state: { visited: true, completed: true, note: 'private' } } });
  expect(result.authoritative).toMatchObject({ version: 999, state: { visited: false, completed: false, note: '' } });
  expect(inserts.find(entry => entry.table === syncChanges)?.values.payload).toMatchObject({ version: 999, state: { completed: false } });
});
