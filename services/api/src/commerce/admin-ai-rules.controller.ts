import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { AiRulePublishRequest } from '@icao/contracts/commerce-rules';

import { AdminAuditService } from '../admin/admin-audit.service';
import { RequireAdminAuthGuard } from '../admin/admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from '../admin/admin-role.guard';
import type { OpsAuthenticatedRequest } from '../admin/admin.types';
import { DatabaseService } from '../database/database.service';
import { AiUsageRulesService, aiRulePublishSchema } from './ai-usage-rules.service';

@Controller('v1/admin/ai-rules')
@UseGuards(RequireAdminAuthGuard, AdminRoleGuard)
@OpsRoles('admin')
export class AdminAiRulesController {
  constructor(
    private readonly database: DatabaseService,
    private readonly rules: AiUsageRulesService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  async catalog(@Req() request: OpsAuthenticatedRequest) {
    const data = await this.database.db.transaction((transaction) => this.rules.catalog(transaction));
    return { requestId: request.id, data };
  }

  @Post('preview')
  async preview(@Body() body: AiRulePublishRequest, @Req() request: OpsAuthenticatedRequest) {
    const parsed = aiRulePublishSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ai_usage_rule');
    const data = await this.database.db.transaction((transaction) => this.rules.preview(transaction, parsed.data));
    return { requestId: request.id, data };
  }

  @Post('publish')
  async publish(@Body() body: AiRulePublishRequest, @Req() request: OpsAuthenticatedRequest) {
    const parsed = aiRulePublishSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ai_usage_rule');
    const data = await this.database.db.transaction(async (transaction) => {
      const before = await this.rules.effective(transaction, new Date());
      const published = await this.rules.publish(transaction, parsed.data, request.opsStaff!.id);
      await this.audit.record({
        action: 'ops.ai_rules.publish', actorStaffId: request.opsStaff!.id, actorRole: request.opsStaff!.role,
        reason: '发布AI用量规则', requestId: request.id, targetType: 'ai_usage_rule', targetId: published.id,
        beforeState: before, afterState: published, metadata: { previousVersionId: published.previousVersionId },
      }, transaction);
      return published;
    });
    return { requestId: request.id, data };
  }
}
