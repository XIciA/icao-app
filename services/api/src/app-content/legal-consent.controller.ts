import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope } from '@icao/contracts';
import type { LegalConsentReceipt, LegalConsentStatus } from '@icao/contracts/app-content';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { LegalConsentService } from './legal-consent.service';

@Controller('v1/legal-consent')
@UseGuards(RequireAuthGuard)
export class LegalConsentController {
  constructor(private readonly consent: LegalConsentService) {}

  @Get()
  async status(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<ApiSuccessEnvelope<LegalConsentStatus>> {
    reply.header('cache-control', 'private, no-store');
    return { requestId: request.id, data: await this.consent.status(request.user!.id) };
  }

  @Post()
  async accept(@Body() body: unknown, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<ApiSuccessEnvelope<LegalConsentReceipt>> {
    reply.header('cache-control', 'private, no-store');
    return { requestId: request.id, data: await this.consent.accept(request.user!.id, body) };
  }
}
