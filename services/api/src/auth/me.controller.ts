import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, AuthenticatedUser } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth.types';
import { RequireAuthGuard } from './require-auth.guard';

@Controller('v1/me')
export class MeController {
  @Get()
  @UseGuards(RequireAuthGuard)
  me(@Req() request: AuthenticatedRequest): ApiSuccessEnvelope<AuthenticatedUser> {
    return { requestId: request.id, data: request.user! };
  }
}
