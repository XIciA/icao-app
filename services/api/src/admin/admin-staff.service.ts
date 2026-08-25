import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  OpsStaffDisableResult,
  OpsStaffListItem,
  OpsStaffSessionRevokeResult,
} from '@icao/contracts';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';

import { opsStaffAccounts, opsStaffSessions } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedStaff } from './admin.types';

export function assertOpsStaffDisableAllowed(input: {
  activeAdminCount: number;
  actorStaffId: string;
  targetRole: string;
  targetStaffId: string;
}) {
  if (input.targetStaffId === input.actorStaffId) {
    throw new ConflictException('ops_staff_cannot_disable_self');
  }
  if (input.targetRole === 'admin' && input.activeAdminCount <= 1) {
    throw new ConflictException('ops_staff_last_admin_required');
  }
}

@Injectable()
export class AdminStaffService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(
    reason: string,
    actor: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsStaffListItem[]> {
    const now = new Date();
    const rows = await this.database.db.select({
      id: opsStaffAccounts.id,
      email: opsStaffAccounts.email,
      role: opsStaffAccounts.role,
      disabledAt: opsStaffAccounts.disabledAt,
      createdAt: opsStaffAccounts.createdAt,
      updatedAt: opsStaffAccounts.updatedAt,
      activeSessionCount: count(opsStaffSessions.id),
    }).from(opsStaffAccounts)
      .leftJoin(opsStaffSessions, and(
        eq(opsStaffSessions.staffId, opsStaffAccounts.id),
        isNull(opsStaffSessions.revokedAt),
        gt(opsStaffSessions.expiresAt, now),
      ))
      .groupBy(
        opsStaffAccounts.id,
        opsStaffAccounts.email,
        opsStaffAccounts.role,
        opsStaffAccounts.disabledAt,
        opsStaffAccounts.createdAt,
        opsStaffAccounts.updatedAt,
      )
      .orderBy(opsStaffAccounts.createdAt);
    await this.audit.record({
      requestId,
      actorStaffId: actor.id,
      actorRole: actor.role,
      action: 'ops.staff.list',
      targetType: 'ops_staff_collection',
      reason,
      metadata: { resultCount: rows.length },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as 'admin' | 'support',
      status: row.disabledAt ? 'disabled' : 'active',
      activeSessionCount: Number(row.activeSessionCount),
      disabledAt: row.disabledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async disable(
    targetStaffId: string,
    reason: string,
    actor: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsStaffDisableResult> {
    if (targetStaffId === actor.id) throw new ConflictException('ops_staff_cannot_disable_self');
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('ops-staff-management', 0))
      `);
      const [target] = await transaction.select().from(opsStaffAccounts)
        .where(eq(opsStaffAccounts.id, targetStaffId)).limit(1);
      if (!target) throw new NotFoundException('ops_staff_not_found');
      if (target.disabledAt) {
        return { disabled: true, disabledAt: target.disabledAt.toISOString() };
      }
      if (target.role === 'admin') {
        const [activeAdmins] = await transaction.select({ value: count() })
          .from(opsStaffAccounts)
          .where(and(
            eq(opsStaffAccounts.role, 'admin'),
            isNull(opsStaffAccounts.disabledAt),
          ));
        assertOpsStaffDisableAllowed({
          activeAdminCount: Number(activeAdmins?.value ?? 0),
          actorStaffId: actor.id,
          targetRole: target.role,
          targetStaffId,
        });
      }
      await transaction.update(opsStaffAccounts).set({ disabledAt: now, updatedAt: now })
        .where(and(
          eq(opsStaffAccounts.id, targetStaffId),
          isNull(opsStaffAccounts.disabledAt),
        ));
      await transaction.update(opsStaffSessions).set({ revokedAt: now })
        .where(and(
          eq(opsStaffSessions.staffId, targetStaffId),
          isNull(opsStaffSessions.revokedAt),
        ));
      await this.audit.record({
        requestId,
        actorStaffId: actor.id,
        actorRole: actor.role,
        action: 'ops.staff.disable',
        targetType: 'ops_staff',
        targetId: targetStaffId,
        reason,
        beforeState: { role: target.role, disabledAt: null },
        afterState: { role: target.role, disabledAt: now.toISOString() },
      }, transaction);
      return { disabled: true, disabledAt: now.toISOString() };
    });
  }

  async revokeAllSessions(
    targetStaffId: string,
    reason: string,
    actor: OpsAuthenticatedStaff,
    requestId: string,
  ): Promise<OpsStaffSessionRevokeResult> {
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      const [target] = await transaction.select({ id: opsStaffAccounts.id })
        .from(opsStaffAccounts).where(eq(opsStaffAccounts.id, targetStaffId)).limit(1);
      if (!target) throw new NotFoundException('ops_staff_not_found');
      const revoked = await transaction.update(opsStaffSessions).set({ revokedAt: now })
        .where(and(
          eq(opsStaffSessions.staffId, targetStaffId),
          isNull(opsStaffSessions.revokedAt),
        )).returning({ id: opsStaffSessions.id });
      await this.audit.record({
        requestId,
        actorStaffId: actor.id,
        actorRole: actor.role,
        action: 'ops.staff.sessions_revoke_all',
        targetType: 'ops_staff',
        targetId: targetStaffId,
        reason,
        metadata: { revokedSessionCount: revoked.length },
      }, transaction);
      return { revoked: true, revokedSessionCount: revoked.length };
    });
  }
}
