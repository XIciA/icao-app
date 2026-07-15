import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, SyncPullResponse, SyncPushRequest, SyncPushResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { SyncService } from './sync.service';

@Controller('v1/sync')
@UseGuards(RequireAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  async push(
    @Body() body: SyncPushRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPushResponse>> {
    return { requestId: request.id, data: await this.sync.push(request.user!.id, body) };
  }

  @Get('pull')
  async pull(
    @Query('cursor') cursor: string | undefined,
    @Query('ownerUserId') ownerUserId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPullResponse>> {
    return { requestId: request.id, data: await this.sync.pull(request.user!.id, cursor, ownerUserId) };
  }
}
