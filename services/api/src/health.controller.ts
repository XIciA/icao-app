import { Controller, Get, Req, ServiceUnavailableException } from '@nestjs/common';
import type { ApiSuccessEnvelope, HealthStatus } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth/auth.types';
import { DatabaseService } from './database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live(@Req() request: AuthenticatedRequest): ApiSuccessEnvelope<HealthStatus> {
    return { requestId: request.id, data: { service: 'icao-api', status: 'ok' } };
  }

  @Get('ready')
  async ready(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<HealthStatus>> {
    try {
      await this.database.ping();
      return { requestId: request.id, data: { service: 'icao-api', status: 'ok', database: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('database_unavailable');
    }
  }
}
