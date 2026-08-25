import { Controller, Get, Req } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

@Controller('health')
export class OpsHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live(@Req() request: { id: string }) {
    return { requestId: request.id, data: { service: 'icao-ops-api', status: 'ok' } };
  }

  @Get('ready')
  async ready(@Req() request: { id: string }) {
    await this.database.ping();
    return {
      requestId: request.id,
      data: { service: 'icao-ops-api', status: 'ok', database: 'ok' },
    };
  }
}
