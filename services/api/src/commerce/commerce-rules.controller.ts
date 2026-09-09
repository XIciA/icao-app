import { BadRequestException, Controller, Get, Headers, Req, UseGuards } from '@nestjs/common';
import { COMMERCE_ENVIRONMENT_HEADER, type ApiSuccessEnvelope } from '@icao/contracts';
import type { AiAllowanceResponse } from '@icao/contracts/commerce-rules';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { ContentAccessService } from '../content-access/content-access.service';
import { contentCommerceEnvironment } from '../content-access/content-access.environment';
import { DatabaseService } from '../database/database.service';
import { AiAllowanceService } from './ai-allowance.service';

@Controller('v1/commerce/allowance')
@UseGuards(RequireAuthGuard)
export class CommerceRulesController {
  constructor(
    private readonly database: DatabaseService,
    private readonly allowance: AiAllowanceService,
    private readonly contentAccess: ContentAccessService,
  ) {}

  @Get('current')
  async current(
    @Headers(COMMERCE_ENVIRONMENT_HEADER) header: string | string[] | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<AiAllowanceResponse>> {
    if (Array.isArray(header)) throw new BadRequestException('invalid_commerce_environment');
    const environment = contentCommerceEnvironment(header);
    const now = new Date();
    await this.contentAccess.assertEnvironmentAuthorized(request.user!.id, request.auth!.sessionId, environment, now);
    const context = await this.database.db.transaction((transaction) => (
      this.allowance.summary(transaction, request.user!.id, environment, now)
    ));
    return { requestId: request.id, data: { environment, serverTime: now.toISOString(), allowance: context.summary } };
  }
}
