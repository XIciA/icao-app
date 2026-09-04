import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, AuthorizePasswordRecoveryRequest, AuthorizePasswordRecoveryResponse, DeleteAccountRequest, DeleteAccountResponse, RevokeAllSessionsResponse, StartPhoneBindingRequest, UpdatePhonePasswordRequest, UpdatePhonePasswordResponse } from '@icao/contracts';
import type { NativeAccountSummary as AccountSummary, NativeBindPhoneRequest as BindPhoneRequest, NativeBindPhoneResponse as BindPhoneResponse, NativeStartPhoneBindingResponse as StartPhoneBindingResponse } from '@icao/contracts/native-auth';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { AccountService } from './account.service';
import { AccountDeletionService } from './account-deletion.service';
import { authorizePasswordRecoverySchema, bindPhoneSchema, deleteAccountSchema, startPhoneBindingSchema, updatePhonePasswordSchema } from './account.schemas';

@Controller('v1/account')
@UseGuards(RequireAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Get()
  async summary(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<AccountSummary>> {
    return { requestId: request.id, data: await this.account.summary(request.user!.id, request.user!.phone) };
  }

  @Post('sessions/revoke-all')
  async revokeAll(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<RevokeAllSessionsResponse>> {
    return { requestId: request.id, data: await this.account.revokeAll(request.user!.id, request.auth!.accessToken) };
  }

  @Post('password')
  async updatePassword(
    @Body() body: UpdatePhonePasswordRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<UpdatePhonePasswordResponse>> {
    const parsed = updatePhonePasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_password');
    return {
      requestId: request.id,
      data: await this.account.updatePassword(
        request.auth!,
        parsed.data.password,
        parsed.data.currentPassword,
        parsed.data.recoveryGrantId,
      ),
    };
  }

  @Post('password/recovery/authorize')
  async authorizePasswordRecovery(
    @Body() body: AuthorizePasswordRecoveryRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<AuthorizePasswordRecoveryResponse>> {
    const parsed = authorizePasswordRecoverySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_password_recovery');
    return {
      requestId: request.id,
      data: await this.account.authorizePasswordRecovery(request.auth!, parsed.data.challengeId),
    };
  }

  @Post(['phone-binding/start', 'merge/phone/start'])
  async startPhoneBinding(
    @Body() body: StartPhoneBindingRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<StartPhoneBindingResponse>> {
    const parsed = startPhoneBindingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_binding');
    return {
      requestId: request.id,
      data: await this.account.startPhoneBinding(
        request.auth!,
        parsed.data.phone,
        (request as AuthenticatedRequest & { ip?: string }).ip ?? '127.0.0.1',
      ),
    };
  }

  @Post(['phone-binding/verify', 'merge/phone'])
  async verifyPhoneBinding(@Body() body: BindPhoneRequest, @Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<BindPhoneResponse>> {
    const parsed = bindPhoneSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_binding');
    return {
      requestId: request.id,
      data: await this.account.bindPhoneWithOtp(
        request.auth!,
        parsed.data.challengeId,
        parsed.data.phone,
        parsed.data.token,
        (request as AuthenticatedRequest & { ip?: string }).ip ?? '127.0.0.1',
      ),
    };
  }

  @Delete()
  @HttpCode(202)
  async delete(
    @Body() body: DeleteAccountRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<DeleteAccountResponse>> {
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_account_deletion');
    return {
      requestId: request.id,
      data: await this.deletion.requestDeletion(request.auth!, parsed.data),
    };
  }
}
