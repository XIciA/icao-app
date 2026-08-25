import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { COMMERCE_ENVIRONMENT_HEADER, type ApiSuccessEnvelope, type ContentAccessCredential, type IssueContentCredentialRequest } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { contentCommerceEnvironment } from './content-access.environment';
import { ContentAccessService } from './content-access.service';

@Controller('v1/content-access')
@UseGuards(RequireAuthGuard)
export class ContentAccessController {
  constructor(private readonly contentAccess: ContentAccessService) {}

  @Post('credentials')
  async issueCredential(
    @Body() body: IssueContentCredentialRequest,
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<ContentAccessCredential>> {
    return {
      requestId: request.id,
      data: await this.contentAccess.issueCredential(
        request.user!.id,
        body,
        request.auth!.sessionId,
        contentCommerceEnvironment(environmentHeader),
      ),
    };
  }
}
