import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import type { ApiSuccessEnvelope, VocabularyRelease } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { VocabularyService } from './vocabulary.service';
import { VocabularyLiveService } from './vocabulary-live.service';
import { LIVE_VOCABULARY_CATALOG, type VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';

@Controller('v1/vocabulary')
export class VocabularyController {
  constructor(private readonly vocabulary: VocabularyService, private readonly live: VocabularyLiveService) {}

  @Get()
  async get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('catalog') catalog?: string,
  ): Promise<ApiSuccessEnvelope<VocabularyRelease | VocabularyLiveRelease> | undefined> {
    const release = catalog === LIVE_VOCABULARY_CATALOG ? await this.live.get() : this.vocabulary.get(catalog);
    const etag = `"${release.checksum}"`;
    reply.header('etag', etag).header('cache-control', catalog === LIVE_VOCABULARY_CATALOG ? 'private, no-cache' : 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    return { requestId: request.id, data: release };
  }
}
