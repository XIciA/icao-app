import { Controller, HttpException, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { SupabaseSmsHookService } from './supabase-sms-hook.service';

@Controller('v1/hooks/supabase')
export class SupabaseSmsHookController {
  constructor(private readonly hook: SupabaseSmsHookService) {}

  @Post('send-sms')
  async sendSms(@Req() request: RawBodyRequest<FastifyRequest>, @Res() reply: FastifyReply) {
    try {
      await this.hook.handle(request.rawBody, request.headers);
      return reply.status(200).send({});
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 503;
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const message = typeof response === 'string' && /^[a-z0-9_]+$/u.test(response)
        ? response
        : status === 429 ? 'sms_rate_limited' : 'sms_delivery_failed';
      return reply.status(status).send({ error: { http_code: status, message } });
    }
  }
}
