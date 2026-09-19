import { CommerceService } from '../src/commerce/commerce.service';
import { WechatPayService } from '../src/commerce/wechat-pay.service';
import { WechatMerchantError } from '../src/commerce/wechat-merchant-client';
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

import * as schema from '../src/database/schema';
import { AiUsageRulesService, type CommerceTransaction } from '../src/commerce/ai-usage-rules.service';
import { AiAllowanceService } from '../src/commerce/ai-allowance.service';
import { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service';

// An isolated local cluster tests the real services, joins, constraints and ledger writes.
// No environment files, existing clusters, customer accounts or network services are used.
const root = mkdtempSync(join(tmpdir(), 'icao-wechat-pay-test-'));
const data = join(root, 'data');
let started = false;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
const rules = new AiUsageRulesService();
const allowance = new AiAllowanceService(rules);
const benefits = new PersistentCommerceBenefitsService(allowance, rules);

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
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
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

async function owner(tx: CommerceTransaction) {
  const [row] = await tx.insert(schema.accounts).values({}).returning();
  return row!.id;
}

function fixture(tx: CommerceTransaction) {
  const appId = 'wx1234567890'; const merchantId = '1900000001';
  const trades = new Map<string, Record<string, unknown>>();
  const request = vi.fn(async (method: string, path: string, body?: Record<string, unknown>): Promise<unknown> => {
    if (path === '/v3/pay/transactions/app') {
      const id = body!.out_trade_no as string;
      trades.set(id, trades.get(id) ?? { appid: appId, mchid: merchantId, out_trade_no: id, trade_type: 'APP', trade_state: 'NOTPAY', amount: body!.amount });
      return { prepay_id: `prepay-${id}` };
    }
    if (path.includes('/close')) {
      const id = path.split('/')[5]!;
      const trade = trades.get(id)!;
      if (trade.trade_state === 'SUCCESS') throw new WechatMerchantError('ORDERPAID', 400);
      trade.trade_state = 'CLOSED';
      return {};
    }
    if (method === 'GET' && path.includes('/transactions/')) return trades.get(path.split('/')[5]!.split('?')[0]!);
    if (path === '/v3/refund/domestic/refunds') {
      const trade = [...trades.values()].find((value) => value.transaction_id === body!.transaction_id)!;
      trade.trade_state = 'REFUND';
      return { mchid: merchantId, out_trade_no: trade.out_trade_no, transaction_id: trade.transaction_id,
        out_refund_no: body!.out_refund_no, refund_id: 'refund-provider-1', status: 'SUCCESS', success_time: new Date().toISOString(), amount: body!.amount };
    }
    throw new Error(`unexpected_fixture_request:${method}:${path}`);
  });
  const merchant = { available: true, config: () => ({ appId, merchantId, notifyUrl: 'https://test.invalid/v1/commerce/wechat/notifications' }), request,
    paymentParameters: (prepayId: string) => ({ appId, partnerId: merchantId, prepayId, packageValue: 'Sign=WXPay', nonceStr: 'nonce', timeStamp: '1', sign: 'test-only' }),
    notification: (raw: Buffer) => JSON.parse(raw.toString()) as unknown };
  const db = { db: tx };
  const commerce = new CommerceService({} as never, db as never, {} as never, benefits);
  const service = new WechatPayService(db as never, merchant as never, commerce, rules);
  function paid(id: string) {
    const trade = trades.get(id.replaceAll('-', ''))!;
    trade.trade_state = 'SUCCESS'; trade.transaction_id = `wx-${id}`; trade.success_time = new Date().toISOString();
    return trade;
  }
  return { service, request, trades, paid };
}

describe('WeChat checkout joins the existing commerce ledger', () => {
  it('rejects new day-pass purchases but settles an existing paid day pass exactly once', () => scenario(async (tx) => {
    const accountId = await owner(tx);
    const { service, paid } = fixture(tx);
    expect(service.catalog().products.map((p) => [p.durationDays, p.amountFen])).toEqual([[7, 6800], [31, 15800], [93, 35800]]);
    await expect(service.create(accountId, { productKey: 'membership_1d_v1', idempotencyKey: randomUUID() })).rejects.toThrow('wechat_product_unavailable');
    // Represent a pending checkout saved before the offering was retired.
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    await tx.update(schema.wechatPaymentAttempts).set({ productKey: 'membership_1d_v1', durationDays: 1, amountFen: 100 }).where(eq(schema.wechatPaymentAttempts.id, checkout.id));
    const trade = paid(checkout.id);
    trade.amount = { total: 100, currency: 'CNY' };
    const result = await service.status(accountId, checkout.id);
    expect(result.entitlement?.membership.active).toBe(true);
    expect(Date.parse(result.entitlement!.membership.expiresAt!) - Date.parse(trade.success_time as string)).toBe(86_400_000);
    await service.status(accountId, checkout.id);
    const orders = await tx.select().from(schema.commerceOrders).where(eq(schema.commerceOrders.accountId, accountId));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ productKey: 'membership_1d_v1', durationDays: 1, membershipContributionMs: 86_400_000, aiPointRuleVersion: 'ai-weekly-v1' });
  }));

  it('queries and closes the real unpaid response shape without trade_type, but rejects paid responses missing it', () => scenario(async (tx) => {
    const accountId = await owner(tx);
    const { service, trades, paid } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    delete trades.get(checkout.id.replaceAll('-', ''))!.trade_type;
    expect((await service.status(accountId, checkout.id)).state).toBe('pending');
    const trade = paid(checkout.id);
    await expect(service.status(accountId, checkout.id)).rejects.toThrow('wechat_pay_invalid_transaction');
    trade.trade_state = 'NOTPAY'; delete trade.transaction_id; delete trade.success_time;
    expect((await service.cancel(accountId, checkout.id)).state).toBe('closed');
    const orders = await tx.select().from(schema.commerceOrders).where(eq(schema.commerceOrders.accountId, accountId));
    expect(orders).toHaveLength(0);
  }));

  it('creates idempotently, grants only after verified payment, and replays callbacks without duplicate membership', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, request, paid } = fixture(tx);
    const input = { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() };
    const first = await service.create(accountId, input);
    expect(first.state).toBe('pending'); expect(first.payment?.prepayId).toBeTruthy();
    expect((await service.create(accountId, input)).id).toBe(first.id);
    expect(request.mock.calls.filter(([, path]) => path === '/v3/pay/transactions/app')).toHaveLength(1);
    expect(await tx.select().from(schema.commerceOrders)).toHaveLength(0);
    const trade = paid(first.id);
    expect((await service.status(accountId, first.id)).entitlement?.membership.active).toBe(true);
    await service.notification(Buffer.from(JSON.stringify({ eventType: 'TRANSACTION.SUCCESS', resource: trade })), { get: () => null });
    const orders = await tx.select().from(schema.commerceOrders).where(eq(schema.commerceOrders.accountId, accountId));
    expect(orders).toHaveLength(1); expect(orders[0]).toMatchObject({ channel: 'wechat_pay', durationDays: 7, aiPointRuleVersion: 'ai-weekly-v1' });
    expect(await tx.select().from(schema.membershipEntitlementSegments)).toHaveLength(1);
    await expect(service.status(await owner(tx), first.id)).rejects.toThrow('wechat_checkout_not_found');
    await expect(service.create(accountId, { ...input, productKey: 'membership_31d_v1' })).rejects.toThrow('wechat_checkout_idempotency_conflict');
  }));
  it('rejects mismatched amount/app ownership before writing paid orders', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_31d_v1', idempotencyKey: randomUUID() });
    const trade = paid(checkout.id); trade.amount = { total: 1, currency: 'CNY' };
    await expect(service.status(accountId, checkout.id)).rejects.toThrow('wechat_pay_transaction_mismatch');
    expect(await tx.select().from(schema.commerceOrders)).toHaveLength(0);
    trade.amount = { total: 15800, currency: 'CNY' }; trade.appid = 'wrong-app';
    await expect(service.status(accountId, checkout.id)).rejects.toThrow('wechat_pay_transaction_mismatch');
  }));
  it('allows cancelling an unpaid checkout, and never marks an already paid checkout cancelled', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid } = fixture(tx);
    const first = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    expect((await service.cancel(accountId, first.id)).state).toBe('closed');
    expect((await service.cancel(accountId, first.id)).state).toBe('closed');
    const second = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() }); paid(second.id);
    expect((await service.cancel(accountId, second.id)).state).toBe('paid');
  }));
  it('closes an expired unpaid checkout during reconciliation and releases a new purchase', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, request } = fixture(tx);
    const first = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    await tx.update(schema.wechatPaymentAttempts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.wechatPaymentAttempts.id, first.id));
    expect((await service.status(accountId, first.id)).state).toBe('closed');
    expect(request.mock.calls.some(([, path]) => path.endsWith('/close'))).toBe(true);
    expect(await service.pending(accountId)).toBeNull();
    expect((await service.create(accountId, { productKey: 'membership_31d_v1', idempotencyKey: randomUUID() })).state).toBe('pending');
  }));
  it('fulfills an expired local checkout that WeChat confirms was paid', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid, request } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    await tx.update(schema.wechatPaymentAttempts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.wechatPaymentAttempts.id, checkout.id));
    paid(checkout.id);
    expect((await service.status(accountId, checkout.id)).entitlement?.membership.active).toBe(true);
    expect(request.mock.calls.some(([, path]) => path.endsWith('/close'))).toBe(false);
  }));
  it('fulfills a payment that races closing an expired checkout', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid, request } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    await tx.update(schema.wechatPaymentAttempts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.wechatPaymentAttempts.id, checkout.id));
    const implementation = request.getMockImplementation()!;
    request.mockImplementation(async (method, path, body) => {
      if (path.endsWith('/close')) paid(checkout.id);
      return implementation(method, path, body);
    });
    const result = await service.status(accountId, checkout.id);
    expect(result.state).toBe('paid');
    expect(result.entitlement?.membership.active).toBe(true);
  }));
  it('reuses the merchant order when creation succeeds remotely but its response is lost', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, request, trades } = fixture(tx);
    const input = { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() };
    const implementation = request.getMockImplementation()!;
    let first = true;
    request.mockImplementation(async (method, path, body) => {
      const result = await implementation(method, path, body);
      if (first && path === '/v3/pay/transactions/app') { first = false; throw new Error('uncertain response'); }
      return result;
    });
    await expect(service.create(accountId, input)).rejects.toThrow('uncertain response');
    const pending = await service.pending(accountId);
    expect(pending?.state).toBe('pending');
    const recovered = await service.create(accountId, input);
    expect(recovered.id).toBe(pending?.id);
    expect(recovered.payment?.prepayId).toBeTruthy();
    expect(trades.size).toBe(1);
  }));
  it('refunds through the same order and revocation ledger, preserving another active purchase', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid, request } = fixture(tx);
    const first = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() }); paid(first.id); await service.status(accountId, first.id);
    const second = await service.create(accountId, { productKey: 'membership_31d_v1', idempotencyKey: randomUUID() }); paid(second.id); await service.status(accountId, second.id);
    expect((await service.refund(first.id, 'authorized test refund')).state).toBe('refunded');
    expect((await service.refund(first.id, 'retry')).state).toBe('refunded');
    expect(request.mock.calls.filter(([, path]) => path === '/v3/refund/domestic/refunds')).toHaveLength(1);
    const orders = await tx.select().from(schema.commerceOrders).where(eq(schema.commerceOrders.accountId, accountId));
    expect(orders.filter((order) => order.status === 'refunded')).toHaveLength(1);
    expect(orders.filter((order) => order.status === 'verified')).toHaveLength(1);
    expect((await service.status(accountId, second.id)).entitlement?.membership.active).toBe(true);
  }));
  it('retains the refund intent after an uncertain request and retries with the same refund number', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid, request } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    paid(checkout.id); await service.status(accountId, checkout.id);
    const implementation = request.getMockImplementation()!;
    let first = true;
    request.mockImplementation(async (method, path, body) => {
      if (first && path === '/v3/refund/domestic/refunds') {
        first = false;
        throw new Error('wechat_pay_request_uncertain');
      }
      return implementation(method, path, body);
    });
    await expect(service.refund(checkout.id, 'authorized refund')).rejects.toThrow('wechat_pay_request_uncertain');
    const [attempt] = await tx.select().from(schema.wechatPaymentAttempts).where(eq(schema.wechatPaymentAttempts.id, checkout.id));
    expect(attempt).toMatchObject({ state: 'refund_pending', refundNumber: checkout.id.replaceAll('-', '') });
    expect((await service.pending(accountId))?.state).toBe('refund_pending');
    expect((await service.refund(checkout.id, 'retry same refund')).state).toBe('refunded');
    const numbers = request.mock.calls.filter(([, path]) => path === '/v3/refund/domestic/refunds').map(([, , body]) => body?.out_refund_no);
    expect(numbers).toEqual([attempt!.refundNumber, attempt!.refundNumber]);
  }));
  it('accepts the official refund notification shape without a currency field and preserves the merchant refund number', () => scenario(async (tx) => {
    const accountId = await owner(tx); const { service, paid } = fixture(tx);
    const checkout = await service.create(accountId, { productKey: 'membership_7d_v1', idempotencyKey: randomUUID() });
    const trade = paid(checkout.id); await service.status(accountId, checkout.id);
    const notification = Buffer.from(JSON.stringify({ eventType: 'REFUND.SUCCESS', resource: {
      mchid: '1900000001', out_trade_no: checkout.id.replaceAll('-', ''), transaction_id: trade.transaction_id,
      out_refund_no: 'manual-merchant-refund', refund_id: 'wx-refund', refund_status: 'SUCCESS', success_time: new Date().toISOString(),
      amount: { total: checkout.amountFen, refund: checkout.amountFen, payer_total: checkout.amountFen, payer_refund: checkout.amountFen },
    } }));
    await service.notification(notification, { get: () => null });
    await service.notification(notification, { get: () => null });
    const [attempt] = await tx.select().from(schema.wechatPaymentAttempts).where(eq(schema.wechatPaymentAttempts.id, checkout.id));
    expect(attempt).toMatchObject({ state: 'refunded', refundNumber: 'manual-merchant-refund' });
    expect((await service.status(accountId, checkout.id)).entitlement?.membership.active).toBe(false);
  }));
});
