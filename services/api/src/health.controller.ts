import { Controller, Get, Inject, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { ApiSuccessEnvelope, HealthStatus } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from './auth/auth.types';
import { DatabaseService } from './database/database.service';
import { API_CONFIG, type ApiConfig } from './config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private setReleaseHeader(reply: FastifyReply) {
    reply.header('x-icao-api-version', this.config.apiReleaseId);
  }

  @Get('live')
  live(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): ApiSuccessEnvelope<HealthStatus> {
    this.setReleaseHeader(reply);
    return { requestId: request.id, data: { service: 'icao-api', status: 'ok' } };
  }

  @Get('ready')
  async ready(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<HealthStatus>> {
    this.setReleaseHeader(reply);
    try {
      await this.database.assertMinimumSchemaVersion();
      return { requestId: request.id, data: { service: 'icao-api', status: 'ok', database: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('database_unavailable');
    }
  }
}
