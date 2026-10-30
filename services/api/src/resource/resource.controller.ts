import { BadRequestException, Body, Post, Controller, Get, Headers, Query, Req, UseGuards } from '@nestjs/common';
import { COMMERCE_ENVIRONMENT_HEADER, type ApiSuccessEnvelope, type ResolvedResource } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { OptionalAuthGuard } from '../auth/require-auth.guard';
import { contentCommerceEnvironment } from '../content-access/content-access.environment';
import { ResourceService } from './resource.service';

@Controller('v1/resources')
@UseGuards(OptionalAuthGuard)
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Post('resolve-batch')
  async batch(@Body() body: { resources?: { publicPath: string; checksum: string }[] },
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!Array.isArray(body?.resources) || body.resources.length < 1 || body.resources.length > 24
      || body.resources.some(resource => !resource || typeof resource.publicPath !== 'string'
        || !resource.publicPath.startsWith('/question-bank-assets/') || typeof resource.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(resource.checksum))) throw new BadRequestException('invalid_download_resources');
    const results: ResolvedResource[] = [];
    for (let offset = 0; offset < body.resources.length; offset += 4) {
      results.push(...await Promise.all(body.resources.slice(offset, offset + 4).map(resource => this.resources.resolve(request.user?.id,
        resource.publicPath, request.auth?.sessionId, contentCommerceEnvironment(environmentHeader), resource.checksum))));
    }
    return { requestId: request.id, data: results };
  }

  @Get('resolve')
  async resolve(
    @Query('path') path: string | undefined,
    @Query('checksum') checksum: string | undefined,
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<ResolvedResource>> {
    if (checksum !== undefined && !/^[a-f0-9]{64}$/.test(checksum)) throw new BadRequestException('invalid_resource_checksum');
    if (!path || (!path.startsWith('/question-bank-assets/') && !path.startsWith('/editorial-assets/') && !/^\/pronunciation-assets\/[a-f0-9]{64}\.mp3$/.test(path))) {
      throw new BadRequestException('invalid_resource_path');
    }
    return {
      requestId: request.id,
      data: await this.resources.resolve(
        request.user?.id,
        path,
        request.auth?.sessionId,
        contentCommerceEnvironment(environmentHeader),
        checksum,
      ),
    };
  }
}
