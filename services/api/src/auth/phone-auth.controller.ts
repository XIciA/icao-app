import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { ApiSuccessEnvelope, StartPhoneOtpRequest } from '@icao/contracts';
import type { NativeStartPhoneOtpResponse as StartPhoneOtpResponse, VerifyPhoneOtpRequest, VerifyPhoneOtpResponse } from '@icao/contracts/native-auth';

import type { AuthenticatedRequest } from './auth.types';
import { PhoneAuthService } from './phone-auth.service';
import { startPhoneOtpSchema, verifyPhoneOtpSchema } from './phone-auth.schemas';

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

  @Post('otp/verify')
  async verify(
    @Body() body: VerifyPhoneOtpRequest,
    @Req() request: PhoneAuthRequest,
  ): Promise<ApiSuccessEnvelope<VerifyPhoneOtpResponse>> {
    const parsed = verifyPhoneOtpSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_phone_otp');
    return {
      requestId: request.id,
      data: await this.phoneAuth.verifyLogin(parsed.data, request.ip ?? '127.0.0.1'),
    };
  }
}
