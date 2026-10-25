import { ContentAccessService } from '../content-access/content-access.service';
import { contentCommerceEnvironment } from '../content-access/content-access.environment';
import { Controller, Get, Headers, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, VocabularyRelease } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { VocabularyService } from './vocabulary.service';

@Controller('v1/vocabulary')
@UseGuards(RequireAuthGuard)
export class VocabularyController {
  constructor(private readonly contentAccess: ContentAccessService, private readonly vocabulary: VocabularyService) {}

  @Get()
  async get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('catalog') catalog?: string,
  ): Promise<ApiSuccessEnvelope<VocabularyRelease> | undefined> {
    await this.contentAccess.assertMembership(request.user!.id, request.auth!.sessionId, contentCommerceEnvironment(String(request.headers['x-icao-commerce-environment'] ?? 'production')));
    const release = this.vocabulary.get(catalog);
    const etag = `"${release.checksum}"`;
    reply.header('etag', etag).header('cache-control', 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    return { requestId: request.id, data: release };
  }
}
