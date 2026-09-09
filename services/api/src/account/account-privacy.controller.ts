import { BadRequestException, Body, Controller, Delete, Param, Req, UseGuards } from '@nestjs/common';
import {
  type ApiSuccessEnvelope,
  type ClearLearningDataRequest,
  type DeleteAllAiResultsRequest,
  type PrivacyDeletionResponse,
} from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { SyncService } from '../sync/sync.service';
import { clearLearningDataSchema, deleteAllAiResultsSchema } from './account.schemas';

@Controller('v1/account/privacy')
@UseGuards(RequireAuthGuard)
export class AccountPrivacyController {
  constructor(
    private readonly sync: SyncService,
  ) {}

  @Delete('ai-results/:recordId')
  async deleteAiResult(
    @Param('recordId') recordId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<PrivacyDeletionResponse>> {
    if (!recordId || recordId.length > 200) throw new BadRequestException('invalid_ai_result_id');
    return {
      requestId: request.id,
      data: await this.sync.deleteAiResult(request.user!.id, recordId),
    };
  }

  @Delete('ai-results')
  async deleteAllAiResults(
    @Body() body: DeleteAllAiResultsRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<PrivacyDeletionResponse>> {
    const parsed = deleteAllAiResultsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_privacy_confirmation');
    return {
      requestId: request.id,
      data: await this.sync.deleteAllAiResults(request.user!.id, parsed.data),
    };
  }

  @Delete('learning-data')
  async clearLearningData(
    @Body() body: ClearLearningDataRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<PrivacyDeletionResponse>> {
    const parsed = clearLearningDataSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_privacy_confirmation');
    return {
      requestId: request.id,
      data: await this.sync.clearLearningData(request.user!.id, parsed.data),
    };
  }

}
