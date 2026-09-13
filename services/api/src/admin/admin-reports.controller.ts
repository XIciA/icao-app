import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { CommerceService } from '../commerce/commerce.service';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import { AdminAuditService } from './admin-audit.service';
import type { OpsAuthenticatedRequest } from './admin.types';

const querySchema = z.object({
  from: z.iso.datetime(), to: z.iso.datetime(),
  account: z.string().max(100).default(''), feature: z.string().max(80).default(''),
  category: z.string().max(80).default(''), context: z.string().max(100).default(''),
  status: z.string().max(40).default(''),
}).refine((v) => Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000);

@Controller('v1/admin/reports')
@UseGuards(RequireAdminAuthGuard, AdminRoleGuard)
@OpsRoles('admin')
export class AdminReportsController {
  constructor(private readonly database: DatabaseService, private readonly commerce: CommerceService, private readonly audit: AdminAuditService) {}
  private async record(request: OpsAuthenticatedRequest, action: string) {
    await this.audit.record({ requestId: request.id, actorStaffId: request.opsStaff!.id, actorRole: request.opsStaff!.role,
      action, targetType: 'report', reason: '管理员查看使用统计与权益' });
  }
  @Get('usage')
  async usage(@Query() query: unknown, @Req() request: OpsAuthenticatedRequest) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('invalid_report_filter');
    const q = parsed.data;
    await this.record(request, 'ops.usage.read');
    const rows = await this.database.db.execute(sql`
      select id, user_id as account_id, request_id, capability, status, model, quota_units,
        input_tokens, output_tokens, audio_duration_seconds, cost_microunits, attempt_count, created_at
      from ai_usage_logs where created_at >= ${q.from}::timestamptz and created_at < ${q.to}::timestamptz
        and (${q.account} = '' or user_id::text = ${q.account})
        and (${q.feature} = '' or capability = ${q.feature}) and (${q.status} = '' or status = ${q.status})
      order by created_at desc limit 10001`);
    return { requestId: request.id, data: { rows: rows.slice(0, 10000).map(row => ({...row, estimated_cny: row.cost_microunits == null ? null : Number(row.cost_microunits) / 1_000_000, cost_basis: row.cost_microunits == null ? '计费数据缺失' : '2026-09-13刊例价；输入按缓存未命中；未扣优惠'})), truncated: rows.length > 10000,
      note: '费用为用量估算；历史缺失计费数据标记待确认。未扣除服务商免费额度、套餐及折扣，不能代替账单。' } };
  }
  @Get('clicks')
  async clicks(@Query() query: unknown, @Req() request: OpsAuthenticatedRequest) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('invalid_report_filter');
    const q = parsed.data;
    await this.record(request, 'ops.clicks.read');
    const rows = await this.database.db.execute(sql`
      select category, event, context, count(*)::int as clicks from product_click_events
      where created_at >= ${q.from}::timestamptz and created_at < ${q.to}::timestamptz
        and (${q.feature} = '' or event = ${q.feature}) and (${q.category} = '' or category = ${q.category})
        and (${q.context} = '' or context = ${q.context})
      group by category, event, context order by clicks desc`);
    return { requestId: request.id, data: { rows, note: '仅统计接入后的真实点击；自动行为和历史使用不推算为点击。' } };
  }
  @Get('accounts/:id')
  async account(@Param('id') id: string, @Query('environment') environment: string, @Req() request: OpsAuthenticatedRequest) {
    if (!z.uuid().safeParse(id).success || !['production', 'sandbox'].includes(environment)) throw new BadRequestException('invalid_account');
    await this.record(request, 'ops.allowance.read');
    const allowance = await this.commerce.allowanceForAdmin(id, environment as 'production' | 'sandbox');
    const history = await this.database.db.execute(sql`select applied_at, membership_days, ai_points, reason
      from ops_entitlement_adjustments where account_id = ${id}::uuid and environment = ${environment}
      order by applied_at desc limit 100`);
    return { requestId: request.id, data: { allowance: allowance.summary, available: allowance.available,
      total: allowance.total, history } };
  }
}
