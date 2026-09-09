import { BadRequestException, Controller, Get, Headers, Query, Req, UseGuards } from '@nestjs/common';
import { COMMERCE_ENVIRONMENT_HEADER, type ApiSuccessEnvelope, type ResolvedResource } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { contentCommerceEnvironment } from '../content-access/content-access.environment';
import { ResourceService } from './resource.service';

@Controller('v1/resources')
@UseGuards(RequireAuthGuard)
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Get('resolve')
  async resolve(
    @Query('path') path: string | undefined,
    @Query('checksum') checksum: string | undefined,
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<ResolvedResource>> {
    if (checksum !== undefined && !/^[a-f0-9]{64}$/.test(checksum)) throw new BadRequestException('invalid_resource_checksum');
    if (!path || (!path.startsWith('/question-bank-assets/') && !path.startsWith('/editorial-assets/'))) {
      throw new BadRequestException('invalid_resource_path');
    }
    return {
      requestId: request.id,
      data: await this.resources.resolve(
        request.user!.id,
        path,
        request.auth!.sessionId,
        contentCommerceEnvironment(environmentHeader),
        checksum,
      ),
    };
  }
}
