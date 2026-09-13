import { createHash } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDataService } from '../src/admin/admin-data.service';
import { AdminFeedbackStorageService } from '../src/admin/admin-feedback-storage.service';
import type { OpsApiConfig } from '../src/config';
import { feedbackSubmissionSchema } from '../src/feedback/feedback.schemas';
import { FeedbackService } from '../src/feedback/feedback.service';

const id = '00000000-0000-4000-8000-000000000001';
const staff = { id, email: 'admin@example.test', role: 'admin' as const, sessionId: id };
const ticket = { id, ticketNumber: 'FB-260909-00000001', userId: id, category: 'content_correction', status: 'received',
  source: 'study', sourceRoute: '/study', description: '完整反馈'.repeat(100), contact: 'tester@example.test',
  createdAt: new Date('2026-09-09T12:00:00Z'), appDisplayVersion: '1.0.1', platform: 'ios', osName: 'iOS', osVersion: '19',
  bankId: 'opi', categoryId: 'main', topicId: 'topic1', cardId: 'card1', bankVersion: 2, bankChecksum: 'a'.repeat(64), questionVerified: true,
};
function fixture(batches: unknown[][]) {
  const queries: Array<{ where?: string; params?: unknown[]; limit?: number }> = [];
  const db = { select: vi.fn(() => {
    const query: typeof queries[number] = {}; queries.push(query);
    const rows = batches.shift() ?? [];
    type Chain = { from(): Chain; innerJoin(): Chain; where(value: SQL): Chain; orderBy(): Chain; limit(value: number): Promise<unknown[]>; then: Promise<unknown[]>['then'] };
    const promise = Promise.resolve(rows);
    const chain: Chain = {
      from: () => chain, innerJoin: () => chain, orderBy: () => chain,
      where: (value) => { const sql = new PgDialect().sqlToQuery(value); query.where = sql.sql; query.params = sql.params; return chain; },
      limit: (value) => { query.limit = value; return promise; },
      then: promise.then.bind(promise),
    };
    return chain;
  }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AdminDataService({} as never, { db } as never, {} as never, {} as never, audit as never);
  return { service, queries, audit, db };
}

afterEach(() => vi.unstubAllGlobals());

describe('feedback admin access', () => {
  it('paginates with a stable timestamp and ID cursor, without silently dropping records after 100', async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({ ...ticket, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, ticketNumber: `FB-260909-${String(index).padStart(8, '0')}` }));
    const { service, queries } = fixture([rows, [{ ...ticket, id }]]);
    const first = await service.feedbackQueue('查看用户反馈', staff, 'request');
    expect(first.items).toHaveLength(30); expect(first.nextCursor).toBeTruthy();
    await service.feedbackQueue('查看用户反馈', staff, 'request', first.nextCursor!);
    expect(queries[0]?.limit).toBe(31);
    expect(queries[1]?.where).toContain('"retention_at" >');
    expect(queries[1]?.where).toContain('"created_at" <');
    expect(queries[1]?.where).toContain('"id" <');
    expect(first.items[0]?.summary.length).toBeLessThan(ticket.description.length);
  });
  it('rejects invalid cursors before querying', async () => {
    const { service, queries } = fixture([]);
    await expect(service.feedbackQueue('查看用户反馈', staff, 'request', 'invalid')).rejects.toThrow('invalid_feedback_cursor');
    expect(queries).toHaveLength(0);
  });
  it('returns full description, optional contact and all images, never private object keys', async () => {
    const images = [1, 2, 3].map((number) => ({ id: String(number), mimeType: 'image/png', sizeBytes: 16 }));
    const { service, queries } = fixture([[ticket], images]);
    const detail = await service.feedbackDetail(ticket.ticketNumber, staff, 'request');
    expect(detail.description).toBe(ticket.description); expect(detail.contact).toBe(ticket.contact);
    expect(detail.attachments).toHaveLength(3); expect(detail.question?.bankVersion).toBe(2);
    expect(JSON.stringify(detail)).not.toContain('objectKey');
    expect(queries[1]?.where).toContain('"deleted_at" is null');
    expect(queries[1]?.where).toContain('"expires_at" >');
  });
  it('does not expose a missing or expired feedback detail', async () => {
    const { service } = fixture([[]]);
    await expect(service.feedbackDetail(ticket.ticketNumber, staff, 'request')).rejects.toThrow('feedback_not_found');
  });
  it('checks both ticket and image identity plus retention before authorizing storage access', async () => {
    const { service, queries } = fixture([[]]);
    await expect(service.feedbackAttachment(ticket.ticketNumber, id, staff, 'request')).rejects.toThrow('feedback_attachment_not_found');
    expect(queries[0]?.params).toContain(ticket.ticketNumber); expect(queries[0]?.params).toContain(id);
    expect(queries[0]?.where).toContain('"retention_at" >');
    expect(queries[0]?.where).toContain('"expires_at" >');
    expect(queries[0]?.where).toContain('"deleted_at" is null');
  });
});

describe('feedback attachment private proxy', () => {
  const bytes = Buffer.from('89504e470d0a1a0a0000', 'hex');
  const image = { objectKey: `feedback/${id}.png`, mimeType: 'image/png', sizeBytes: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') };
  const service = () => new AdminFeedbackStorageService({ opsFeedbackStorageUrl: 'https://storage.example.test', opsFeedbackStorageReadToken: 'scoped-read-only-token' } as OpsApiConfig);
  it('returns verified image bytes through the fixed private bucket only', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes)); vi.stubGlobal('fetch', fetcher);
    await expect(service().read(image)).resolves.toEqual(bytes);
    expect(fetcher).toHaveBeenCalledWith(`https://storage.example.test/object/authenticated/feedback-screenshots/${image.objectKey}`, expect.objectContaining({ redirect: 'error', headers: { authorization: 'Bearer scoped-read-only-token', apikey: 'scoped-read-only-token' } }));
  });
  it('rejects traversal and does not request storage', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(service().read({ ...image, objectKey: '../private.png' })).rejects.toThrow('feedback_attachment_invalid');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['wrong hash', 'oversize'])('rejects %s without exposing upstream secrets', async (problem) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(problem === 'oversize' ? Buffer.alloc(100) : bytes)));
    await expect(service().read({ ...image, checksum: 'b'.repeat(64) })).rejects.toThrow('feedback_attachment_read_failed');
  });
});

describe('feedback release provenance', () => {
  it('accepts versioned contexts but rejects invalid checksums', () => {
    const payload = { clientSubmissionId: id, category: 'content_correction', description: '这道题的参考答案需要核实', source: 'study', sourceRoute: '/study', appDisplayVersion: '1.0.1', platform: 'ios', question: { bankId: 'opi', categoryId: 'main', topicId: 'topic1', cardId: 'card1', bankVersion: 2, bankChecksum: 'a'.repeat(64) } };
    expect(feedbackSubmissionSchema.parse(payload).question?.bankVersion).toBe(2);
    expect(feedbackSubmissionSchema.safeParse({ ...payload, question: { ...payload.question, bankChecksum: 'wrong' } }).success).toBe(false);
  });
  it('resolves the displayed release and never silently substitutes the latest release on checksum mismatch', async () => {
    const { db, queries } = fixture([[{ version: 2, checksum: 'a'.repeat(64), payload: { categories: [{ id: 'main', topics: [{ id: 'topic1', cards: [{ id: 'card1' }] }] }] } }], [{ version: 2, checksum: 'a'.repeat(64), payload: {} }]]);
    const service = new FeedbackService({ db } as never, {} as never);
    const resolve = (service as unknown as { resolveQuestion(input: unknown): Promise<unknown> }).resolveQuestion.bind(service);
    const context = { bankId: 'opi', categoryId: 'main', topicId: 'topic1', cardId: 'card1', bankVersion: 2, bankChecksum: 'a'.repeat(64) };
    await expect(resolve(context)).resolves.toEqual({ version: 2, checksum: context.bankChecksum, verified: true });
    expect(queries[0]?.where).toContain('"version" ='); expect(queries[0]?.where).not.toContain('"active"');
    await expect(resolve({ ...context, bankChecksum: 'b'.repeat(64) })).resolves.toEqual({ version: 2, checksum: 'b'.repeat(64), verified: false });
  });
});
