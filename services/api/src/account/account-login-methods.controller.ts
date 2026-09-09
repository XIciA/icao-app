import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { completeWechatAuthSchema } from '../auth/wechat-auth.schemas';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { AccountLoginMethodsService } from './account-login-methods.service';

const grantSchema = z.object({ recentAuthGrantId: z.uuid() }).strict();
const appleSchema = grantSchema.extend({ providerAccessToken: z.string().min(16).max(16_384) }).strict();
const wechatSchema = completeWechatAuthSchema.extend({ recentAuthGrantId: z.uuid() }).strict();

@Controller('v1/account/login-methods')
@UseGuards(RequireAuthGuard)
export class AccountLoginMethodsController {
  constructor(private readonly methods: AccountLoginMethodsService) {}

  @Post('apple/bind')
  async bindApple(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = appleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_login_method_request');
    return { requestId: request.id, data: await this.methods.bindApple(request.auth!, parsed.data) };
  }

  @Post('wechat/start')
  async startWechat(@Req() request: AuthenticatedRequest & { ip?: string }) {
    return { requestId: request.id, data: await this.methods.startWechatBinding(request.auth!, request.ip ?? '127.0.0.1') };
  }

  @Post('wechat/bind')
  async bindWechat(@Body() body: unknown, @Req() request: AuthenticatedRequest & { ip?: string }) {
    const parsed = wechatSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_login_method_request');
    return { requestId: request.id, data: await this.methods.bindWechat(request.auth!, parsed.data, request.ip ?? '127.0.0.1') };
  }

  @Post(':provider/unbind')
  async unbind(@Param('provider') provider: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success || (provider !== 'apple' && provider !== 'wechat')) throw new BadRequestException('invalid_login_method_request');
    return { requestId: request.id, data: await this.methods.unbind(request.auth!, provider, parsed.data.recentAuthGrantId) };
  }
}
