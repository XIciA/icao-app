import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope, InviteSessionResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth.types';
import { inviteSessionSchema } from './invite-auth.schemas';
import { InviteAuthService } from './invite-auth.service';

type InviteRequest = AuthenticatedRequest & { ip?: string };

@Controller('v1/auth/invite')
export class InviteAuthController {
  constructor(private readonly invites: InviteAuthService) {}

  @Post('session')
  async session(@Body() body: unknown, @Req() request: InviteRequest): Promise<ApiSuccessEnvelope<InviteSessionResponse>> {
    const parsed = inviteSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_invite_code');
    const source = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const data = await this.invites.exchange(parsed.data.inviteCode, Array.isArray(source) ? source[0] ?? 'unknown' : source);
    return { requestId: request.id, data };
  }
}
