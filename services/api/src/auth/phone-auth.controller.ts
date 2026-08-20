import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope, StartPhoneOtpRequest, StartPhoneOtpResponse } from '@icao/contracts';

import type { AuthenticatedRequest } from './auth.types';
import { PhoneAuthService } from './phone-auth.service';
import { startPhoneOtpSchema } from './phone-auth.schemas';

type PhoneAuthRequest = AuthenticatedRequest & { ip?: string };

@Controller('v1/auth/phone')
export class PhoneAuthController {
  constructor(private readonly phoneAuth: PhoneAuthService) {}

  @Post('otp/start')
  async start(
    @Body() body: StartPhoneOtpRequest,
    @Req() request: PhoneAuthRequest,
  ): Promise<ApiSuccessEnvelope<StartPhoneOtpResponse>> {
    const parsed = startPhoneOtpSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_number');
    return { requestId: request.id, data: await this.phoneAuth.start(parsed.data.phone, request.ip ?? '127.0.0.1') };
  }

  @Post('recovery/start')
  @HttpCode(202)
  async startRecovery(
    @Body() body: StartPhoneOtpRequest,
    @Req() request: PhoneAuthRequest,
  ): Promise<ApiSuccessEnvelope<StartPhoneOtpResponse>> {
    const parsed = startPhoneOtpSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_number');
    return { requestId: request.id, data: await this.phoneAuth.startRecovery(parsed.data.phone, request.ip ?? '127.0.0.1') };
  }
}
