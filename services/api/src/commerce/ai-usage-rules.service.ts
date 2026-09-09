import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { asc, desc, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AiRulePublishRequest, AiRulePreview, AiUsageRuleValues, AiUsageRuleVersion } from '@icao/contracts/commerce-rules';

import type { DatabaseService } from '../database/database.service';
import { aiUsageRuleVersions } from '../database/schema';
import { ACTIVE_MEMBERSHIP_PRODUCTS, AI_POINT_RULE_VERSION } from './product-catalog';
import { INITIAL_AI_RULE_ID, ruleChangeImpact } from './ai-allowance-domain';

export type CommerceTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];
const costSchema = z.number().int().min(1).max(100_000);
export const aiRuleValuesSchema = z.object({
  weeklyAllowance: z.number().int().min(1).max(1_000_000),
  trialAllowance: z.number().int().min(0).max(1_000_000),
  costs: z.object({
    transcription: costSchema, grammar_correction: costSchema, opi_refinement: costSchema,
    transcription_grammar: costSchema, transcription_opi: costSchema,
  }).strict(),
}).strict();
export const aiRulePublishSchema = aiRuleValuesSchema.extend({
  expectedVersionId: z.uuid(), effectiveAt: z.iso.datetime(), idempotencyKey: z.uuid(),
});

export function ruleValues(row: typeof aiUsageRuleVersions.$inferSelect): AiUsageRuleValues {
  // A malformed published configuration is an outage, never a fabricated allowance.
  return aiRuleValuesSchema.parse({
    weeklyAllowance: row.weeklyAllowance, trialAllowance: row.trialAllowance, costs: row.costs,
  });
}

export function ruleVersion(row: typeof aiUsageRuleVersions.$inferSelect): AiUsageRuleVersion {
  return {
    ...ruleValues(row), id: row.id, effectiveAt: row.effectiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(), actorId: row.actorId, previousVersionId: row.previousVersionId,
  };
}

@Injectable()
export class AiUsageRulesService {
  async effective(transaction: CommerceTransaction, at: Date) {
    const [row] = await transaction.select().from(aiUsageRuleVersions)
      .where(lte(aiUsageRuleVersions.effectiveAt, at))
      .orderBy(desc(aiUsageRuleVersions.effectiveAt), desc(aiUsageRuleVersions.createdAt)).limit(1);
    if (!row) throw new Error('ai_usage_rules_unavailable');
    ruleValues(row);
    return row;
  }

  async byId(transaction: CommerceTransaction, id: string | null) {
    const [row] = await transaction.select().from(aiUsageRuleVersions)
      .where(eq(aiUsageRuleVersions.id, id ?? INITIAL_AI_RULE_ID)).limit(1);
    if (!row) throw new Error('ai_usage_rules_unavailable');
    ruleValues(row);
    return row;
  }

  async purchaseTerms(transaction: CommerceTransaction, productKey: string, purchasedAt: Date) {
    const initial = await this.byId(transaction, INITIAL_AI_RULE_ID);
    const usesWeekly = ACTIVE_MEMBERSHIP_PRODUCTS.some((product) => product.productKey === productKey)
      && purchasedAt >= initial.createdAt;
    return {
      aiPointRuleVersion: usesWeekly ? 'ai-weekly-v1' : AI_POINT_RULE_VERSION,
      aiUsageRuleVersionId: usesWeekly ? (await this.effective(transaction, purchasedAt)).id : null,
    };
  }

  async versions(transaction: CommerceTransaction, at: Date) {
    return transaction.select().from(aiUsageRuleVersions)
      .where(lte(aiUsageRuleVersions.effectiveAt, at))
      .orderBy(asc(aiUsageRuleVersions.effectiveAt), asc(aiUsageRuleVersions.createdAt));
  }

  async catalog(transaction: CommerceTransaction, at = new Date()) {
    const rows = await transaction.select().from(aiUsageRuleVersions)
      .orderBy(desc(aiUsageRuleVersions.createdAt)).limit(100);
    return {
      current: ruleVersion(await this.effective(transaction, at)),
      latestVersionId: rows[0]?.id ?? INITIAL_AI_RULE_ID,
      versions: rows.map(ruleVersion),
    };
  }

  async preview(transaction: CommerceTransaction, input: AiRulePublishRequest, now = new Date()): Promise<AiRulePreview> {
    const parsed = aiRulePublishSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('invalid_ai_usage_rule');
    const [head] = await transaction.select().from(aiUsageRuleVersions)
      .orderBy(desc(aiUsageRuleVersions.createdAt)).limit(1);
    if (!head || head.id !== input.expectedVersionId) throw new ConflictException('ai_usage_rule_preview_stale');
    const effectiveAt = new Date(input.effectiveAt);
    // Allow an immediate preview to be confirmed without changing its timestamp.
    if (effectiveAt.getTime() < now.getTime() - 10 * 60 * 1_000) {
      throw new BadRequestException('ai_usage_rule_effective_time_invalid');
    }
    const current = await this.effective(transaction, effectiveAt);
    const proposed = aiRuleValuesSchema.parse({
      weeklyAllowance: input.weeklyAllowance, trialAllowance: input.trialAllowance, costs: input.costs,
    });
    const changes = ruleChangeImpact(ruleValues(current), proposed);
    if (changes.length === 0) throw new BadRequestException('ai_usage_rule_unchanged');
    return { current: ruleVersion(current), proposed, effectiveAt: effectiveAt.toISOString(), changes };
  }

  async publish(transaction: CommerceTransaction, input: AiRulePublishRequest, actorId: string, now = new Date()) {
    const parsed = aiRulePublishSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('invalid_ai_usage_rule');
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('ai-usage-rules-publish', 0))`);
    const digest = createHash('sha256').update(JSON.stringify({ ...parsed.data, actorId })).digest('hex');
    const [existing] = await transaction.select().from(aiUsageRuleVersions)
      .where(eq(aiUsageRuleVersions.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.requestDigest !== digest) throw new ConflictException('ai_usage_rule_idempotency_conflict');
      return ruleVersion(existing);
    }
    const preview = await this.preview(transaction, input, now);
    const [created] = await transaction.insert(aiUsageRuleVersions).values({
      ...preview.proposed,
      effectiveAt: new Date(Math.max(now.getTime(), new Date(input.effectiveAt).getTime())),
      createdAt: now, actorId, previousVersionId: input.expectedVersionId,
      idempotencyKey: input.idempotencyKey, requestDigest: digest,
    }).returning();
    if (!created) throw new Error('ai_usage_rule_publish_failed');
    return ruleVersion(created);
  }
}
