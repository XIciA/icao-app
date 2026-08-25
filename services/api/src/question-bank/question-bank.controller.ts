import { Controller, Get, Headers, Param, Req, Res, UseGuards } from '@nestjs/common';
import { COMMERCE_ENVIRONMENT_HEADER, type ApiSuccessEnvelope, type QuestionBankRelease, type QuestionBankReleaseSummary, type QuestionBankTopicRelease } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { contentCommerceEnvironment } from '../content-access/content-access.environment';
import { QuestionBankService } from './question-bank.service';

@Controller('v1/question-banks')
@UseGuards(RequireAuthGuard)
export class QuestionBankController {
  constructor(private readonly questionBanks: QuestionBankService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<QuestionBankReleaseSummary[]>> {
    return { requestId: request.id, data: await this.questionBanks.list() };
  }

  @Get(':bankId')
  async get(
    @Param('bankId') bankId: string,
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<QuestionBankRelease> | undefined> {
    const release = await this.questionBanks.get(
      bankId,
      request.user!.id,
      request.auth!.sessionId,
      contentCommerceEnvironment(environmentHeader),
    );
    const access = (release.dataset as { access?: { membershipActive?: unknown } }).access;
    const accessState = access?.membershipActive === true ? 'member' : 'free';
    const etag = `"${release.checksum}.content-access-v1.${accessState}"`;
    reply.header('etag', etag).header('cache-control', 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    return { requestId: request.id, data: release };
  }

  @Get(':bankId/categories/:categoryId/topics/:topicId')
  async getTopic(
    @Param('bankId') bankId: string,
    @Param('categoryId') categoryId: string,
    @Param('topicId') topicId: string,
    @Headers(COMMERCE_ENVIRONMENT_HEADER) environmentHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<QuestionBankTopicRelease>> {
    const release = await this.questionBanks.getTopic(
      bankId,
      categoryId,
      topicId,
      request.user!.id,
      request.auth!.sessionId,
      contentCommerceEnvironment(environmentHeader),
    );
    reply.header('cache-control', 'private, no-store');
    return { requestId: request.id, data: release };
  }
}
