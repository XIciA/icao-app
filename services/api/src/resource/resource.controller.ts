import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, ResolvedResource } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { ResourceService } from './resource.service';

@Controller('v1/resources')
@UseGuards(RequireAuthGuard)
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Get('resolve')
  async resolve(@Query('path') path: string | undefined, @Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<ResolvedResource>> {
    if (!path || (!path.startsWith('/question-bank-assets/') && !path.startsWith('/editorial-assets/'))) {
      throw new BadRequestException('invalid_resource_path');
    }
    return { requestId: request.id, data: await this.resources.resolve(path) };
  }
}
