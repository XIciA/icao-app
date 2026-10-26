import { AdminGlobalResetService } from '../src/admin/admin-global-reset.service';
import { AdminUsersController } from '../src/admin/admin-users.controller';
import type { AdminAuditService } from '../src/admin/admin-audit.service';
import type { CommerceService } from '../src/commerce/commerce.service';
import type { DatabaseService } from '../src/database/database.service';
import type { OpsApiConfig } from '../src/config';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { AiService } from '../src/ai/ai.service';
import { CURRENT_AI_CONSENT_POLICY_VERSION } from '@icao/contracts';
import { ObservedAiServiceException } from '../src/ai/ai-error-observability';
import { SyncService } from '../src/sync/sync.service';
import * as schema from '../src/database/schema';
import { AiUsageRulesService, type CommerceTransaction } from '../src/commerce/ai-usage-rules.service';
import { AiAllowanceService } from '../src/commerce/ai-allowance.service';
import { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service';
import { INITIAL_AI_RULE, INITIAL_AI_RULE_ID, WEEK_MS } from '../src/commerce/ai-allowance-domain';
import type { AiUsageRuleValues } from '@icao/contracts/commerce-rules';

// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-weekly-ai-test-'));
const data = join(root, 'data');
let started = false;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
const rules = new AiUsageRulesService();
const allowance = new AiAllowanceService(rules);
const benefits = new PersistentCommerceBenefitsService(allowance, rules);
const NOW = new Date('2030-01-01T00:00:00.000Z');
const day = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

beforeAll(async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('test_port_unavailable'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', data, '-o', `-F -h 127.0.0.1 -k ${root} -p ${port}`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  client = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 3, onnotice: () => undefined });
  await client.unsafe(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, phone text);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,
      public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const directory = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(directory).filter((name) => /^00\d\d_.*\.sql$/u.test(name)).sort()) {
    await client.unsafe(readFileSync(join(directory, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  database = drizzle(client, { schema });
}, 30_000);

afterAll(async () => {
  if (client) await client.end();
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(root, { recursive: true, force: true });
});

async function scenario(action: (transaction: CommerceTransaction) => Promise<void>) {
  const rollback = new Error('successful_test_rollback');
  await database.transaction(async (transaction) => {
    await action(transaction);
    await transaction.execute(sql`set constraints all immediate`);
    throw rollback;
  }).catch((error: unknown) => { if (error !== rollback) throw error; });
}

async function account(tx: CommerceTransaction) {
  const [row] = await tx.insert(schema.accounts).values({}).returning();
  if (!row) throw new Error('fixture_account_missing');
  return row.id;
}

async function member(tx: CommerceTransaction, owner: string, startsAt = NOW, endsAt = day(93), ruleId = INITIAL_AI_RULE_ID, environment = 'production') {
  const [order] = await tx.insert(schema.commerceOrders).values({
    environment, channel: 'apple_app_store', externalOrderId: randomUUID(), accountId: owner,
    originalAccountId: owner, productKey: 'membership_93d_v1', externalProductId: 'com.readyoufife.ios.membership.93d.v1',
    durationDays: 93, aiPointRuleVersion: 'ai-weekly-v1', aiUsageRuleVersionId: ruleId,
    membershipGrantSource: 'purchase_discovery', membershipEffectiveAt: startsAt,
    membershipContributionMs: endsAt.getTime() - startsAt.getTime(), purchasedAt: startsAt,
  }).returning();
  if (!order) throw new Error('fixture_order_missing');
  await tx.insert(schema.membershipEntitlementSegments).values({
    environment, accountId: owner, orderId: order.id, revision: 1, startsAt, endsAt,
  });
  return order;
}

async function publish(tx: CommerceTransaction, values: AiUsageRuleValues, effectiveAt: Date, expectedVersionId = INITIAL_AI_RULE_ID) {
  const [staff] = await tx.insert(schema.opsStaffAccounts).values({
    email: `${randomUUID()}@test.invalid`, role: 'admin', passwordHash: 'test-only',
    totpSecretCiphertext: 'test-only', totpSecretIv: 'test-only', totpSecretTag: 'test-only', totpConfirmedAt: NOW,
  }).returning();
  if (!staff) throw new Error('fixture_staff_missing');
  const request = { ...values, effectiveAt: effectiveAt.toISOString(), expectedVersionId, idempotencyKey: randomUUID() };
  const preview = await rules.preview(tx, request, effectiveAt);
  const result = await rules.publish(tx, request, staff.id, effectiveAt);
  return { request, result, preview, staff };
}

async function consume(tx: CommerceTransaction, owner: string, reservedAt: Date, capability: 'transcription' | 'transcription_grammar' | 'transcription_opi' = 'transcription', environment: 'production' | 'sandbox' = 'production', settledAt = reservedAt) {
  const input = { accountId: owner, environment, operationId: randomUUID(), requestDigest: 'digest', capability, reservedAt };
  const reserved = await benefits.reserveAiPoints(tx, input);
  const result = await benefits.settleAiPoints(tx, { ...input, settledAt, result: { transcript: 'Ready for departure.' } });
  return { input, reserved, result };
}

describe('weekly AI allowance with the persistent commerce ledger', () => {
  it('reports persisted trial suppression only when no active allowance exists', () => scenario(async (tx) => {
    const owner = await account(tx);
    expect((await allowance.summary(tx, owner, 'production', NOW)).summary).toMatchObject({ mode: 'unavailable' });
    expect((await allowance.summary(tx, owner, 'production', NOW)).summary.reason).toBeUndefined();
    await tx.update(schema.accounts).set({ aiTrialEligibilityReason: 'trial_already_claimed' }).where(eq(schema.accounts.id, owner));
    expect((await allowance.summary(tx, owner, 'production', NOW)).summary).toMatchObject({ mode: 'unavailable', reason: 'trial_already_claimed' });
    expect((await allowance.summary(tx, owner, 'sandbox', NOW)).summary.reason).toBeUndefined();
    await member(tx, owner);
    const active = await allowance.summary(tx, owner, 'production', NOW);
    expect(active.summary.mode).toBe('weekly');
    expect(active.summary.reason).toBeUndefined();
    expect(active.available).toBe(500);
  }));

  it('resets at exactly 7×24 hours, never accumulates leftover allowance, and keeps the account anchor', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const initial = await allowance.summary(tx, owner, 'production', NOW);
    expect(initial).toMatchObject({ available: 500, total: 500, summary: { mode: 'weekly', remainingPercent: 100, resetAt: day(7).toISOString() } });
    await consume(tx, owner, day(1));
    expect((await allowance.summary(tx, owner, 'production', day(6))).available).toBe(495);
    const renewed = await allowance.summary(tx, owner, 'production', day(7));
    expect(renewed).toMatchObject({ available: 500, total: 500, summary: { resetAt: day(14).toISOString() } });
    const [anchor] = await tx.select().from(schema.aiAllowanceAccounts).where(eq(schema.aiAllowanceAccounts.accountId, owner));
    expect(anchor?.anchorAt).toEqual(NOW);
    expect((await tx.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId, owner))).map((batch) => batch.ordinal)).toEqual([0, 1]);
  }));

  it('retains consumption during early renewal and same-week repurchase after expiry; later-week repurchase gets only its current week', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner, NOW, day(31));
    await consume(tx, owner, day(29));
    expect((await allowance.summary(tx, owner, 'production', day(31))).summary.mode).toBe('expired');
    await member(tx, owner, day(32), day(63));
    expect((await allowance.summary(tx, owner, 'production', day(32))).available).toBe(495);
    await member(tx, owner, day(63), day(94));
    expect((await allowance.summary(tx, owner, 'production', day(33))).available).toBe(495);
    expect((await allowance.summary(tx, owner, 'production', day(35))).available).toBe(500);
    expect((await allowance.summary(tx, owner, 'production', day(95))).available).toBe(0);
    await member(tx, owner, day(100), day(107));
    expect((await allowance.summary(tx, owner, 'production', day(100))).available).toBe(500);
    expect((await allowance.summary(tx, owner, 'production', day(100))).summary.resetAt).toBe(day(105).toISOString());
  }));

  it('gives free trial once, separates trial and sandbox balances, and never replenishes trial weekly', () => scenario(async (tx) => {
    const owner = await account(tx);
    const input = { accountId: owner, externalEligibilityClaimed: true as const, grantedAt: NOW };
    expect((await benefits.grantFreeTrial(tx, input)).created).toBe(true);
    await consume(tx, owner, NOW);
    expect((await benefits.grantFreeTrial(tx, { ...input, grantedAt: day(8) })).created).toBe(false);
    expect(await allowance.summary(tx, owner, 'production', day(8))).toMatchObject({ available: 95, total: 100, summary: { mode: 'trial', resetAt: null } });
    await member(tx, owner, NOW, day(93), INITIAL_AI_RULE_ID, 'sandbox');
    expect((await allowance.summary(tx, owner, 'sandbox', day(8))).available).toBe(500);
    expect((await allowance.summary(tx, owner, 'production', day(8))).available).toBe(95);
  }));

  it('applies current rules to every existing member without clearing consumption', () => scenario(async (tx) => {
    const old = await account(tx);
    await member(tx, old);
    await consume(tx, old, NOW);
    const reduced = { ...INITIAL_AI_RULE, weeklyAllowance: 300, costs: { ...INITIAL_AI_RULE.costs, transcription: 9 } };
    const first = await publish(tx, reduced, day(1));
    expect(first.preview.changes.every((change) => change.audience === 'all_users')).toBe(true);
    expect(await allowance.summary(tx, old, 'production', day(2))).toMatchObject({ available: 295, rule: { weeklyAllowance: 300, costs: { transcription: 9 } } });
    const recent = await account(tx);
    await member(tx, recent, day(2), day(33), first.result.id);
    expect(await allowance.summary(tx, recent, 'production', day(2))).toMatchObject({ total: 300, rule: { costs: { transcription: 9 } } });
    const second = await publish(tx, { ...reduced, weeklyAllowance: 600, costs: { ...reduced.costs, transcription: 2 } }, day(3), first.result.id);
    expect(second.preview.changes.every((change) => change.audience === 'all_users')).toBe(true);
    expect(await allowance.summary(tx, old, 'production', day(3))).toMatchObject({ total: 600, available: 595, rule: { costs: { transcription: 2 } } });
    expect(await allowance.summary(tx, recent, 'production', day(3))).toMatchObject({ total: 600, available: 600 });
    const restored = await publish(tx, reduced, day(4), second.result.id);
    expect((await allowance.summary(tx, old, 'production', day(4))).total).toBe(300);
    const next = await account(tx);
    await member(tx, next, day(5), day(36), restored.result.id);
    expect((await allowance.summary(tx, next, 'production', day(5))).total).toBe(300);
  }));

  it('replays original result and original price after a cost change; changed request body still conflicts', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const consumed = await consume(tx, owner, NOW);
    await publish(tx, { ...INITIAL_AI_RULE, costs: { ...INITIAL_AI_RULE.costs, transcription: 2 } }, day(1));
    const replay = await benefits.reserveAiPoints(tx, { ...consumed.input, reservedAt: day(1) });
    expect(replay).toEqual({ state: 'replay', data: consumed.result });
    expect(consumed.result.aiPoints.charged).toBe(5);
    await expect(benefits.reserveAiPoints(tx, { ...consumed.input, reservedAt: day(1), requestDigest: 'different' })).rejects.toThrow('ai_operation_idempotency_conflict');
    expect((await allowance.summary(tx, owner, 'production', day(1))).available).toBe(495);
  }));

  it('settles a cross-week request against its reserved week and releases failed requests without charge', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const before = new Date(NOW.getTime() + WEEK_MS - 10_000);
    const after = new Date(NOW.getTime() + WEEK_MS + 10_000);
    const consumed = await consume(tx, owner, before, 'transcription', 'production', after);
    expect(consumed.result.aiPoints.remaining).toBe(500);
    const batches = await tx.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId, owner));
    expect(batches.find((batch) => batch.ordinal === 0)?.consumedPoints).toBe(5);
    expect(batches.find((batch) => batch.ordinal === 1)?.consumedPoints).toBe(0);
    const failed = { ...consumed.input, operationId: randomUUID(), reservedAt: after };
    await benefits.reserveAiPoints(tx, failed);
    await benefits.releaseAiPoints(tx, { ...failed, releasedAt: after, failureCode: 'provider_failed' });
    expect((await allowance.summary(tx, owner, 'production', after)).available).toBe(500);
  }));

  it('charges one configurable total for each combined capability', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    expect((await consume(tx, owner, NOW, 'transcription_grammar')).result.aiPoints.charged).toBe(8);
    expect((await consume(tx, owner, NOW, 'transcription_opi')).result.aiPoints.charged).toBe(10);
    await publish(tx, { ...INITIAL_AI_RULE, costs: { ...INITIAL_AI_RULE.costs, transcription_grammar: 6, transcription_opi: 7 } }, day(1));
    expect((await consume(tx, owner, day(1), 'transcription_grammar')).result.aiPoints.charged).toBe(6);
    expect((await consume(tx, owner, day(1), 'transcription_opi')).result.aiPoints.charged).toBe(7);
    expect((await allowance.summary(tx, owner, 'production', day(1))).available).toBe(469);
  }));

  it('updates existing trial caps and retains the historical purchase identity at the migration cutoff', () => scenario(async (tx) => {
    const old = await account(tx);
    await benefits.grantFreeTrial(tx, { accountId: old, externalEligibilityClaimed: true, grantedAt: NOW });
    await publish(tx, { ...INITIAL_AI_RULE, trialAllowance: 50 }, day(1));
    const recent = await account(tx);
    await benefits.grantFreeTrial(tx, { accountId: recent, externalEligibilityClaimed: true, grantedAt: day(2) });
    expect((await allowance.summary(tx, old, 'production', day(2))).total).toBe(50);
    expect((await allowance.summary(tx, recent, 'production', day(2))).total).toBe(50);
    const initial = await rules.byId(tx, INITIAL_AI_RULE_ID);
    expect(await rules.purchaseTerms(tx, 'membership_31d_v1', new Date(initial.createdAt.getTime() - 1))).toMatchObject({ aiUsageRuleVersionId: null, aiPointRuleVersion: 'ai-points-v1' });
    expect(await rules.purchaseTerms(tx, 'membership_15d_v1', NOW)).toMatchObject({ aiUsageRuleVersionId: null });
    expect(await rules.purchaseTerms(tx, 'membership_31d_v1', NOW)).toMatchObject({ aiUsageRuleVersionId: INITIAL_AI_RULE_ID });
  }));

  it('publishes idempotently, rejects stale edits, and makes published rules immutable', () => scenario(async (tx) => {
    const { result, request, staff } = await publish(tx, { ...INITIAL_AI_RULE, weeklyAllowance: 600 }, day(1));
    expect(await rules.publish(tx, request, staff.id, day(1))).toEqual(result);
    await expect(rules.preview(tx, { ...request, idempotencyKey: randomUUID() }, day(1))).rejects.toThrow('ai_usage_rule_preview_stale');
    await expect(rules.publish(tx, { ...request, weeklyAllowance: 700 }, staff.id, day(1))).rejects.toThrow('ai_usage_rule_idempotency_conflict');
    const rows = await tx.select().from(schema.aiUsageRuleVersions).where(eq(schema.aiUsageRuleVersions.idempotencyKey, request.idempotencyKey));
    expect(rows).toHaveLength(1);
    // A savepoint isolates the expected database error from the rest of the transaction.
    await expect(tx.transaction(async (nested) => nested.update(schema.aiUsageRuleVersions).set({ weeklyAllowance: 700 }).where(eq(schema.aiUsageRuleVersions.id, result.id)))).rejects.toThrow();
    const [unchanged] = await tx.select().from(schema.aiUsageRuleVersions).where(eq(schema.aiUsageRuleVersions.id, result.id));
    expect(unchanged?.weeklyAllowance).toBe(600);
  }));
});


describe('operation recovery and privacy with the real persistent ledger', () => {
  it('retains a failed combination, resumes edited text once, and recovers the complete paid result', () => scenario(async (tx) => {
    const owner = await account(tx);
    const now = new Date();
    await member(tx, owner, new Date(now.getTime() - 60_000), new Date(now.getTime() + 86_400_000));
    await tx.insert(schema.aiConsentAuthorities).values({ userId: owner, policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION, revision: 1, active: true, updatedAt: now });
    await tx.insert(schema.aiConsents).values({ userId: owner, policyVersion: CURRENT_AI_CONSENT_POLICY_VERSION, acceptedAt: now, revision: 1 });
    const generateValidated = vi.fn(async (input: { validate: (value: unknown) => unknown }) => ({ data: input.validate({ grammarErrors: [], missingInformation: [], incorrectInformation: [], extraInformation: [] }), meta: {} }));
    generateValidated.mockRejectedValueOnce(new ObservedAiServiceException('ai_upstream_failed', 'upstream_failed', 1));
    const asr = { transcribe: vi.fn(async () => ({ rawTranscript: 'Climb flight level one eight zero.', meta: {} })) };
    const ai = new AiService({ db: tx } as never, { generateValidated, textModel: () => 'deepseek-v4-flash' } as never, asr as never, benefits);
    const grant = await ai.admitOperation(owner);
    const source = { bankId: 'radiotelephony' as const, categoryId: 'c', topicId: 't', version: 1, checksum: 'test' };
    const input = { mode: 'grammar' as const, module: 'atc' as const, questionId: 'q', analysisVersion: 2 as const, source };
    const materials = { questionText: 'Climb FL180.', contextText: '', referenceText: '', hasUnseenImage: false };
    const failedId = randomUUID();
    const before = (await allowance.summary(tx, owner, 'production', now)).available;
    await expect(ai.transcribeReview(owner, randomUUID(), Buffer.from('synthetic-audio'), 'audio/wav', '16k_en', input, grant, undefined, failedId, materials)).rejects.toThrow('ai_upstream_failed');
    expect((await allowance.summary(tx, owner, 'production', new Date())).available).toBe(before);
    const released = await ai.operationResult(owner, 'production', failedId);
    expect(released).toMatchObject({ state: 'released', partialTranscription: { rawTranscript: 'Climb flight level one eight zero.', input } });
    expect(await ai.operationResult(await account(tx), 'production', failedId)).toEqual({ state: 'missing' });
    expect(await ai.operationResult(owner, 'sandbox', failedId)).toEqual({ state: 'missing' });
    const resumedId = randomUUID();
    const resumedInput = { ...input, transcript: 'Climbing FL180.', resumeOperationId: failedId };
    const result = await ai.review(owner, randomUUID(), resumedInput, grant, undefined, resumedId, materials);
    const recovered = await ai.operationResult(owner, 'production', resumedId);
    expect(recovered).toMatchObject({ state: 'completed', capability: 'transcription_grammar', result: {
      transcript: resumedInput.transcript, rawTranscript: 'Climb flight level one eight zero.',
      review: { analysis: { module: 'atc' }, promptVersion: 'deepseek-review:v2' }, aiPoints: result.aiPoints,
    } });
    expect((await allowance.summary(tx, owner, 'production', new Date())).available).toBe(before - result.aiPoints!.charged);
    expect(await ai.review(owner, randomUUID(), resumedInput, grant, undefined, resumedId, materials)).toEqual(result);
    expect(asr.transcribe).toHaveBeenCalledTimes(1);
    expect(generateValidated).toHaveBeenCalledTimes(2);
    const [row] = await tx.select().from(schema.aiPointReservations).where(eq(schema.aiPointReservations.operationId, failedId));
    const expiredId = randomUUID();
    await benefits.reserveAiPoints(tx, { accountId: owner, environment: 'production', operationId: expiredId, requestDigest: 'expired-fixture', capability: 'transcription_grammar', reservedAt: new Date() });
    await tx.update(schema.aiPointReservations).set({ leaseUntil: new Date(0), resultPayload: row!.resultPayload }).where(eq(schema.aiPointReservations.operationId, expiredId));
    expect(await ai.operationResult(owner, 'production', expiredId)).toMatchObject({ state: 'released', partialTranscription: { input } });
    await new SyncService({ db: tx } as never, {} as never).deleteAllAiResults(owner, { confirmation: '删除全部AI结果', idempotencyKey: randomUUID() });
    expect(await ai.operationResult(owner, 'production', failedId)).toEqual({ state: 'missing' });
    expect(await ai.operationResult(owner, 'production', resumedId)).toEqual({ state: 'missing' });
  }));

  it('reads only the same account and environment, including after membership expiry and consent withdrawal', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const { input, result } = await consume(tx, owner, NOW);
    const ai = new AiService({ db: tx } as never, {} as never, {} as never, benefits);
    // No consent is inserted; removing membership cannot block access to already-owned results.
    await tx.delete(schema.membershipEntitlementSegments).where(eq(schema.membershipEntitlementSegments.accountId, owner));
    expect(await ai.operationResult(owner, 'production', input.operationId)).toEqual({ state: 'completed', capability: 'transcription', result });
    expect(await ai.operationResult(await account(tx), 'production', input.operationId)).toEqual({ state: 'missing' });
    expect(await ai.operationResult(owner, 'sandbox', input.operationId)).toEqual({ state: 'missing' });
  }));

  it.each(['ai', 'learning'] as const)('does not recover or settle results after %s reset and does not erase the financial ledger', (kind) => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const { input } = await consume(tx, owner, NOW);
    const pending = { ...input, operationId: randomUUID() };
    await benefits.reserveAiPoints(tx, pending);
    const sync = new SyncService({ db: tx } as never, {} as never);
    const ai = new AiService({ db: tx } as never, {} as never, {} as never, benefits);
    if (kind === 'ai') await sync.deleteAllAiResults(owner, { confirmation: '删除全部AI结果', idempotencyKey: randomUUID() });
    else await sync.clearLearningData(owner, { confirmation: '清除学习数据', idempotencyKey: randomUUID() });
    expect(await ai.operationResult(owner, 'production', input.operationId)).toEqual({ state: 'missing' });
    expect(await ai.operationResult(owner, 'production', pending.operationId)).toEqual({ state: 'missing' });
    await expect(benefits.reserveAiPoints(tx, input)).rejects.toThrow('ai_operation_result_deleted');
    await expect(benefits.settleAiPoints(tx, { ...pending, result: { transcript: 'Late result' }, settledAt: NOW })).rejects.toThrow('ai_operation_result_deleted');
    await benefits.releaseAiPoints(tx, { ...pending, failureCode: 'ai_operation_result_deleted', releasedAt: NOW });
    expect((await allowance.summary(tx, owner, 'production', NOW)).available).toBe(495);
    const rows = await tx.select().from(schema.aiPointReservations).where(eq(schema.aiPointReservations.accountId, owner));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.resultPayload === null && row.resultDeletedAt !== null)).toBe(true);
  }));

  it('clears a single result and blocks an in-flight completion for that record without deleting other results', () => scenario(async (tx) => {
    const owner = await account(tx);
    await member(tx, owner);
    const first = await consume(tx, owner, NOW);
    const second = await consume(tx, owner, NOW);
    const pending = { ...first.input, operationId: randomUUID() };
    await benefits.reserveAiPoints(tx, pending);
    const sync = new SyncService({ db: tx } as never, {} as never);
    const ai = new AiService({ db: tx } as never, {} as never, {} as never, benefits);
    for (const id of [first.input.operationId, pending.operationId]) {
      await tx.insert(schema.learningRecords).values({ userId: owner, clientRecordId: id, occurredAt: NOW,
        payload: { recordType: 'ai_result', sessionId: 'session-1', aiOperation: { operationId: id, environment: 'production', status: 'pending' } },
      });
      await sync.deleteAiResult(owner, id);
      expect(await ai.operationResult(owner, 'production', id)).toEqual({ state: 'missing' });
    }
    await expect(benefits.settleAiPoints(tx, { ...pending, result: { transcript: 'Late' }, settledAt: NOW })).rejects.toThrow('ai_operation_result_deleted');
    expect(await ai.operationResult(owner, 'production', second.input.operationId)).toMatchObject({ state: 'completed' });
  }));
});

it('clamps lowered caps, enforces actual reservation budgets, and keeps original charges', () => scenario(async tx => {
  const owner=await account(tx);await member(tx,owner);await consume(tx,owner,NOW);
  await publish(tx,{...INITIAL_AI_RULE,weeklyAllowance:3},day(1));
  expect((await allowance.summary(tx,owner,'production',day(1))).available).toBe(0);
  await expect(consume(tx,owner,day(1))).rejects.toThrow('insufficient_ai_points');
  const [batch]=await tx.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId,owner));
  expect(batch!.consumedPoints).toBe(5);
}));
it('resets consumed base only, keeps expiry, reservations and gifts separate, and supports repeated reset',()=>scenario(async tx=>{
  const owner=await account(tx);await member(tx,owner);await consume(tx,owner,NOW);
  await benefits.grantCompensation(tx,{accountId:owner,environment:'production',adjustmentId:randomUUID(),grantedAt:NOW,points:50});
  const before=await allowance.summary(tx,owner,'production',day(1));
  const reset=await allowance.resetBase(tx,owner,'production',day(1),randomUUID());
  expect(reset).toMatchObject({available:500,total:500,bonusAvailable:50});expect(reset.summary.resetAt).toBe(before.summary.resetAt);expect(reset.summary.membershipExpiresAt).toBe(before.summary.membershipExpiresAt);
  const [batch]=await tx.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.id,reset.batchIds[0]!));expect(batch!.consumedPoints).toBe(5);expect(batch!.allowanceConsumedBaseline).toBe(5);
  await consume(tx,owner,day(1));expect((await allowance.summary(tx,owner,'production',day(1))).available).toBe(495);
  expect((await allowance.resetBase(tx,owner,'production',day(2),randomUUID())).available).toBe(500);
  const input={accountId:owner,environment:'production' as const,capability:'transcription' as const,operationId:randomUUID(),requestDigest:'pending',reservedAt:day(2)};
  await benefits.reserveAiPoints(tx,input);await expect(allowance.resetBase(tx,owner,'production',day(2),randomUUID())).rejects.toThrow('allowance_request_in_progress');
  await benefits.releaseAiPoints(tx,{...input,releasedAt:day(2),failureCode:'test'});
  const free=await account(tx);await tx.update(schema.accounts).set({aiTrialEligibilityReason:'trial_already_claimed'}).where(eq(schema.accounts.id,free));
  expect((await allowance.resetBase(tx,free,'production',day(2),randomUUID()))).toMatchObject({available:100,total:100,summary:{mode:'trial'}});
  expect((await allowance.summary(tx,free,'sandbox',day(2))).available).toBe(0);
}));
it('restores exhausted free trial and recalculates it under later rule changes without losing historical consumption',()=>scenario(async tx=>{
  const owner=await account(tx);await benefits.grantFreeTrial(tx,{accountId:owner,externalEligibilityClaimed:true,grantedAt:NOW});
  await publish(tx,{...INITIAL_AI_RULE,trialAllowance:5},day(1));await consume(tx,owner,day(1));
  expect((await allowance.summary(tx,owner,'production',day(1))).available).toBe(0);
  await allowance.resetBase(tx,owner,'production',day(2),randomUUID());
  const current=await rules.effective(tx,day(2));await publish(tx,{...INITIAL_AI_RULE,trialAllowance:3,costs:{...INITIAL_AI_RULE.costs,transcription:2}},day(3),current.id);
  expect((await allowance.summary(tx,owner,'production',day(3))).available).toBe(3);
  await consume(tx,owner,day(3));expect((await allowance.summary(tx,owner,'production',day(3))).available).toBe(1);
  const [batch]=await tx.select().from(schema.aiPointBatches).where(eq(schema.aiPointBatches.accountId,owner));expect(batch!.consumedPoints).toBe(7);
}));

it('previews exact account count, resets atomically, rejects stale rules, and makes completed confirmation idempotent',()=>scenario(async tx=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(day(2));
  try {
    const owner=await account(tx),free=await account(tx),deleted=await account(tx);
    await member(tx,owner);await consume(tx,owner,NOW);await tx.update(schema.accounts).set({status:'deleted'}).where(eq(schema.accounts.id,deleted));
    await benefits.grantFreeTrial(tx,{accountId:free,externalEligibilityClaimed:true,grantedAt:NOW});await consume(tx,free,NOW);
    const [admin]=await tx.insert(schema.opsStaffAccounts).values({email:`${randomUUID()}@test.invalid`,role:'admin',passwordHash:'x',totpSecretCiphertext:'x',totpSecretIv:'x',totpSecretTag:'x',totpConfirmedAt:NOW}).returning();
    const [session]=await tx.insert(schema.opsStaffSessions).values({staffId:admin!.id,tokenHash:randomUUID(),totpVerifiedAt:NOW,createdAt:NOW,expiresAt:day(20)}).returning();
    const staff={id:admin!.id,email:admin!.email,role:'admin' as const,sessionId:session!.id};
    const db={db:tx} as unknown as DatabaseService;
    const service=new AdminGlobalResetService({opsSessionHashSecret:'isolated-test-only'} as OpsApiConfig,db,allowance,rules,benefits);
    const p=await service.preview({environment:'production',reason:'验证批量重置与账本保留'},staff,randomUUID());expect(p.count).toBe(2);
    const pending={accountId:free,environment:'production' as const,capability:'transcription' as const,operationId:randomUUID(),requestDigest:'pending',reservedAt:day(2)};
    await benefits.reserveAiPoints(tx,pending);
    await expect(service.execute(p.previewId,p.confirmationToken,staff,randomUUID())).rejects.toThrow('allowance_request_in_progress');
    expect((await allowance.summary(tx,owner,'production',day(2))).available).toBe(495);
    await benefits.releaseAiPoints(tx,{...pending,releasedAt:day(2),failureCode:'test'});
    await service.execute(p.previewId,p.confirmationToken,staff,randomUUID());
    expect((await allowance.summary(tx,owner,'production',day(2))).available).toBe(500);expect((await allowance.summary(tx,free,'production',day(2))).available).toBe(100);
    await consume(tx,owner,day(2));await service.execute(p.previewId,p.confirmationToken,staff,randomUUID());expect((await allowance.summary(tx,owner,'production',day(2))).available).toBe(495);
    const p2=await service.preview({environment:'production',reason:'验证预览后规则变更拦截'},staff,randomUUID());
    await publish(tx,{...INITIAL_AI_RULE,weeklyAllowance:600},day(2));
    await expect(service.execute(p2.previewId,p2.confirmationToken,staff,randomUUID())).rejects.toThrow('ai_usage_rule_preview_stale');
    const audit=await tx.select().from(schema.opsAuditEvents).where(eq(schema.opsAuditEvents.action,'ops.allowances.reset.execute'));expect(audit).toHaveLength(1);
  } finally {vi.useRealTimers();}
}));
it('lists users with real phone, membership and order search, pagination and detail',()=>scenario(async tx=>{
  const owner=await account(tx);await member(tx,owner);const auth=randomUUID();
  await tx.execute(sql`insert into auth.users(id,phone) values(${auth}::uuid,'8613800000011')`);
  await tx.insert(schema.accountIdentities).values({accountId:owner,authUserId:auth,provider:'phone',subjectHash:'a'.repeat(64)});
  const controller=new AdminUsersController({db:tx} as unknown as DatabaseService,{allowanceForAdmin:(id:string,env:'production'|'sandbox')=>allowance.summary(tx,id,env,NOW)} as CommerceService,{record:async()=>{}} as unknown as AdminAuditService,{} as AdminGlobalResetService);
  const req={id:randomUUID(),headers:{},opsStaff:{id:randomUUID(),email:'test@example.invalid',role:'admin' as const,sessionId:randomUUID()}};
  const listing=await controller.list({query:'13800000011',limit:1},req);expect(listing.data.total).toBe(1);expect(listing.data.rows[0]).toMatchObject({account_id:owner,phone:'8613800000011'});
  const none=await controller.list({query:'13800000011',page:2,limit:1},req);expect(none.data.total).toBe(1);expect(none.data.rows).toHaveLength(0);
  const detail=await controller.detail(owner,'production',req);expect(detail.data.orders).toHaveLength(1);
  const orderSearch=await controller.list({query:String(detail.data.orders[0]!.external_order_id)},req);expect(orderSearch.data.total).toBe(1);
}));
