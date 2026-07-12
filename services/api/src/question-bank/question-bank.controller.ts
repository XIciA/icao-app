import { Controller, Get, Headers, Param, Req, Res } from '@nestjs/common';
import type { ApiSuccessEnvelope, QuestionBankRelease, QuestionBankReleaseSummary } from '@icao/contracts';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { QuestionBankService } from './question-bank.service';

@Controller('v1/question-banks')
export class QuestionBankController {
  constructor(private readonly questionBanks: QuestionBankService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<ApiSuccessEnvelope<QuestionBankReleaseSummary[]>> {
    return { requestId: request.id, data: await this.questionBanks.list() };
  }

  @Get(':bankId')
  async get(
    @Param('bankId') bankId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccessEnvelope<QuestionBankRelease> | undefined> {
    const release = await this.questionBanks.get(bankId);
    const etag = `"${release.checksum}"`;
    reply.header('etag', etag).header('cache-control', 'private, max-age=300');
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    return { requestId: request.id, data: release };
  }
}
