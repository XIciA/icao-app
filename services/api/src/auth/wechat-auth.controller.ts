import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope, SocialAuthSessionResponse, WechatSessionRequest } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth.types';
import { wechatSessionSchema } from './wechat-auth.schemas';
import { WechatAuthService } from './wechat-auth.service';

@Controller('v1/auth/wechat')
export class WechatAuthController {
  constructor(private readonly wechat: WechatAuthService) {}

  @Post('session')
  async session(
    @Body() body: WechatSessionRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<SocialAuthSessionResponse>> {
    const parsed = wechatSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_wechat_authorization_code');
    return { requestId: request.id, data: await this.wechat.exchange(parsed.data.code, (request as AuthenticatedRequest & { ip?: string }).ip ?? '127.0.0.1') };
  }
}
