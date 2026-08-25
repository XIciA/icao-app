import { Injectable } from '@nestjs/common';

import type { OpsStaffRole } from '@icao/contracts';
import { opsAuditEvents } from '../database/schema';
import { DatabaseService } from '../database/database.service';

type AuditExecutor = Pick<DatabaseService['db'], 'insert'>;

@Injectable()
export class AdminAuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    action: string;
    actorRole?: OpsStaffRole;
    actorStaffId?: string;
    afterState?: unknown;
    beforeState?: unknown;
    metadata?: Record<string, unknown>;
    reason: string;
    requestId: string;
    targetId?: string;
    targetType: string;
  }, executor: AuditExecutor = this.database.db) {
    await executor.insert(opsAuditEvents).values({
      requestId: input.requestId,
      actorStaffId: input.actorStaffId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      reason: input.reason,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      metadata: input.metadata ?? {},
    });
  }
}
