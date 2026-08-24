import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, AppleRecentAuthRequest, PasswordRecentAuthRequest, RecentAuthGrantResponse } from '@icao/contracts';

import { AppleAuthService } from './apple-auth.service';
import { appleRecentAuthSchema } from './apple-auth.schemas';
import type { AuthenticatedRequest } from './auth.types';
import { RecentAuthService } from './recent-auth.service';
import { passwordRecentAuthSchema } from './recent-auth.schemas';
import { RequireAuthGuard } from './require-auth.guard';

@Controller('v1/account/recent-auth')
@UseGuards(RequireAuthGuard)
export class RecentAuthController {
  constructor(
    private readonly recentAuth: RecentAuthService,
    private readonly appleAuth: AppleAuthService,
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
