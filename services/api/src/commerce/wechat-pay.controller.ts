import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { COMMERCE_ENVIRONMENT_HEADER } from '@icao/contracts';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { WechatPayService } from './wechat-pay.service';
const createSchema = z.object({ productKey: z.string().min(1).max(64), idempotencyKey: z.uuid() }).strict();
const idSchema = z.uuid();

@Controller('v1/commerce/wechat')
@UseGuards(RequireAuthGuard)
export class WechatPayController {
  constructor(private readonly payments: WechatPayService) {}
  private validate(request: AuthenticatedRequest, id?: string) {
    const environment = request.headers[COMMERCE_ENVIRONMENT_HEADER];
    if (environment !== undefined && environment !== 'production') throw new BadRequestException('wechat_pay_environment_unsupported');
    if (id !== undefined && !idSchema.safeParse(id).success) throw new BadRequestException('invalid_wechat_checkout');
  }
  @Get('catalog')
  catalog(@Req() request: AuthenticatedRequest) {
    this.validate(request);
    return { requestId: request.id, data: this.payments.catalog() };
  }
  @Post('checkouts')
  @HttpCode(200)
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    this.validate(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_wechat_checkout');
    return { requestId: request.id, data: await this.payments.create(request.user!.id, parsed.data) };
  }
  @Get('pending')
  async pending(@Req() request: AuthenticatedRequest) {
    this.validate(request);
    return { requestId: request.id, data: await this.payments.pending(request.user!.id) };
  }
  @Get('checkouts/:id')
  async status(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    this.validate(request, id);
    return { requestId: request.id, data: await this.payments.status(request.user!.id, id) };
  }
  @Post('checkouts/:id/cancel')
  @HttpCode(200)
  async cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    this.validate(request, id);
    return { requestId: request.id, data: await this.payments.cancel(request.user!.id, id) };
  }
}

@Controller('v1/commerce/wechat/notifications')
export class WechatPayNotificationController {
  constructor(private readonly payments: WechatPayService) {}
  @Post()
  @HttpCode(204)
  async receive(@Req() request: RawBodyRequest<FastifyRequest>) {
    if (!request.rawBody) throw new BadRequestException('wechat_notification_raw_body_required');
    await this.payments.notification(request.rawBody, { get: (name) => {
      const value = request.headers[name.toLowerCase()];
      return typeof value === 'string' ? value : null;
    } });
  }
}
