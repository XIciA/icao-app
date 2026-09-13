import { ConflictException, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { AiAllowanceSummary, AiUsageRuleValues } from '@icao/contracts/commerce-rules';

import {
  accounts, aiAllowanceAccounts, aiPointBatches, aiPointLedgerEntries, commerceOrders, membershipEntitlementSegments,
} from '../database/schema';
import { allowancePeriod, remainingPercent } from './ai-allowance-domain';
import { AiUsageRulesService, type CommerceTransaction, ruleValues } from './ai-usage-rules.service';
import type { CommerceEnvironment } from './product-catalog';

export type AllowanceContext = {
  rule: AiUsageRuleValues;
  ruleVersion: string;
  batchIds: string[];
  available: number;
  total: number;
  bonusBatchIds: string[];
  bonusAvailable: number;
  legacyBatchIds: string[];
  legacyAvailable: number;
  summary: AiAllowanceSummary;
};

@Injectable()
export class AiAllowanceService {
  constructor(private readonly rules: AiUsageRulesService = new AiUsageRulesService()) {}

  /** The caller holds the same account advisory lock used by reservations and orders. */
  async prepare(transaction: CommerceTransaction, accountId: string, environment: CommerceEnvironment, now: Date): Promise<AllowanceContext> {
    const current = await this.rules.effective(transaction, now);
    const segments = await transaction.select({
      startsAt: membershipEntitlementSegments.startsAt,
      endsAt: membershipEntitlementSegments.endsAt,
      purchasedAt: commerceOrders.purchasedAt,
      ruleId: commerceOrders.aiUsageRuleVersionId,
    }).from(membershipEntitlementSegments)
      .leftJoin(commerceOrders, eq(commerceOrders.id, membershipEntitlementSegments.orderId))
      .where(and(
        eq(membershipEntitlementSegments.accountId, accountId),
        eq(membershipEntitlementSegments.environment, environment),
        eq(membershipEntitlementSegments.status, 'active'),
      )).orderBy(asc(membershipEntitlementSegments.startsAt));
    const active = segments.find((segment) => segment.startsAt <= now && segment.endsAt > now);
    const membershipExpiresAt = segments.reduce<Date | null>((latest, segment) => (
      !latest || segment.endsAt > latest ? segment.endsAt : latest
    ), null);
    const rule = ruleValues(current);
    const ruleVersion = current.id;
    let resetAt: Date | null = null;
    let selected: Array<typeof aiPointBatches.$inferSelect>;

    if (active) {
      const [firstOrder] = await transaction.select({ effectiveAt: commerceOrders.membershipEffectiveAt })
        .from(commerceOrders).where(and(
          eq(commerceOrders.environment, environment), eq(commerceOrders.accountId, accountId),
        )).orderBy(asc(commerceOrders.membershipEffectiveAt)).limit(1);
      await transaction.insert(aiAllowanceAccounts).values({
        accountId, environment, anchorAt: firstOrder?.effectiveAt ?? active.startsAt, createdAt: now,
      }).onConflictDoNothing();
      const [owner] = await transaction.select().from(aiAllowanceAccounts).where(and(
        eq(aiAllowanceAccounts.accountId, accountId), eq(aiAllowanceAccounts.environment, environment),
      )).limit(1);
      if (!owner) throw new Error('ai_allowance_anchor_unavailable');
      const period = allowancePeriod(owner.anchorAt, now);
      resetAt = period.endsAt;
      const identity = and(
        eq(aiPointBatches.accountId, accountId), eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.sourceType, 'weekly_membership'),
        eq(aiPointBatches.sourceReference, `weekly:${accountId}`), eq(aiPointBatches.ordinal, period.ordinal),
      );
      const [existing] = await transaction.select().from(aiPointBatches).where(identity).limit(1);
      if (!existing) {
        const [batch] = await transaction.insert(aiPointBatches).values({
          accountId, originalAccountId: accountId, environment, sourceType: 'weekly_membership',
          sourceReference: `weekly:${accountId}`, ordinal: period.ordinal,
          ruleVersion, grantedPoints: rule.weeklyAllowance,
          availableAt: period.startsAt, expiresAt: period.endsAt, status: 'available', createdAt: now,
        }).returning();
        if (!batch) throw new Error('ai_weekly_allowance_create_failed');
        await transaction.insert(aiPointLedgerEntries).values({
          environment, accountId, batchId: batch.id, operationId: `grant:${batch.id}`,
          entryType: 'grant', direction: 'credit', points: batch.grantedPoints, createdAt: now,
        });
      }
      selected = await transaction.select().from(aiPointBatches).where(identity);
    } else {
      // Trial is a separate lifetime grant. Never replenish it or mix it into weekly percentages.
      selected = await transaction.select().from(aiPointBatches).where(and(
        eq(aiPointBatches.accountId, accountId), eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.sourceType, 'trial'), eq(aiPointBatches.status, 'available'),
        lte(aiPointBatches.availableAt, now), or(isNull(aiPointBatches.expiresAt), gt(aiPointBatches.expiresAt, now)),
      ));
    }
    const total = selected.length ? (active ? rule.weeklyAllowance : rule.trialAllowance) : 0;
    const primary = [...selected];
    // Refill grants retain immutable consumption history and reuse the original period's cap/expiry.
    const refillPrefixes = selected.map(batch => `ops-refill:${batch.id}:%`);
    if (refillPrefixes.length) {
      const refills = await transaction.select().from(aiPointBatches).where(and(
        eq(aiPointBatches.accountId, accountId), eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.sourceType, 'compensation'), eq(aiPointBatches.status, 'available'),
        lte(aiPointBatches.availableAt, now), or(isNull(aiPointBatches.expiresAt), gt(aiPointBatches.expiresAt, now)),
        or(...refillPrefixes.map(prefix => sql`${aiPointBatches.sourceReference} like ${prefix}`)),
      ));
      selected = [...selected, ...refills.filter(refill => {
        const owner = primary.find(batch => refill.sourceReference.startsWith(`ops-refill:${batch.id}:`));
        return owner && (!owner.allowanceResetAt || refill.createdAt > owner.allowanceResetAt);
      })];
    }
    // The live cap is independent of the immutable physical grant/consumption ledger.
    // Old refill grants offset usage; a reset starts a new consumption baseline.
    const used = selected.reduce((sum, batch) => sum + batch.consumedPoints + batch.reservedPoints
      - (batch.sourceReference.startsWith('ops-refill:') ? batch.grantedPoints : batch.allowanceConsumedBaseline), 0);
    const available = Math.max(0, Math.min(total, total - used));
    const physical = selected.reduce((sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints, 0);
    if (primary[0] && available > physical) {
      const extra = available - physical;
      await transaction.update(aiPointBatches).set({ grantedPoints: sql`${aiPointBatches.grantedPoints} + ${extra}`, updatedAt: now })
        .where(eq(aiPointBatches.id, primary[0].id));
      await transaction.insert(aiPointLedgerEntries).values({ environment, accountId, batchId: primary[0].id,
        operationId: `allowance-cap:${primary[0].id}:${crypto.randomUUID()}`, entryType: 'grant', direction: 'credit', points: extra, createdAt: now });
    }
    const legacy = await transaction.select().from(aiPointBatches).where(and(
      eq(aiPointBatches.accountId, accountId), eq(aiPointBatches.environment, environment),
      inArray(aiPointBatches.sourceType, ['membership', 'compensation']),
      eq(aiPointBatches.status, 'available'), lte(aiPointBatches.availableAt, now),
      or(isNull(aiPointBatches.expiresAt), gt(aiPointBatches.expiresAt, now)),
    ));
    const mode = active ? 'weekly' : selected.length ? 'trial' : membershipExpiresAt ? 'expired' : 'unavailable';
    let reason: AiAllowanceSummary['reason'];
    if (mode === 'unavailable' && environment === 'production') {
      const [owner] = await transaction.select({ reason: accounts.aiTrialEligibilityReason })
        .from(accounts).where(eq(accounts.id, accountId)).limit(1);
      if (owner?.reason === 'trial_already_claimed') reason = owner.reason;
    }
    const bonus = legacy.filter((batch) => batch.sourceReference.startsWith('ops-gift:'));
    const purchasedLegacy = legacy.filter((batch) => !batch.sourceReference.startsWith('ops-gift:') && !batch.sourceReference.startsWith('ops-refill:'));
    const bonusAvailable = bonus.reduce((sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints, 0);
    const bonusExpiry = bonus.filter((b) => b.grantedPoints > b.consumedPoints + b.reservedPoints && b.expiresAt)
      .map((b) => b.expiresAt!.toISOString()).sort()[0] ?? null;
    return {
      bonusBatchIds: bonus.map((batch) => batch.id), bonusAvailable,
      rule, ruleVersion, batchIds: selected.map((batch) => batch.id), available, total,
      legacyBatchIds: purchasedLegacy.map((batch) => batch.id),
      legacyAvailable: purchasedLegacy.reduce((sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints, 0),
      summary: {
        mode,
        ...(reason ? { reason } : {}),
        bonus: { available: bonusAvailable, expiresAt: bonusExpiry },
        remainingPercent: remainingPercent(available, total),
        resetAt: resetAt?.toISOString() ?? null,
        membershipExpiresAt: membershipExpiresAt?.toISOString() ?? null,
        ruleVersion,
      },
    };
  }

  /** Caller locks the account; no consumption or purchase records are deleted. */
  async resetBase(transaction: CommerceTransaction, accountId: string, environment: CommerceEnvironment, now: Date, operationId: string) {
    const pending = await transaction.execute(sql`select 1 from ai_point_reservations where account_id = ${accountId}::uuid
      and environment = ${environment} and status = 'reserved' limit 1`);
    if (pending.length) throw new ConflictException('allowance_request_in_progress');
    let context = await this.prepare(transaction, accountId, environment, now);
    if (!context.batchIds.length) {
      const [batch] = await transaction.insert(aiPointBatches).values({ accountId, originalAccountId: accountId, environment,
        sourceType: 'trial', sourceReference: `ops-reset-trial:${operationId}:${accountId}`, ordinal: 0,
        ruleVersion: context.ruleVersion, grantedPoints: context.rule.trialAllowance, availableAt: now, status: 'available', createdAt: now }).returning();
      if (batch!.grantedPoints > 0) await transaction.insert(aiPointLedgerEntries).values({ environment, accountId, batchId: batch!.id,
        operationId: `reset:${operationId}:${accountId}`, entryType: 'grant', direction: 'credit', points: batch!.grantedPoints, createdAt: now });
      context = await this.prepare(transaction, accountId, environment, now);
    }
    const bases = await transaction.select().from(aiPointBatches).where(inArray(aiPointBatches.id, context.batchIds));
    for (const batch of bases.filter(batch => !batch.sourceReference.startsWith('ops-refill:'))) {
      await transaction.update(aiPointBatches).set({ allowanceConsumedBaseline: batch.consumedPoints, allowanceResetAt: now, updatedAt: now })
        .where(eq(aiPointBatches.id, batch.id));
    }
    return this.prepare(transaction, accountId, environment, now);
  }

  async summary(transaction: CommerceTransaction, accountId: string, environment: CommerceEnvironment, now = new Date()) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))`);
    return this.prepare(transaction, accountId, environment, now);
  }
}
