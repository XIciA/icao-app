import { Controller, Get, Inject, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { OPS_API_CONFIG, type OpsApiConfig } from './config';
import { DatabaseService } from './database/database.service';

@Controller('health')
export class OpsHealthController {
  constructor(
    private readonly database: DatabaseService,
    @Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig,
  ) {}

  private setReleaseHeader(reply: FastifyReply) {
    reply.header('x-icao-api-version', this.config.apiReleaseId);
  }

  @Get('live')
  live(
    @Req() request: { id: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.setReleaseHeader(reply);
    return { requestId: request.id, data: { service: 'icao-ops-api', status: 'ok' } };
  }

  @Get('ready')
  async ready(
    @Req() request: { id: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.setReleaseHeader(reply);
    try {
      await this.database.ping();
      return {
        requestId: request.id,
        data: { service: 'icao-ops-api', status: 'ok', database: 'ok' },
      };
    } catch {
      throw new ServiceUnavailableException('database_unavailable');
    }
  }
}
