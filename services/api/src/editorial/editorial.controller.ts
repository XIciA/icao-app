import { BadRequestException, Controller, Get, Headers, Param, Query, Req, Res } from '@nestjs/common';
import type {
  ApiSuccessEnvelope,
  EditorialChannel,
  EditorialDetailResponse,
  EditorialListResponse,
} from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { EditorialService } from './editorial.service';

@Controller('v1/editorial')
export class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get()
  async list(
    @Query('channel') channel: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<EditorialListResponse> | undefined> {
    if (channel !== 'resource' && channel !== 'opi_hotspot') throw new BadRequestException('invalid_editorial_channel');
    const data = await this.editorial.list(channel satisfies EditorialChannel);
    if (this.applyCacheHeaders(data.checksum, ifNoneMatch, reply)) return undefined;
    return { requestId: request.id, data };
  }

  @Get(':slug')
  async get(
    @Param('slug') slug: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<EditorialDetailResponse> | undefined> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('invalid_editorial_slug');
    const data = await this.editorial.get(slug);
    if (this.applyCacheHeaders(data.checksum, ifNoneMatch, reply)) return undefined;
    return { requestId: request.id, data };
  }

  private applyCacheHeaders(checksum: string, ifNoneMatch: string | undefined, reply: FastifyReply) {
    const etag = `"${checksum}"`;
    reply.header('etag', etag).header('cache-control', 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return true;
    }
    return false;
  }
}
