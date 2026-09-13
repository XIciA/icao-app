import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { AiAllowanceSummary, AiUsageRuleValues } from '@icao/contracts/commerce-rules';

import {
  accounts, aiAllowanceAccounts, aiPointBatches, aiPointLedgerEntries, commerceOrders, membershipEntitlementSegments,
} from '../database/schema';
import { allowancePeriod, protectedMemberRule, remainingPercent } from './ai-allowance-domain';
import { AiUsageRulesService, type CommerceTransaction, ruleValues } from './ai-usage-rules.service';
import type { CommerceEnvironment } from './product-catalog';

export type AllowanceContext = {
  rule: AiUsageRuleValues;
  ruleVersion: string;
  batchIds: string[];
  available: number;
  total: number;
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
    let rule = ruleValues(current);
    let ruleVersion = current.id;
    let resetAt: Date | null = null;
    let selected: Array<typeof aiPointBatches.$inferSelect>;

    if (active) {
      const purchased = await this.rules.byId(transaction, active.ruleId);
      const versions = await this.rules.versions(transaction, now);
      rule = protectedMemberRule(ruleValues(purchased), versions.filter((version) => (
        version.effectiveAt >= (active.purchasedAt ?? active.startsAt)
      )).map(ruleValues));
      ruleVersion = purchased.id;

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
      } else if (rule.weeklyAllowance > existing.grantedPoints) {
        // Increasing a limit retains consumed/reserved units, including same-week repurchases.
        const extra = rule.weeklyAllowance - existing.grantedPoints;
        await transaction.update(aiPointBatches).set({ grantedPoints: rule.weeklyAllowance, updatedAt: now })
          .where(eq(aiPointBatches.id, existing.id));
        await transaction.insert(aiPointLedgerEntries).values({
          environment, accountId, batchId: existing.id,
          operationId: `allowance-increase:${existing.id}:${rule.weeklyAllowance}`,
          entryType: 'grant', direction: 'credit', points: extra, createdAt: now,
        }).onConflictDoNothing();
      }
      selected = await transaction.select().from(aiPointBatches).where(identity);
    } else {
      // Trial is a separate lifetime grant. Never replenish it or mix it into weekly percentages.
      selected = await transaction.select().from(aiPointBatches).where(and(
        eq(aiPointBatches.accountId, accountId), eq(aiPointBatches.environment, environment),
        eq(aiPointBatches.sourceType, 'trial'), eq(aiPointBatches.status, 'available'),
        lte(aiPointBatches.availableAt, now), or(isNull(aiPointBatches.expiresAt), gt(aiPointBatches.expiresAt, now)),
      ));
      if (selected[0]) {
        const trialRule = await this.rules.byId(transaction,
          /^[0-9a-f-]{36}$/iu.test(selected[0].ruleVersion) ? selected[0].ruleVersion : null);
        rule = protectedMemberRule(ruleValues(trialRule), [ruleValues(current)]);
        ruleVersion = trialRule.id;
      }
    }
    const total = selected.reduce((sum, batch) => sum + batch.grantedPoints, 0);
    const available = selected.reduce((sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints, 0);
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
    return {
      rule, ruleVersion, batchIds: selected.map((batch) => batch.id), available, total,
      legacyBatchIds: legacy.map((batch) => batch.id),
      legacyAvailable: legacy.reduce((sum, batch) => sum + batch.grantedPoints - batch.consumedPoints - batch.reservedPoints, 0),
      summary: {
        mode,
        ...(reason ? { reason } : {}),
        remainingPercent: remainingPercent(available, total),
        resetAt: resetAt?.toISOString() ?? null,
        membershipExpiresAt: membershipExpiresAt?.toISOString() ?? null,
        ruleVersion,
      },
    };
  }

  async summary(transaction: CommerceTransaction, accountId: string, environment: CommerceEnvironment, now = new Date()) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))`);
    return this.prepare(transaction, accountId, environment, now);
  }
}
