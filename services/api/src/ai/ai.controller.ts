import { BadRequestException, Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, AiConsent, GrammarReviewRequest, GrammarReviewResult, OpiAnalysisResult, PolishRequest, PolishResult, TranscribeResult, WordLookupRequest, WordLookupResult } from '@icao/contracts';
import type { MultipartFile } from '@fastify/multipart';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AiService } from './ai.service';
import { consentSchema, grammarSchema, polishSchema, wordLookupSchema } from './ai.schemas';

type AiRequest = AuthenticatedRequest & { raw: { once(event: 'aborted', listener: () => void): void } };
type MultipartRequest = AiRequest & { file(options?: object): Promise<MultipartFile | undefined> };

function cancellationSignal(request: AiRequest) {
  const controller = new AbortController();
  request.raw.once('aborted', () => controller.abort());
  return controller.signal;
}

@Controller('v1/ai')
@UseGuards(OptionalAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('consent')
  async consent(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<AiConsent>> {
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_ai_consent');
    return { requestId: request.id, data: await this.ai.acceptConsent(request.user?.id, parsed.data.policyVersion) };
  }

  @Delete('consent')
  async revoke(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<{ revoked: true }>> {
    return { requestId: request.id, data: await this.ai.revokeConsent(request.user?.id) };
  }

  @Post('word-lookup')
  async lookup(@Body() body: WordLookupRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<WordLookupResult>> {
    const parsed = wordLookupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_word_lookup');
    return { requestId: request.id, data: await this.ai.wordLookup(request.user?.id, request.id, parsed.data, cancellationSignal(request)) };
  }

  @Post('transcribe')
  async transcribe(@Req() request: MultipartRequest): Promise<ApiSuccessEnvelope<TranscribeResult>> {
    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8 } });
    if (!file || !file.mimetype.startsWith('audio/')) throw new BadRequestException('invalid_audio');
    const audio = await file.toBuffer();
    return { requestId: request.id, data: await this.ai.transcribe(request.user?.id, request.id, audio, file.mimetype, cancellationSignal(request)) };
  }

  @Post('grammar-review')
  async grammar(@Body() body: GrammarReviewRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<GrammarReviewResult>> {
    const parsed = grammarSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_grammar_review');
    return { requestId: request.id, data: await this.ai.grammarReview(request.user?.id, request.id, parsed.data, cancellationSignal(request)) };
  }

  @Post('opi-analysis')
  async opi(@Body() body: GrammarReviewRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<OpiAnalysisResult>> {
    const parsed = grammarSchema.safeParse(body);
    if (!parsed.success || parsed.data.module !== 'opi') throw new BadRequestException('invalid_opi_analysis');
    return { requestId: request.id, data: await this.ai.opiAnalysis(request.user?.id, request.id, parsed.data, cancellationSignal(request)) };
  }

  @Post('polish')
  async polish(@Body() body: PolishRequest, @Req() request: AiRequest): Promise<ApiSuccessEnvelope<PolishResult>> {
    const parsed = polishSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_polish');
    return { requestId: request.id, data: await this.ai.polish(request.user?.id, request.id, parsed.data, cancellationSignal(request)) };
  }
}
