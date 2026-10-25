import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, SyncPullResponse, SyncPushRequest, SyncPushResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { SyncService } from './sync.service';
import { vocabularyPayloadForClient } from './vocabulary-compat';

@Controller('v1/sync')
@UseGuards(RequireAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  async push(
    @Body() body: SyncPushRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPushResponse>> {
    const result = await this.sync.push(request.user!.id, body);
    const catalog = request.headers['x-icao-vocabulary-catalog'];
    return { requestId: request.id, data: { ...result, results:result.results.map(item => item.authoritative ? { ...item, authoritative:vocabularyPayloadForClient(item.authoritative,catalog) } : item) } };
  }

  @Get('pull')
  async pull(
    @Query('cursor') cursor: string | undefined,
    @Query('ownerUserId') ownerUserId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPullResponse>> {
    const result = await this.sync.pull(request.user!.id, cursor, ownerUserId);
    const catalog = request.headers['x-icao-vocabulary-catalog'];
    return { requestId: request.id, data: { ...result, changes:result.changes.map(change => ({...change,payload:vocabularyPayloadForClient(change.payload,catalog)})) } };
  }
}
