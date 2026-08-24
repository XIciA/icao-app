import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type {
  ApiSuccessEnvelope,
  AppleCredentialRequest,
  RegisterAppleCredentialResponse,
} from '@icao/contracts';

import { AppleAuthService } from './apple-auth.service';
import { appleCredentialSchema } from './apple-auth.schemas';
import type { AuthenticatedRequest } from './auth.types';
import { RequireAuthGuard } from './require-auth.guard';

@Controller('v1/account/apple-credentials')
@UseGuards(RequireAuthGuard)
export class AppleAuthController {
  constructor(private readonly appleAuth: AppleAuthService) {}

  @Post()
  async register(
    @Body() body: AppleCredentialRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccessEnvelope<RegisterAppleCredentialResponse>> {
    const parsed = appleCredentialSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_apple_credential_request');
    return {
      requestId: request.id,
      data: await this.appleAuth.registerCredential(request.auth!, parsed.data),
    };
  }
}
