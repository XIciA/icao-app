import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, PasswordRecentAuthRequest, RecentAuthGrantResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth.types';
import { RecentAuthService } from './recent-auth.service';
import { passwordRecentAuthSchema } from './recent-auth.schemas';
import { RequireAuthGuard } from './require-auth.guard';

@Controller('v1/account/recent-auth')
@UseGuards(RequireAuthGuard)
export class RecentAuthController {
  constructor(private readonly recentAuth: RecentAuthService) {}

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
}
