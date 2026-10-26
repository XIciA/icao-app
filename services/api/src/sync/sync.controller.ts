import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, SyncPullResponse, SyncPushRequest, SyncPushResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { SyncService } from './sync.service';
import { vocabularyPayloadForClient } from './vocabulary-compat';
import { VocabularyLiveService } from '../vocabulary/vocabulary-live.service';
import { VocabularyService } from '../vocabulary/vocabulary.service';
import { LIVE_VOCABULARY_CATALOG } from '@icao/contracts/vocabulary-live';

@Controller('v1/sync')
@UseGuards(RequireAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService, private readonly liveVocabulary: VocabularyLiveService, private readonly vocabulary: VocabularyService) {}

  private async projection(catalog: unknown, payloads: unknown[]) {
    if (catalog === LIVE_VOCABULARY_CATALOG || !payloads.some(value => value && typeof value === 'object' && 'documentKey' in value && value.documentKey === 'vocabulary')) return undefined;
    return { policy: (await this.liveVocabulary.get()).policy, baseline: this.vocabulary.get(catalog === 'three-books-v3' ? 'three-books-v3' : 'question-bank-core').dataset };
  }

  @Post('push')
  async push(
    @Body() body: SyncPushRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPushResponse>> {
    const result = await this.sync.push(request.user!.id, body);
    const catalog = request.headers['x-icao-vocabulary-catalog'];
    const projection = await this.projection(catalog, result.results.map(item => item.authoritative));
    return { requestId: request.id, data: { ...result, results:result.results.map(item => item.authoritative ? { ...item, authoritative:vocabularyPayloadForClient(item.authoritative,catalog,projection) } : item) } };
  }

  @Get('pull')
  async pull(
    @Query('cursor') cursor: string | undefined,
    @Query('ownerUserId') ownerUserId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SyncPullResponse>> {
    const result = await this.sync.pull(request.user!.id, cursor, ownerUserId);
    const catalog = request.headers['x-icao-vocabulary-catalog'];
    const projection = await this.projection(catalog, result.changes.map(change => change.payload));
    return { requestId: request.id, data: { ...result, changes:result.changes.map(change => ({...change,payload:vocabularyPayloadForClient(change.payload,catalog,projection)})) } };
  }
}
