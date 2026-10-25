import { normalizeDailyHotspots, type AppContentHotspotOverview } from '@icao/contracts/app-content';
import { ContentAccessService } from '../content-access/content-access.service';
import { Controller, Get, Headers, NotFoundException, Param, Req, Res } from '@nestjs/common';
import type { ApiSuccessEnvelope } from '@icao/contracts';
import type { AppContentRelease } from '@icao/contracts/app-content';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppContentService, legacyHotspotRelease, compatibleHotspotRelease } from './app-content.service';

/** Public legal/content metadata and hotspot question overviews; protected study data stays in topic APIs. */
@Controller('v1/app-content')
export class AppContentController {
  constructor(private readonly content: AppContentService, private readonly access: ContentAccessService) {}

  @Get('hotspots/:briefId/overview')
  async overview(@Param('briefId') briefId: string, @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply): Promise<ApiSuccessEnvelope<AppContentHotspotOverview>> {
    const release = await this.content.get();
    const brief = normalizeDailyHotspots(release.payload.hotspots.briefs).find(item =>
      item.id === briefId || item.sources?.some(source => source.id === briefId));
    if (!brief) throw new NotFoundException('hotspot_not_found');
    reply.header('cache-control', 'public, max-age=0, must-revalidate');
    return { requestId: request.id, data: await this.access.hotspotOverview(brief) };
  }

  @Get()
  async get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<AppContentRelease> | undefined> {
    const current = await this.content.get();
    const format=(request.query as {hotspotFormat?:string}|undefined)?.hotspotFormat;
    const data=format==='3'?current:format==='2'?compatibleHotspotRelease(current):legacyHotspotRelease(current);
    const etag = `"${data.checksum}"`;
    reply.header('etag', etag).header('cache-control', 'public, max-age=0, must-revalidate');
    if (ifNoneMatch === etag) { reply.status(304); return undefined; }
    return { requestId: request.id, data };
  }
}
