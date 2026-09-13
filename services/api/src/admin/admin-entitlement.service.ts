import type { LocalOpsGrantRequest as OpsEntitlementGrantRequest, LocalOpsGrantPreview as OpsEntitlementGrantPreview } from '@icao/contracts/commerce-rules';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type {
  CommerceEntitlementSummary,
  OpsEntitlementGrantResult,
} from '@icao/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { CommerceService } from '../commerce/commerce.service';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { opsAuditEvents, opsChangePreviews } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { hashOpsSecret } from './admin-crypto';
import { opsEntitlementStateSchema, opsGrantPreviewSchema } from './admin.schemas';
import type { OpsAuthenticatedStaff } from './admin.types';

const PREVIEW_TTL_MS = 10 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class AdminEntitlementService {
  constructor(
    @Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig,
    private readonly database: DatabaseService,
    private readonly commerce: CommerceService,
  ) {}

  private confirmationHash(token: string) {
    return hashOpsSecret(token, this.config.opsSessionHashSecret, 'ops-change-confirmation-v1');
  }

  async preview(
    input: OpsEntitlementGrantRequest,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsEntitlementGrantPreview> {
    const now = new Date();
    if (input.aiMode === 'refill') {
      const context = await this.commerce.allowanceForAdmin(input.accountId, input.environment);
      input = { ...input, aiPoints: context.total - context.available };
      if (input.aiPoints <= 0) throw new ConflictException('allowance_already_full');
    }
    const entitlements = await this.commerce.currentEntitlement(input.accountId);
    const before = entitlements[input.environment];
    const baseMembershipEnd = before.membership.expiresAt
      ? new Date(before.membership.expiresAt)
      : now;
    const predictedStart = baseMembershipEnd > now ? baseMembershipEnd : now;
    const after: CommerceEntitlementSummary = {
      ...before,
      serverTime: now.toISOString(),
      membership: input.membershipDays > 0 ? {
        active: true,
        expiresAt: new Date(
          predictedStart.getTime() + input.membershipDays * DAY_MS,
        ).toISOString(),
      } : before.membership,
      aiPoints: {
        ...before.aiPoints,
        available: before.aiPoints.available + input.aiPoints,
      },
    };
    const confirmationToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MS);
    const preview = await this.database.db.transaction(async (transaction) => {
      const [created] = await transaction.insert(opsChangePreviews).values({
        staffId: staff.id,
        sessionId: staff.sessionId,
        changeType: 'grant_review_entitlement',
        targetAccountId: input.accountId,
        requestPayload: input,
        beforeState: before,
        afterState: after,
        confirmationHash: this.confirmationHash(confirmationToken),
        expiresAt,
        createdAt: now,
      }).returning({ id: opsChangePreviews.id });
      if (!created) throw new Error('ops_change_preview_insert_failed');
      await transaction.insert(opsAuditEvents).values({
        requestId,
        actorStaffId: staff.id,
        actorRole: staff.role,
        action: 'ops.entitlement.preview',
        targetType: 'account',
        targetId: input.accountId,
        reason: input.reason,
        beforeState: before,
        afterState: after,
        metadata: { previewId: created.id },
      });
      return created;
    });
    return {
      previewId: preview.id,
      confirmationToken,
      expiresAt: expiresAt.toISOString(),
      before,
      after,
      change: {
        accountId: input.accountId,
        environment: input.environment,
        membershipDays: input.membershipDays,
        aiPoints: input.aiPoints,
        aiMode: input.aiMode,
      },
    };
  }

  async execute(
    previewId: string,
    confirmationToken: string,
    staff: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsEntitlementGrantResult> {
    const appliedAt = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`ops-preview:${previewId}`}, 0))
      `);
      const [preview] = await transaction.select().from(opsChangePreviews).where(and(
        eq(opsChangePreviews.id, previewId),
        eq(opsChangePreviews.staffId, staff.id),
        eq(opsChangePreviews.sessionId, staff.sessionId),
        isNull(opsChangePreviews.executedAt),
      )).limit(1);
      if (
        !preview
        || preview.expiresAt <= appliedAt
        || preview.confirmationHash !== this.confirmationHash(confirmationToken)
      ) throw new ConflictException('ops_preview_invalid_or_expired');
      const payload = opsGrantPreviewSchema.safeParse(preview.requestPayload);
      const expectedBefore = opsEntitlementStateSchema.safeParse(preview.beforeState);
      if (!payload.success || !expectedBefore.success) {
        throw new ConflictException('ops_preview_payload_invalid');
      }
      const result = await this.commerce.applyAuditedEntitlementAdjustmentInTransaction(
        transaction,
        {
          ...payload.data,
          previewId,
          staffId: staff.id,
          appliedAt,
          expectedBefore: expectedBefore.data,
        },
      );
      const [executed] = await transaction.update(opsChangePreviews).set({
        executedAt: appliedAt,
      }).where(and(
        eq(opsChangePreviews.id, previewId),
        isNull(opsChangePreviews.executedAt),
      )).returning({ id: opsChangePreviews.id });
      if (!executed) throw new ConflictException('ops_preview_already_executed');
      await transaction.insert(opsAuditEvents).values({
        requestId,
        actorStaffId: staff.id,
        actorRole: staff.role,
        action: 'ops.entitlement.execute',
        targetType: 'account',
        targetId: payload.data.accountId,
        reason: payload.data.reason,
        beforeState: result.before,
        afterState: result.entitlement,
        metadata: { previewId, adjustmentId: result.adjustmentId, environment: payload.data.environment },
      });
      return {
        adjustmentId: result.adjustmentId,
        appliedAt: appliedAt.toISOString(),
        entitlement: result.entitlement,
      };
    });
  }
}
