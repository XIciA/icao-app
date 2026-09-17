import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WechatCheckout, WechatCheckoutRequest, WechatPayCatalog } from '@icao/contracts/wechat-pay';
import { DatabaseService } from '../database/database.service';
import { accounts, wechatPaymentAttempts } from '../database/schema';
import { AiUsageRulesService } from './ai-usage-rules.service';
import { CommerceService } from './commerce.service';
import { ACTIVE_MEMBERSHIP_PRODUCTS } from './product-catalog';
import { WechatMerchantClient, WechatMerchantError } from './wechat-merchant-client';

type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];
type Attempt = typeof wechatPaymentAttempts.$inferSelect;
const amountSchema = z.object({ total: z.number().int().positive(), currency: z.literal('CNY') });
const tradeSchema = z.object({ appid: z.string(), mchid: z.string(), out_trade_no: z.string(), trade_type: z.literal('APP'),
  transaction_id: z.string().optional(), trade_state: z.enum(['SUCCESS', 'REFUND', 'NOTPAY', 'CLOSED', 'REVOKED', 'USERPAYING', 'PAYERROR']),
  amount: amountSchema, success_time: z.string().datetime({ offset: true }).optional() });
const refundSchema = z.object({ mchid: z.string().optional(), out_trade_no: z.string(), transaction_id: z.string(),
  out_refund_no: z.string(), refund_id: z.string(), status: z.enum(['SUCCESS', 'CLOSED', 'PROCESSING', 'ABNORMAL']).optional(),
  refund_status: z.enum(['SUCCESS', 'CLOSED', 'PROCESSING', 'ABNORMAL']).optional(),
  success_time: z.string().datetime({ offset: true }).optional(),
  // Refund notifications omit currency; query/refund API responses include CNY.
  amount: z.object({ total: z.number().int().positive(), refund: z.number().int().positive(), currency: z.literal('CNY').optional() }) });
const tradeNumber = (id: string) => id.replaceAll('-', '');
function attemptId(trade: string) {
  if (!/^[0-9a-f]{32}$/u.test(trade)) throw new BadRequestException('invalid_wechat_order');
  return `${trade.slice(0, 8)}-${trade.slice(8, 12)}-${trade.slice(12, 16)}-${trade.slice(16, 20)}-${trade.slice(20)}`;
}

@Injectable()
export class WechatPayService {
  constructor(private readonly database: DatabaseService, private readonly merchant: WechatMerchantClient,
    private readonly commerce: CommerceService, private readonly rules: AiUsageRulesService) {}

  catalog(): WechatPayCatalog {
    return { available: this.merchant.available, products: this.merchant.available ? ACTIVE_MEMBERSHIP_PRODUCTS.map((product) => ({
      productKey: product.productKey, title: product.displayName, amountFen: product.basePriceCnyFen,
      currency: 'CNY', durationDays: product.durationDays,
    })) : [] };
  }
  private async active(tx: Transaction, owner: string) {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, owner)).limit(1);
    if (account?.status !== 'active') throw new ConflictException('account_unavailable');
  }
  private async lock(tx: Transaction, id: string, owner?: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-pay:${id}`}, 0))`);
    const [attempt] = await tx.select().from(wechatPaymentAttempts).where(eq(wechatPaymentAttempts.id, id)).limit(1);
    if (!attempt || (owner && owner !== attempt.accountId)) throw new NotFoundException('wechat_checkout_not_found');
    return attempt;
  }
  private async view(attempt: Attempt, includePayment = false): Promise<WechatCheckout> {
    return { id: attempt.id, productKey: attempt.productKey, amountFen: attempt.amountFen, currency: 'CNY',
      state: attempt.state as WechatCheckout['state'], expiresAt: attempt.expiresAt.toISOString(),
      ...(includePayment && attempt.state === 'pending' && attempt.prepayId && attempt.expiresAt.getTime() > Date.now()
        ? { payment: this.merchant.paymentParameters(attempt.prepayId) } : {}),
      ...(['paid', 'refunded'].includes(attempt.state)
        ? { entitlement: (await this.commerce.currentEntitlement(attempt.accountId)).production } : {}),
    };
  }
  async create(owner: string, input: WechatCheckoutRequest): Promise<WechatCheckout> {
    this.merchant.config();
    const product = ACTIVE_MEMBERSHIP_PRODUCTS.find((candidate) => candidate.productKey === input.productKey);
    if (!product) throw new BadRequestException('wechat_product_unavailable');
    const attempt = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${owner}`}, 0))`);
      await this.active(tx, owner);
      const [previous] = await tx.select().from(wechatPaymentAttempts).where(and(eq(wechatPaymentAttempts.accountId, owner),
        eq(wechatPaymentAttempts.idempotencyKey, input.idempotencyKey))).limit(1);
      if (previous) {
        if (previous.productKey !== input.productKey) throw new ConflictException('wechat_checkout_idempotency_conflict');
        return previous;
      }
      const [pending] = await tx.select().from(wechatPaymentAttempts).where(and(eq(wechatPaymentAttempts.accountId, owner),
        eq(wechatPaymentAttempts.state, 'pending'))).limit(1);
      if (pending) throw new ConflictException('wechat_checkout_pending');
      const now = new Date();
      const rule = await this.rules.effective(tx, now);
      const [created] = await tx.insert(wechatPaymentAttempts).values({ accountId: owner, idempotencyKey: input.idempotencyKey,
        productKey: product.productKey, description: `听你五个 ${product.displayName}`, durationDays: product.durationDays,
        amountFen: product.basePriceCnyFen, aiUsageRuleVersionId: rule.id, expiresAt: new Date(now.getTime() + 30 * 60_000),
      }).returning();
      if (!created) throw new Error('wechat_checkout_insert_failed');
      return created;
    });
    const ready = await this.database.db.transaction(async (tx) => {
      const current = await this.lock(tx, attempt.id, owner);
      await this.active(tx, owner);
      if (current.state !== 'pending' || current.prepayId || current.expiresAt.getTime() <= Date.now()) return current;
      const config = this.merchant.config();
      const response = z.object({ prepay_id: z.string().min(1).max(64) }).safeParse(await this.merchant.request('POST', '/v3/pay/transactions/app', {
        appid: config.appId, mchid: config.merchantId, out_trade_no: tradeNumber(current.id),
        description: current.description, time_expire: current.expiresAt.toISOString(), notify_url: config.notifyUrl,
        amount: { total: current.amountFen, currency: 'CNY' },
      }));
      if (!response.success) throw new BadRequestException('wechat_pay_invalid_response');
      const [updated] = await tx.update(wechatPaymentAttempts).set({ prepayId: response.data.prepay_id, updatedAt: new Date() })
        .where(eq(wechatPaymentAttempts.id, current.id)).returning();
      return updated!;
    });
    return this.view(ready, true);
  }
  async pending(owner: string): Promise<WechatCheckout | null> {
    const [attempt] = await this.database.db.select().from(wechatPaymentAttempts).where(and(eq(wechatPaymentAttempts.accountId, owner),
      inArray(wechatPaymentAttempts.state, ['pending', 'refund_pending']))).orderBy(desc(wechatPaymentAttempts.createdAt)).limit(1);
    return attempt ? this.view(attempt) : null;
  }
  async status(owner: string, id: string): Promise<WechatCheckout> {
    const attempt = await this.database.db.transaction(async (tx) => {
      const current = await this.lock(tx, id, owner);
      await this.active(tx, owner);
      return this.reconcile(tx, current);
    });
    return this.view(attempt);
  }
  private async reconcile(tx: Transaction, attempt: Attempt) {
    if (attempt.state === 'closed' || attempt.state === 'refunded') return attempt;
    if (attempt.state === 'refund_pending') {
      return this.applyRefund(tx, attempt, await this.merchant.request('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(attempt.refundNumber ?? tradeNumber(attempt.id))}`));
    }
    const config = this.merchant.config();
    try {
      const current = await this.applyTrade(tx, attempt, await this.merchant.request('GET', `/v3/pay/transactions/out-trade-no/${tradeNumber(attempt.id)}?mchid=${config.merchantId}`));
      // Expiration alone is not proof of non-payment: close through WeChat after querying it.
      return current.state === 'pending' && current.expiresAt.getTime() <= Date.now() ? this.closePending(tx, current) : current;
    } catch (error) {
      if (error instanceof WechatMerchantError && error.providerCode === 'ORDER_NOT_EXIST' && !attempt.prepayId) {
        return attempt.expiresAt.getTime() <= Date.now() ? this.closePending(tx, attempt) : attempt;
      }
      throw error;
    }
  }
  private async applyTrade(tx: Transaction, attempt: Attempt, raw: unknown): Promise<Attempt> {
    const result = tradeSchema.safeParse(raw);
    if (!result.success) throw new BadRequestException('wechat_pay_invalid_transaction');
    const trade = result.data;
    const config = this.merchant.config();
    if (trade.appid !== config.appId || trade.mchid !== config.merchantId || trade.out_trade_no !== tradeNumber(attempt.id)
      || trade.amount.total !== attempt.amountFen || (attempt.transactionId && trade.transaction_id !== attempt.transactionId)) {
      throw new ConflictException('wechat_pay_transaction_mismatch');
    }
    let updates: Partial<Attempt> = {};
    if (trade.trade_state === 'SUCCESS' || trade.trade_state === 'REFUND') {
      if (!trade.transaction_id || !trade.success_time) throw new BadRequestException('wechat_pay_invalid_transaction');
      await this.commerce.fulfillWechatPayment(tx, { accountId: attempt.accountId, transactionId: trade.transaction_id,
        productKey: attempt.productKey, durationDays: attempt.durationDays, ruleVersionId: attempt.aiUsageRuleVersionId,
        paidAt: new Date(trade.success_time) });
      updates = { state: attempt.state === 'refund_pending' ? 'refund_pending' : 'paid', transactionId: trade.transaction_id, paidAt: new Date(trade.success_time) };
    } else if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(trade.trade_state) && attempt.state === 'pending') updates = { state: 'closed' };
    if (!Object.keys(updates).length) return attempt;
    const [updated] = await tx.update(wechatPaymentAttempts).set({ ...updates, updatedAt: new Date() }).where(eq(wechatPaymentAttempts.id, attempt.id)).returning();
    return updated!;
  }
  async cancel(owner: string, id: string) {
    const result = await this.database.db.transaction(async (tx) => {
      let attempt = await this.lock(tx, id, owner);
      await this.active(tx, owner);
      attempt = await this.reconcile(tx, attempt);
      if (attempt.state !== 'pending') return attempt;
      return this.closePending(tx, attempt);
    });
    return this.view(result);
  }
  private async closePending(tx: Transaction, attempt: Attempt): Promise<Attempt> {
    const config = this.merchant.config();
    try {
      await this.merchant.request('POST', `/v3/pay/transactions/out-trade-no/${tradeNumber(attempt.id)}/close`, { mchid: config.merchantId });
    } catch (error) {
      if (error instanceof WechatMerchantError && error.providerCode === 'ORDERPAID') {
        // A payment racing the close must be fulfilled, never discarded as expired/cancelled.
        return this.applyTrade(tx, attempt, await this.merchant.request('GET', `/v3/pay/transactions/out-trade-no/${tradeNumber(attempt.id)}?mchid=${config.merchantId}`));
      }
      if (!(error instanceof WechatMerchantError && error.providerCode === 'ORDER_NOT_EXIST' && !attempt.prepayId)) throw error;
    }
    const [updated] = await tx.update(wechatPaymentAttempts).set({ state: 'closed', updatedAt: new Date() })
      .where(eq(wechatPaymentAttempts.id, attempt.id)).returning();
    return updated!;
  }
  /** Called only by authorized merchant operations, never by a client-reported payment result. */
  async refund(id: string, reason: string) {
    // Commit the refund intent before contacting WeChat. An accepted refund whose response
    // is lost must remain discoverable for reconciliation after a restart.
    await this.database.db.transaction(async (tx) => {
      let current = await this.lock(tx, id);
      if (current.state === 'refunded' || current.state === 'refund_pending') return;
      current = await this.reconcile(tx, current);
      if (current.state === 'refunded') return;
      if (current.state !== 'paid') throw new ConflictException('wechat_refund_not_paid');
      await tx.update(wechatPaymentAttempts).set({ state: 'refund_pending',
        refundNumber: current.refundNumber ?? tradeNumber(id), updatedAt: new Date() }).where(eq(wechatPaymentAttempts.id, id));
    });
    const attempt = await this.database.db.transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.state === 'refunded') return current;
      if (current.state !== 'refund_pending') throw new ConflictException('wechat_refund_not_paid');
      // Same merchant refund number is used on every retry, including an uncertain network result.
      const raw = await this.merchant.request('POST', '/v3/refund/domestic/refunds', {
        transaction_id: current.transactionId, out_refund_no: current.refundNumber ?? tradeNumber(id), reason: reason.slice(0, 80),
        notify_url: this.merchant.config().notifyUrl, amount: { refund: current.amountFen, total: current.amountFen, currency: 'CNY' },
      });
      return this.applyRefund(tx, current, raw);
    });
    return this.view(attempt);
  }
  private async applyRefund(tx: Transaction, attempt: Attempt, raw: unknown): Promise<Attempt> {
    const parsed = refundSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('wechat_pay_invalid_refund');
    const refund = parsed.data;
    if ((refund.mchid && refund.mchid !== this.merchant.config().merchantId) || refund.out_trade_no !== tradeNumber(attempt.id)
      || refund.transaction_id !== attempt.transactionId || refund.amount.total !== attempt.amountFen || refund.amount.refund !== attempt.amountFen) {
      throw new ConflictException('wechat_pay_refund_mismatch');
    }
    const state = refund.status ?? refund.refund_status;
    if (!state) throw new BadRequestException('wechat_pay_invalid_refund');
    if (attempt.state === 'refunded') return attempt;
    if (state === 'SUCCESS') {
      if (!refund.success_time) throw new BadRequestException('wechat_pay_invalid_refund');
      await this.commerce.refundWechatPayment(tx, { accountId: attempt.accountId, transactionId: refund.transaction_id,
        refundId: refund.refund_id, refundedAt: new Date(refund.success_time) });
    }
    const [updated] = await tx.update(wechatPaymentAttempts).set({ state: state === 'SUCCESS' ? 'refunded' : state === 'CLOSED' ? 'paid' : 'refund_pending',
      refundId: refund.refund_id, refundNumber: refund.out_refund_no, updatedAt: new Date() }).where(eq(wechatPaymentAttempts.id, attempt.id)).returning();
    return updated!;
  }
  async notification(raw: Buffer, headers: { get(name: string): string | null }) {
    const event = this.merchant.notification(raw, headers);
    const value = event.resource as { out_trade_no?: unknown };
    if (typeof value?.out_trade_no !== 'string') throw new BadRequestException('invalid_wechat_order');
    const id = attemptId(value.out_trade_no);
    await this.database.db.transaction(async (tx) => {
      let attempt = await this.lock(tx, id);
      if (event.eventType === 'TRANSACTION.SUCCESS') {
        if (attempt.state !== 'refunded') await this.applyTrade(tx, attempt, event.resource);
      } else if (event.eventType.startsWith('REFUND.')) {
        // A refund notification may arrive before the original payment notification.
        if (!attempt.transactionId) attempt = await this.reconcile(tx, attempt);
        await this.applyRefund(tx, attempt, event.resource);
      } else throw new BadRequestException('unsupported_wechat_pay_notification');
    });
  }
}
