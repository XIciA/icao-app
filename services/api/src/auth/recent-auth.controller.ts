import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, AppleRecentAuthRequest, PasswordRecentAuthRequest, PhoneRecentAuthRequest, RecentAuthGrantResponse, StartPhoneOtpResponse, StartPhoneRecentAuthRequest } from '@icao/contracts';

import { AppleAuthService } from './apple-auth.service';
import { appleRecentAuthSchema } from './apple-auth.schemas';
import type { AuthenticatedRequest } from './auth.types';
import { PhoneAuthService } from './phone-auth.service';
import { RecentAuthService } from './recent-auth.service';
import { passwordRecentAuthSchema, phoneRecentAuthSchema } from './recent-auth.schemas';
import { RequireAuthGuard } from './require-auth.guard';

@Controller('v1/account/recent-auth')
@UseGuards(RequireAuthGuard)
export class RecentAuthController {
  constructor(
    private readonly recentAuth: RecentAuthService,
    private readonly appleAuth: AppleAuthService,
    private readonly phoneAuth: PhoneAuthService,
  ) {}

  @Post('password')
  async password(
    @Body() body: PasswordRecentAuthRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<RecentAuthGrantResponse>> {
    const parsed = passwordRecentAuthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_recent_auth_request');
    return {
      requestId: request.id,
      data: await this.recentAuth.issuePasswordGrant(request.auth!, parsed.data.purpose, parsed.data.password),
    };
  }

  @Post('phone/start')
  async startPhone(
    @Body() body: StartPhoneRecentAuthRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<StartPhoneOtpResponse>> {
    const parsed = phoneRecentAuthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_recent_auth_request');
    return {
      requestId: request.id,
      data: await this.phoneAuth.startRecentAuth(
        request.auth!,
        parsed.data.purpose,
        (request as AuthenticatedRequest & { ip?: string }).ip ?? '127.0.0.1',
      ),
    };
  }

  @Post('phone')
  async phone(
    @Body() body: PhoneRecentAuthRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<RecentAuthGrantResponse>> {
    const parsed = phoneRecentAuthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_recent_auth_request');
    return {
      requestId: request.id,
      data: await this.recentAuth.issuePhoneOtpGrant(request.auth!, parsed.data.purpose),
    };
  }

  @Post('apple')
  async apple(
    @Body() body: AppleRecentAuthRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<RecentAuthGrantResponse>> {
    const parsed = appleRecentAuthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_recent_auth_request');
    await this.appleAuth.registerCredential(request.auth!, parsed.data);
    return {
      requestId: request.id,
      data: await this.recentAuth.issueVerifiedGrant(request.auth!, 'apple', parsed.data.purpose),
    };
  }
}
