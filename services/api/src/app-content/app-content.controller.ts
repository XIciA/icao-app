import { Controller, Get, Headers, Req, Res } from '@nestjs/common';
import type { ApiSuccessEnvelope } from '@icao/contracts';
import type { AppContentRelease } from '@icao/contracts/app-content';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppContentService, legacyHotspotRelease } from './app-content.service';

/** Public so a signed-out user can read the terms before agreeing. References contain no question text. */
@Controller('v1/app-content')
export class AppContentController {
  constructor(private readonly content: AppContentService) {}

  @Get()
  async get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<AppContentRelease> | undefined> {
    const current = await this.content.get();
    const data = (request.query as { hotspotFormat?: string } | undefined)?.hotspotFormat === '2' ? current : legacyHotspotRelease(current);
    const etag = `"${data.checksum}"`;
    reply.header('etag', etag).header('cache-control', 'public, max-age=0, must-revalidate');
    if (ifNoneMatch === etag) { reply.status(304); return undefined; }
    return { requestId: request.id, data };
  }
}
