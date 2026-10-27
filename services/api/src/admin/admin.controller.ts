import { feedbackReplySchema } from '../feedback/feedback.schemas';
import type { OpsFeedbackListResponse, OpsFeedbackDetail } from '@icao/contracts/feedback-ops';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  ApiSuccessEnvelope,
  OpsAccountCommerceSummary,
  OpsEntitlementGrantExecuteRequest,
  OpsEntitlementGrantPreview,
  OpsEntitlementGrantRequest,
  OpsEntitlementGrantResult,
  OpsHealthSummary,
  OpsLoginRequest,
  OpsPrivacyRequestQueueItem,
  OpsStaffSession,
  OpsStaffActionRequest,
  OpsStaffDisableResult,
  OpsStaffListItem,
  OpsStaffSessionRevokeResult,
} from '@icao/contracts';
import type { NativeOpsUserSummary as OpsUserSummary } from '@icao/contracts/native-auth';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { AdminFeedbackStorageService } from './admin-feedback-storage.service';

import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { AdminAuthService } from './admin-auth.service';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminDataService } from './admin-data.service';
import { AdminEntitlementService } from './admin-entitlement.service';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import { opsLoginSource } from './admin-login-rate-limiter';
import { AdminStaffService } from './admin-staff.service';
import {
  opsGrantExecuteSchema,
  opsGrantPreviewSchema,
  opsLoginSchema,
  opsReasonQuerySchema,
  opsStaffActionSchema,
  opsUserSearchSchema,
} from './admin.schemas';
import type { OpsAuthenticatedRequest } from './admin.types';

const uuidSchema = z.uuid();

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: OpsLoginRequest,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsStaffSession>> {
    const parsed = opsLoginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ops_login_request');
    const source = opsLoginSource(request, this.config.opsTrustedProxySharedSecret);
    return {
      requestId: request.id,
      data: await this.auth.login(parsed.data, request.id, source),
    };
  }

  @Get('me')
  @UseGuards(RequireAdminAuthGuard)
  me(@Req() request: OpsAuthenticatedRequest) {
    return { requestId: request.id, data: { staff: request.opsStaff! } };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(RequireAdminAuthGuard)
  async logout(@Req() request: OpsAuthenticatedRequest) {
    return {
      requestId: request.id,
      data: await this.auth.logout(request.opsStaff!, request.id),
    };
  }

  @Post('sessions/revoke-all')
  @HttpCode(200)
  @UseGuards(RequireAdminAuthGuard)
  async revokeAllSessions(@Req() request: OpsAuthenticatedRequest) {
    return {
      requestId: request.id,
      data: await this.auth.revokeAllSessions(request.opsStaff!, request.id),
    };
  }
}

@Controller('v1/admin')
@UseGuards(RequireAdminAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly data: AdminDataService,
    private readonly entitlements: AdminEntitlementService,
    private readonly staff: AdminStaffService,
    private readonly feedbackStorage: AdminFeedbackStorageService,
  ) {}

  @Get('health')
  async health(
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsHealthSummary>> {
    return {
      requestId: request.id,
      data: await this.data.health(request.opsStaff!, request.id),
    };
  }

  @Post('users/search')
  @HttpCode(200)
  async searchUsers(
    @Body() body: unknown,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsUserSummary[]>> {
    const parsed = opsUserSearchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ops_user_search');
    return {
      requestId: request.id,
      data: await this.data.searchUsers(
        parsed.data.query,
        parsed.data.reason,
        request.opsStaff!,
        request.id,
      ),
    };
  }

  @Get('accounts/:accountId/commerce')
  async accountCommerce(
    @Param('accountId') accountId: string,
    @Headers('x-ops-reason') reason: string | undefined,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsAccountCommerceSummary>> {
    const parsedAccountId = uuidSchema.safeParse(accountId);
    const parsed = opsReasonQuerySchema.safeParse({ reason });
    if (!parsed.success || !parsedAccountId.success) {
      throw new BadRequestException('invalid_ops_account_query');
    }
    return {
      requestId: request.id,
      data: await this.data.accountCommerce(
        parsedAccountId.data,
        parsed.data.reason,
        request.opsStaff!,
        request.id,
      ),
    };
  }

  @Get('feedback')
  async feedback(
    @Query('source') source: string | undefined,
    @Query('status') status: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() request: OpsAuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<OpsFeedbackListResponse>> {
    if (source && !['profile', 'study', 'exam_report', 'opi_hotspot'].includes(source)) throw new BadRequestException('invalid_feedback_source');
    if (status && !['received', 'processing', 'resolved'].includes(status)) throw new BadRequestException('invalid_feedback_status');
    if (cursor && cursor.length > 300) throw new BadRequestException('invalid_feedback_cursor');
    reply.header('cache-control', 'private, no-store');
    return {
      requestId: request.id,
      data: await this.data.feedbackQueue('查看用户提交的反馈列表', request.opsStaff!, request.id, cursor, 30, status, source),
    };
  }

  @Get('feedback/:ticketNumber')
  async feedbackDetail(
    @Param('ticketNumber') ticketNumber: string, @Req() request: OpsAuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<OpsFeedbackDetail>> {
    this.assertFeedbackTicket(ticketNumber);
    reply.header('cache-control', 'private, no-store');
    return { requestId: request.id, data: await this.data.feedbackDetail(ticketNumber, request.opsStaff!, request.id) };
  }

  @Post('feedback/:ticketNumber/replies')
  @OpsRoles('admin', 'support')
  async replyToFeedback(@Param('ticketNumber') ticketNumber: string, @Body() body: unknown, @Req() request: OpsAuthenticatedRequest) {
    this.assertFeedbackTicket(ticketNumber);
    const parsed = feedbackReplySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_feedback_reply');
    return { requestId: request.id, data: await this.data.replyToFeedback(ticketNumber, parsed.data, request.opsStaff!, request.id) };
  }

  @Get('feedback/:ticketNumber/attachments/:attachmentId')
  async feedbackAttachment(
    @Param('ticketNumber') ticketNumber: string, @Param('attachmentId') attachmentId: string,
    @Req() request: OpsAuthenticatedRequest, @Res() reply: FastifyReply,
  ) {
    this.assertFeedbackTicket(ticketNumber);
    if (!uuidSchema.safeParse(attachmentId).success) throw new BadRequestException('invalid_feedback_attachment');
    const image = await this.data.feedbackAttachment(ticketNumber, attachmentId, request.opsStaff!, request.id);
    const bytes = await this.feedbackStorage.read(image);
    return reply.header('cache-control', 'private, no-store').header('x-content-type-options', 'nosniff')
      .header('content-type', image.mimeType).send(bytes);
  }

  private assertFeedbackTicket(ticketNumber: string) {
    if (!/^FB-\d{6}-[A-F0-9]{8}$/u.test(ticketNumber)) throw new BadRequestException('invalid_feedback_ticket');
  }

  @Get('privacy-requests')
  async privacyRequests(
    @Headers('x-ops-reason') reason: string | undefined,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsPrivacyRequestQueueItem[]>> {
    const parsed = opsReasonQuerySchema.safeParse({ reason });
    if (!parsed.success) throw new BadRequestException('invalid_ops_reason');
    return {
      requestId: request.id,
      data: await this.data.privacyQueue(parsed.data.reason, request.opsStaff!, request.id),
    };
  }

  @Get('audit')
  @OpsRoles('admin')
  async audit(
    @Headers('x-ops-reason') reason: string | undefined,
    @Req() request: OpsAuthenticatedRequest,
  ) {
    const parsed = opsReasonQuerySchema.safeParse({ reason });
    if (!parsed.success) throw new BadRequestException('invalid_ops_reason');
    return {
      requestId: request.id,
      data: await this.data.auditEvents(parsed.data.reason, request.opsStaff!, request.id),
    };
  }

  @Get('staff')
  @OpsRoles('admin')
  async listStaff(
    @Headers('x-ops-reason') reason: string | undefined,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsStaffListItem[]>> {
    const parsed = opsReasonQuerySchema.safeParse({ reason });
    if (!parsed.success) throw new BadRequestException('invalid_ops_reason');
    return {
      requestId: request.id,
      data: await this.staff.list(parsed.data.reason, request.opsStaff!, request.id),
    };
  }

  @Patch('staff/:staffId/disable')
  @OpsRoles('admin')
  async disableStaff(
    @Param('staffId') staffId: string,
    @Body() body: OpsStaffActionRequest,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsStaffDisableResult>> {
    const parsedStaffId = uuidSchema.safeParse(staffId);
    const parsed = opsStaffActionSchema.safeParse(body);
    if (!parsedStaffId.success || !parsed.success) {
      throw new BadRequestException('invalid_ops_staff_action');
    }
    return {
      requestId: request.id,
      data: await this.staff.disable(
        parsedStaffId.data,
        parsed.data.reason,
        request.opsStaff!,
        request.id,
      ),
    };
  }

  @Post('staff/:staffId/sessions/revoke-all')
  @HttpCode(200)
  @OpsRoles('admin')
  async revokeStaffSessions(
    @Param('staffId') staffId: string,
    @Body() body: OpsStaffActionRequest,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsStaffSessionRevokeResult>> {
    const parsedStaffId = uuidSchema.safeParse(staffId);
    const parsed = opsStaffActionSchema.safeParse(body);
    if (!parsedStaffId.success || !parsed.success) {
      throw new BadRequestException('invalid_ops_staff_action');
    }
    return {
      requestId: request.id,
      data: await this.staff.revokeAllSessions(
        parsedStaffId.data,
        parsed.data.reason,
        request.opsStaff!,
        request.id,
      ),
    };
  }

  @Post('review-entitlements/preview')
  @HttpCode(200)
  @OpsRoles('admin')
  async previewEntitlement(
    @Body() body: OpsEntitlementGrantRequest,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsEntitlementGrantPreview>> {
    const parsed = opsGrantPreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ops_entitlement_preview');
    return {
      requestId: request.id,
      data: await this.entitlements.preview(parsed.data, request.opsStaff!, request.id),
    };
  }

  @Post('review-entitlements/:previewId/execute')
  @HttpCode(200)
  @OpsRoles('admin')
  async executeEntitlement(
    @Param('previewId') previewId: string,
    @Body() body: OpsEntitlementGrantExecuteRequest,
    @Req() request: OpsAuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<OpsEntitlementGrantResult>> {
    const parsedPreviewId = uuidSchema.safeParse(previewId);
    const parsed = opsGrantExecuteSchema.safeParse(body);
    if (!parsed.success || !parsedPreviewId.success) {
      throw new BadRequestException('invalid_ops_entitlement_execution');
    }
    return {
      requestId: request.id,
      data: await this.entitlements.execute(
        parsedPreviewId.data,
        parsed.data.confirmationToken,
        request.opsStaff!,
        request.id,
      ),
    };
  }
}
