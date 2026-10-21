import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminStabilityService } from './admin-stability.service';
import type { OpsAuthenticatedRequest } from './admin.types';

@Controller('v1/admin/stability')
@UseGuards(RequireAdminAuthGuard, AdminRoleGuard)
@OpsRoles('admin')
export class AdminStabilityController {
  constructor(private readonly stability: AdminStabilityService, private readonly audit: AdminAuditService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async snapshot(@Req() request: OpsAuthenticatedRequest) {
    await this.audit.record({ requestId: request.id, actorStaffId: request.opsStaff!.id, actorRole: request.opsStaff!.role,
      action: 'ops.stability.read', targetType: 'report', reason: '管理员查看稳定性聚合指标' });
    return { requestId: request.id, data: await this.stability.snapshot() };
  }
}
