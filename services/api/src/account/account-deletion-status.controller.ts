import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type {
  AccountDeletionStatusRequest,
  ApiSuccessEnvelope,
  DeleteAccountResponse,
} from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AccountDeletionService } from './account-deletion.service';
import { accountDeletionStatusSchema } from './account.schemas';

@Controller('v1/account/deletion')
export class AccountDeletionStatusController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Post('status')
  async status(
    @Body() body: AccountDeletionStatusRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<DeleteAccountResponse>> {
    const parsed = accountDeletionStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_account_deletion_status');
    return {
      requestId: request.id,
      data: await this.deletion.statusByIdempotencyKey(
        parsed.data.idempotencyKey,
        (request as AuthenticatedRequest & { ip?: string }).ip ?? 'unknown',
      ),
    };
  }
}
