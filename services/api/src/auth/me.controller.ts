import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope } from '@icao/contracts';
import type { NativeAuthenticatedUser as AuthenticatedUser } from '@icao/contracts/native-auth';

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
