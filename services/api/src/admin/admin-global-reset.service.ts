import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { accounts, opsChangePreviews, opsAuditEvents } from '../database/schema';
import { AiAllowanceService } from '../commerce/ai-allowance.service';
import { AiUsageRulesService } from '../commerce/ai-usage-rules.service';
import { PersistentCommerceBenefitsService } from '../commerce/persistent-commerce-benefits.service';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { hashOpsSecret } from './admin-crypto';
import type { OpsAuthenticatedStaff } from './admin.types';

export const resetRequestSchema = z.object({ environment: z.enum(['production','sandbox']), reason: z.string().trim().min(3).max(500) });
const payloadSchema = resetRequestSchema.extend({ accountIds: z.array(z.uuid()), ruleId: z.uuid() });
@Injectable()
export class AdminGlobalResetService {
  constructor(@Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig, private readonly database: DatabaseService,
    private readonly allowance: AiAllowanceService, private readonly rules: AiUsageRulesService,
    private readonly benefits: PersistentCommerceBenefitsService) {}
  private hash(token: string) { return hashOpsSecret(token, this.config.opsSessionHashSecret, 'ops-global-reset-v1'); }
  async preview(input: z.infer<typeof resetRequestSchema>, staff: OpsAuthenticatedStaff, requestId: string) {
    const now = new Date(), token = randomBytes(32).toString('base64url');
    return this.database.db.transaction(async tx => {
      const rows = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.status,'active')).orderBy(accounts.id);
      const rule = await this.rules.effective(tx, now);
      const data = { count: rows.length, environment: input.environment, weeklyAllowance: rule.weeklyAllowance, trialAllowance: rule.trialAllowance };
      const [preview] = await tx.insert(opsChangePreviews).values({ staffId: staff.id, sessionId: staff.sessionId,
        changeType: 'reset_all_allowances', targetAccountId: null,
        requestPayload: {...input, accountIds: rows.map(r=>r.id), ruleId: rule.id}, beforeState: data, afterState: {...data, remainingPercent:100},
        confirmationHash: this.hash(token), expiresAt: new Date(now.getTime()+600000), createdAt: now }).returning();
      await tx.insert(opsAuditEvents).values({ requestId, actorStaffId:staff.id,actorRole:staff.role,action:'ops.allowances.reset.preview',
        targetType:'all_accounts',reason:input.reason,afterState:data,metadata:{previewId:preview!.id} });
      return {...data, previewId:preview!.id, confirmationToken:token, expiresAt:preview!.expiresAt.toISOString()};
    });
  }
  async execute(id: string, token: string, staff: OpsAuthenticatedStaff, requestId: string) {
    return this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('ai-usage-rules-publish',0))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ops-preview:${id}`},0))`);
      const [preview] = await tx.select().from(opsChangePreviews).where(and(eq(opsChangePreviews.id,id),eq(opsChangePreviews.staffId,staff.id),eq(opsChangePreviews.sessionId,staff.sessionId))).limit(1);
      const now = new Date();
      if (!preview || preview.changeType!=='reset_all_allowances' || preview.confirmationHash!==this.hash(token)) throw new ConflictException('ops_preview_invalid_or_expired');
      // Retrying a completed confirmation returns its receipt, never resets twice.
      if (preview.executedAt) return preview.afterState;
      if (preview.expiresAt <= now) throw new ConflictException('ops_preview_invalid_or_expired');
      const input = payloadSchema.parse(preview.requestPayload);
      if ((await this.rules.effective(tx, now)).id !== input.ruleId) throw new ConflictException('ai_usage_rule_preview_stale');
      const changes = [];
      for (const accountId of input.accountIds) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`},0))`);
        const [account] = await tx.select().from(accounts).where(eq(accounts.id,accountId)).limit(1);
        if (!account || account.status!=='active') throw new ConflictException('ops_reset_accounts_changed');
        await this.benefits.releaseExpiredAiPointReservations(tx,accountId,input.environment,now);
        const before = await this.allowance.prepare(tx,accountId,input.environment,now);
        const after = await this.allowance.resetBase(tx,accountId,input.environment,now,id);
        changes.push({accountId,before:before.available,after:after.available,total:after.total});
        await tx.insert(opsAuditEvents).values({requestId,actorStaffId:staff.id,actorRole:staff.role,action:'ops.allowance.reset',targetType:'account',targetId:accountId,
          reason:input.reason,beforeState:{available:before.available,total:before.total},afterState:{available:after.available,total:after.total},metadata:{previewId:id,environment:input.environment}});
      }
      const result = {count:changes.length,environment:input.environment,appliedAt:now.toISOString(),remainingPercent:100};
      await tx.update(opsChangePreviews).set({executedAt:now,afterState:result}).where(eq(opsChangePreviews.id,id));
      await tx.insert(opsAuditEvents).values({requestId,actorStaffId:staff.id,actorRole:staff.role,action:'ops.allowances.reset.execute',targetType:'all_accounts',
        reason:input.reason,beforeState:preview.beforeState,afterState:result,metadata:{previewId:id}});
      return result;
    });
  }
}
