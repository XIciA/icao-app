import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope, ResolvedResource } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { ResourceService } from './resource.service';

@Controller('v1/resources')
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Get('resolve')
  async resolve(@Query('path') path: string | undefined, @Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<ResolvedResource>> {
    if (!path?.startsWith('/question-bank-assets/')) throw new BadRequestException('invalid_resource_path');
    return { requestId: request.id, data: await this.resources.resolve(path) };
  }
}
