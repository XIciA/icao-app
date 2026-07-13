import { Controller, Get, Headers, Req, Res, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, VocabularyRelease } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { VocabularyService } from './vocabulary.service';

@Controller('v1/vocabulary')
@UseGuards(RequireAuthGuard)
export class VocabularyController {
  constructor(private readonly vocabulary: VocabularyService) {}

  @Get()
  get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): ApiSuccessEnvelope<VocabularyRelease> | undefined {
    const release = this.vocabulary.get();
    const etag = `"${release.checksum}"`;
    reply.header('etag', etag).header('cache-control', 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    return { requestId: request.id, data: release };
  }
}
