import { BadRequestException, Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { isTencentAsrModel, type AiReviewRequest, type AiReviewResult, type ApiSuccessEnvelope, type AiConsent, type AiConsentStatus, type GrammarReviewRequest, type GrammarReviewResult, type PolishRequest, type PolishResult, type TranscribeResult } from '@icao/contracts';
import type { MultipartFile } from '@fastify/multipart';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { AiService } from './ai.service';
import { consentSchema, grammarSchema, polishSchema, reviewSchema } from './ai.schemas';

type AiRequest = AuthenticatedRequest & { raw: { once(event: 'aborted', listener: () => void): void } };
type MultipartRequest = AiRequest & { file(options?: object): Promise<MultipartFile | undefined> };

function cancellationSignal(request: AiRequest) {
  const controller = new AbortController();
  request.raw.once('aborted', () => controller.abort());
  return controller.signal;
}

function multipartModel(file: MultipartFile) {
  const field = file.fields.model;
  const part = Array.isArray(field) ? field[0] : field;
  const value = part?.type === 'field' ? part.value : undefined;
  if (!isTencentAsrModel(value)) throw new BadRequestException('invalid_asr_model');
  return value;
}

@Controller('v1/ai')
@UseGuards(RequireAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('consent')
  async consentStatus(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<AiConsentStatus>> {
    return { requestId: request.id, data: await this.ai.consentStatus(request.user!.id) };
  }

  @Post('consent')
  async consent(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<AiConsent>> {
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ai_consent');
    return { requestId: request.id, data: await this.ai.acceptConsent(request.user!.id, parsed.data.policyVersion) };
  }

  @Delete('consent')
  async revoke(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<{ revoked: true }>> {
    return { requestId: request.id, data: await this.ai.revokeConsent(request.user!.id) };
  }

  @Post('transcribe')
  async transcribe(@Req() request: MultipartRequest): Promise<ApiSuccessEnvelope<TranscribeResult>> {
    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8 } });
    if (!file || !file.mimetype.startsWith('audio/')) throw new BadRequestException('invalid_audio');
    const audio = await file.toBuffer();
    return { requestId: request.id, data: await this.ai.transcribe(request.user!.id, request.id, audio, file.mimetype, multipartModel(file), cancellationSignal(request)) };
  }

  @Post('grammar-review')
  async grammar(@Body() body: GrammarReviewRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<GrammarReviewResult>> {
    const parsed = grammarSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_grammar_review');
    return { requestId: request.id, data: await this.ai.grammarReview(request.user!.id, request.id, parsed.data, cancellationSignal(request)) };
  }

  @Post('polish')
  async polish(@Body() body: PolishRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<PolishResult>> {
    const parsed = polishSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_polish');
    return { requestId: request.id, data: await this.ai.polish(request.user!.id, request.id, parsed.data, cancellationSignal(request)) };
  }

  @Post('review')
  async review(@Body() body: AiReviewRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<AiReviewResult>> {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ai_review');
    return { requestId: request.id, data: await this.ai.review(request.user!.id, request.id, parsed.data, cancellationSignal(request)) };
  }
}
