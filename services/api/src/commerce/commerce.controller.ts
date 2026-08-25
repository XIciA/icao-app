import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type {
  ApiSuccessEnvelope,
  CommerceEntitlementsResponse,
  CommerceProductCatalogResponse,
  VerifyAppleTransactionRequest,
  VerifyAppleTransactionResponse,
} from '@icao/contracts';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { CommerceService } from './commerce.service';
import { verifyAppleTransactionSchema } from './commerce.schemas';

@Controller('v1/commerce')
@UseGuards(RequireAuthGuard)
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('catalog')
  catalog(@Req() request: AuthenticatedRequest): ApiSuccessEnvelope<CommerceProductCatalogResponse> {
    return { requestId: request.id, data: this.commerce.catalog() };
  }

  @Post('apple/transactions/verify')
  @HttpCode(200)
  async verifyAppleTransaction(
    @Body() body: VerifyAppleTransactionRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<VerifyAppleTransactionResponse>> {
    const parsed = verifyAppleTransactionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_apple_transaction_request');
    return {
      requestId: request.id,
      data: await this.commerce.verifyAppleTransaction(
        request.user!.id,
        parsed.data.signedTransaction,
        request.auth!.sessionId,
      ),
    };
  }

  @Get('entitlements/current')
  async currentEntitlement(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<CommerceEntitlementsResponse>> {
    return {
      requestId: request.id,
      data: await this.commerce.currentEntitlement(request.user!.id),
    };
  }
}
