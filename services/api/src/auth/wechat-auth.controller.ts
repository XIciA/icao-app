import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope } from '@icao/contracts';
import type { CompleteWechatAuthRequest, CompleteWechatAuthResponse, StartWechatAuthResponse } from '@icao/contracts/native-auth';

import type { AuthenticatedRequest } from './auth.types';
import { WechatAuthService } from './wechat-auth.service';
import { completeWechatAuthSchema } from './wechat-auth.schemas';

type WechatRequest = AuthenticatedRequest & { ip?: string };

@Controller('v1/auth/wechat')
export class WechatAuthController {
  constructor(private readonly wechatAuth: WechatAuthService) {}

  @Post('challenge')
  async start(@Req() request: WechatRequest): Promise<ApiSuccessEnvelope<StartWechatAuthResponse>> {
    return { requestId: request.id, data: await this.wechatAuth.start(request.ip ?? '127.0.0.1') };
  }

  @Post('session')
  async complete(
    @Body() body: CompleteWechatAuthRequest,
    @Req() request: WechatRequest,
  ): Promise<ApiSuccessEnvelope<CompleteWechatAuthResponse>> {
    const parsed = completeWechatAuthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_wechat_auth_response');
    return {
      requestId: request.id,
      data: await this.wechatAuth.complete(parsed.data, request.ip ?? '127.0.0.1'),
    };
  }
}
