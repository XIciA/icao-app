import { createHmac } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { AuthorizePasswordRecoveryResponse, StartPhoneOtpResponse } from '@icao/contracts';
import { isChinaMobileE164 } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';
import type { VerifiedAuthSession } from './auth.types';

const RECOVERY_RESPONSE_FLOOR_MS = 350;
const RECOVERY_REQUEST_TTL_MS = 10 * 60 * 1_000;
const RECOVERY_GRANT_TTL_MS = 10 * 60 * 1_000;

type RecoveryRequest = {
  expiresAt: number;
  otpNotBefore: number;
};

@Injectable()
export class PhoneAuthService {
  private readonly config: ApiConfig;
  private readonly recoveryGrants = new Map<string, number>();
  private readonly recoveryRequests = new Map<string, RecoveryRequest>();

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.config = config;
  }

  private client(sourceIp: string): SupabaseClient {
    return createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { 'Sb-Forwarded-For': sourceIp } },
    });
  }

  async start(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: {
          account_type: 'native_phone',
          age_gate: '14_plus',
          password_set: false,
          registration_pending: false,
        },
      },
    });
    if (error) this.throwStartError(error.code);
    return { accepted: true };
  }

  async startRecovery(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const startedAt = Date.now();
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    });
    if (!error) {
      this.cleanupRecoveryState(startedAt);
      this.recoveryRequests.set(this.recoveryRequestKey(phone), {
        expiresAt: startedAt + RECOVERY_REQUEST_TTL_MS,
        otpNotBefore: Math.floor(startedAt / 1_000) + 1,
      });
    }
    await this.waitForRecoveryFloor(startedAt);
    return { accepted: true };
  }

  authorizePasswordRecovery(
    source: VerifiedAuthSession,
    now = Date.now(),
  ): AuthorizePasswordRecoveryResponse {
    const phone = source.user.phone;
    if (!isChinaMobileE164(phone) || !source.user.providers?.includes('phone')) {
      throw new UnauthorizedException('phone_reauthentication_required');
    }
    this.cleanupRecoveryState(now);
    const requestKey = this.recoveryRequestKey(phone);
    const recoveryRequest = this.recoveryRequests.get(requestKey);
    const nowSeconds = Math.floor(now / 1_000);
    const qualifyingOtp = source.authenticationMethods.some((entry) => (
      entry.method === 'otp'
      && entry.timestamp >= (recoveryRequest?.otpNotBefore ?? Number.POSITIVE_INFINITY)
      && entry.timestamp <= nowSeconds + 60
    ));
    if (!recoveryRequest || recoveryRequest.expiresAt <= now || !qualifyingOtp) {
      throw new UnauthorizedException('phone_reauthentication_required');
    }
    this.recoveryRequests.delete(requestKey);
    const expiresAt = now + RECOVERY_GRANT_TTL_MS;
    this.recoveryGrants.set(this.recoveryGrantKey(source.authUserId, source.sessionId), expiresAt);
    return { authorized: true, expiresAt };
  }

  consumePasswordRecovery(source: VerifiedAuthSession, now = Date.now()) {
    this.cleanupRecoveryState(now);
    const key = this.recoveryGrantKey(source.authUserId, source.sessionId);
    const valid = (this.recoveryGrants.get(key) ?? 0) > now;
    if (valid) this.recoveryGrants.delete(key);
    return valid;
  }

  private isRateLimit(code: string | undefined) {
    return code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit';
  }

  private throwStartError(code: string | undefined): never {
    if (this.isRateLimit(code)) {
      throw new HttpException('phone_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new ServiceUnavailableException('phone_auth_unavailable');
  }

  private async waitForRecoveryFloor(startedAt: number) {
    const remaining = RECOVERY_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private recoveryRequestKey(phone: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`password-recovery-request-v1\0${phone}`)
      .digest('hex');
  }

  private recoveryGrantKey(authUserId: string, sessionId: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`password-recovery-grant-v1\0${authUserId}\0${sessionId}`)
      .digest('hex');
  }

  private cleanupRecoveryState(now: number) {
    for (const [key, request] of this.recoveryRequests) {
      if (request.expiresAt <= now) this.recoveryRequests.delete(key);
    }
    for (const [key, expiresAt] of this.recoveryGrants) {
      if (expiresAt <= now) this.recoveryGrants.delete(key);
    }
  }
}
