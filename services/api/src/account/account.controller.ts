import { BadRequestException, Body, Controller, Delete, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { DeleteAccountRequest, RevokeAllSessionsResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { AccountService } from './account.service';
import { deleteAccountSchema } from './account.schemas';

@Controller('v1/account')
@UseGuards(RequireAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post('sessions/revoke-all')
  async revokeAll(@Req() request: AuthenticatedRequest): Promise<RevokeAllSessionsResponse> {
    return this.account.revokeAll(request.user!.id, request.auth!.accessToken);
  }

  @Delete()
  @HttpCode(204)
  async delete(@Body() body: DeleteAccountRequest, @Req() request: AuthenticatedRequest): Promise<void> {
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_account_deletion');
    await this.account.deleteAccount(request.user!.id, parsed.data.inviteCode);
  }
}
