import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { CommerceService } from '../commerce/commerce.service';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import { AdminAuditService } from './admin-audit.service';
import { AdminGlobalResetService, resetRequestSchema } from './admin-global-reset.service';
import type { OpsAuthenticatedRequest } from './admin.types';
const filterSchema = z.object({ environment:z.enum(['production','sandbox']).default('production'),query:z.string().trim().max(100).default(''),
  membership:z.enum(['all','active','expired','none']).default('all'),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),sort:z.enum(['newest','oldest']).default('newest') });
const envSchema = z.enum(['production','sandbox']);

@Controller('v1/admin/users')
@UseGuards(RequireAdminAuthGuard, AdminRoleGuard)
@OpsRoles('admin')
export class AdminUsersController {
  constructor(private readonly database:DatabaseService,private readonly commerce:CommerceService,private readonly audit:AdminAuditService,private readonly resets:AdminGlobalResetService) {}
  private record(req:OpsAuthenticatedRequest, action:string,targetId?:string){return this.audit.record({requestId:req.id,actorStaffId:req.opsStaff!.id,actorRole:req.opsStaff!.role,action,targetType:'account',targetId,reason:'管理员查看用户信息与操作记录'});}
  @Get()
  async list(@Query() query:unknown,@Req() req:OpsAuthenticatedRequest){
    const parsed=filterSchema.safeParse(query);if(!parsed.success)throw new BadRequestException('invalid_user_filter');const q=parsed.data;
    const rows=await this.database.db.execute(sql`
      with users as (
        select a.id as account_id,a.status,a.created_at,
          (select d.payload->>'displayName' from user_documents d where d.user_id=a.id and d.document_key='account_profile') as display_name,
          (select nullif(u.phone,'') from account_identities i join auth.users u on u.id=i.auth_user_id where i.account_id=a.id and i.provider='phone' order by i.last_used_at desc limit 1) as phone,
          (select max(s.ends_at) from membership_entitlement_segments s where s.account_id=a.id and s.environment=${q.environment} and s.status='active') as membership_expires_at,
          exists(select 1 from membership_entitlement_segments s where s.account_id=a.id and s.environment=${q.environment} and s.status='active' and s.starts_at<=now() and s.ends_at>now()) as member_active,
          (select o.external_order_id from commerce_orders o where o.account_id=a.id and o.environment=${q.environment} order by o.purchased_at desc limit 1) as latest_order
        from accounts a
      ), filtered as (select * from users u where
        (${q.query}='' or u.account_id::text=${q.query} or u.phone like ${'%'+q.query+'%'} or strpos(lower(coalesce(u.display_name,'')),lower(${q.query}))>0 or exists(select 1 from commerce_orders o where o.account_id=u.account_id and o.environment=${q.environment} and (o.id::text=${q.query} or o.external_order_id=${q.query})))
        and (${q.membership}='all' or (${q.membership}='active' and member_active) or (${q.membership}='expired' and not member_active and membership_expires_at is not null) or (${q.membership}='none' and membership_expires_at is null)))
      select coalesce(jsonb_agg(page),'[]'::jsonb) as rows,(select count(*)::int from filtered) as total from (
        select * from filtered order by ${q.sort==='oldest'?sql`created_at asc,account_id asc`:sql`created_at desc,account_id desc`} limit ${q.limit} offset ${(q.page-1)*q.limit}
      ) page`);
    const result=rows[0] as {rows:Array<Record<string,unknown>>;total:number};
    const hydrated=[];
    for(const row of result.rows){
      const allowance=row.status==='active'?await this.commerce.allowanceForAdmin(String(row.account_id),q.environment):null;
      hydrated.push({...row,available:allowance?.available??null,total:allowance?.total??null,remaining_percent:allowance?.summary.remainingPercent??null,bonus_available:allowance?.bonusAvailable??0});
    }
    await this.record(req,'ops.users.list');return {requestId:req.id,data:{rows:hydrated,total:result.total,page:q.page,limit:q.limit,updatedAt:new Date().toISOString()}};
  }
  @Get('operations')
  async operations(@Query('account') account:string|undefined,@Query('page') pageRaw:string|undefined,@Query('environment') env:string|undefined,@Req() req:OpsAuthenticatedRequest){
    if(account&&!z.uuid().safeParse(account).success)throw new BadRequestException('invalid_account');
    const page=z.coerce.number().int().min(1).safeParse(pageRaw??1);if(!page.success)throw new BadRequestException('invalid_page');
    if(env&&!envSchema.safeParse(env).success)throw new BadRequestException('invalid_environment');
    const rows=await this.database.db.execute(sql`select sequence,action,target_id,reason,before_state,after_state,metadata,created_at,actor_staff_id from ops_audit_events
      where action in ('ops.ai_rules.publish','ops.entitlement.execute','ops.allowance.reset','ops.allowances.reset.execute')
        and (${account??''}='' or target_id=${account??''})
        and (${env??''}='' or action='ops.ai_rules.publish' or metadata->>'environment'=${env??''} or before_state->>'environment'=${env??''})
      order by sequence desc limit 51 offset ${(page.data-1)*50}`);
    await this.record(req,'ops.operations.read',account);return {requestId:req.id,data:{rows:rows.slice(0,50),hasMore:rows.length>50}};
  }
  @Get(':id/detail')
  async detail(@Param('id') id:string,@Query('environment') env:string,@Req() req:OpsAuthenticatedRequest){
    if(!z.uuid().safeParse(id).success||!envSchema.safeParse(env).success)throw new BadRequestException('invalid_account');
    const orders=await this.database.db.execute(sql`select id,external_order_id,channel,product_key,status,purchased_at,membership_effective_at from commerce_orders where account_id=${id}::uuid and environment=${env} order by purchased_at desc limit 100`);
    const usage=await this.database.db.execute(sql`select capability,count(*)::int as calls,coalesce(sum(quota_units),0)::int as units,sum(cost_microunits) as cost_microunits,count(*) filter(where cost_microunits is null)::int as unpriced from ai_usage_logs where user_id=${id}::uuid group by capability`);
    const feedback=await this.database.db.execute(sql`select ticket_number,category,description,created_at from feedback_tickets where user_id=${id}::uuid and retention_at>now() order by created_at desc limit 30`);
    await this.record(req,'ops.user.detail',id);return {requestId:req.id,data:{orders,usage,feedback}};
  }
  @Post('reset-allowances/preview')
  async preview(@Body() body:unknown,@Req() req:OpsAuthenticatedRequest){const p=resetRequestSchema.safeParse(body);if(!p.success)throw new BadRequestException('invalid_reset_request');return {requestId:req.id,data:await this.resets.preview(p.data,req.opsStaff!,req.id)};}
  @Post('reset-allowances/:id/execute')
  async execute(@Param('id') id:string,@Body() body:unknown,@Req() req:OpsAuthenticatedRequest){const p=z.object({confirmation:z.literal('确认重置所有用户额度'),confirmationToken:z.string().min(20)}).safeParse(body);if(!p.success||!z.uuid().safeParse(id).success)throw new BadRequestException('invalid_reset_confirmation');return {requestId:req.id,data:await this.resets.execute(id,p.data.confirmationToken,req.opsStaff!,req.id)};}
}
