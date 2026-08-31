import { createHmac } from 'node:crypto';

import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RecentAuthPurpose, SocialAuthSessionResponse, StartPhoneBindingResponse, StartPhoneOtpResponse, VerifyPhoneOtpRequest, VerifyPhoneOtpResponse } from '@icao/contracts';
import { isChinaMobileE164 } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { phoneOtpIntents } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';

const RECOVERY_RESPONSE_FLOOR_MS = 350;
export const PHONE_OTP_RESEND_INTERVAL_MS = 60 * 1_000;
export const PHONE_OTP_TTL_MS = 5 * 60 * 1_000;
export const PHONE_OTP_MAX_ATTEMPTS = 6;
type PhoneOtpPurpose = 'login' | RecentAuthPurpose;
export type PhoneAuthTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

@Injectable()
export class PhoneAuthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
  ) {}

  private client(sourceIp: string): SupabaseClient {
    return createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { 'Sb-Forwarded-For': sourceIp } },
    });
  }

  async start(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const startedAt = new Date();
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: {
          account_type: 'native_phone',
          age_gate: '16_plus',
          password_set: false,
          registration_pending: false,
        },
      },
    });
    if (error) this.throwStartError(error.code);
    return this.recordIntent(phone, 'login', undefined, startedAt);
  }

  async startRecovery(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const startedAt = Date.now();
    await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    });
    // Unknown phones and provider-side rejections use the same tracked response
    // shape and latency. No account-existence signal is exposed, while the
    // challenge remains recoverable in the client and will simply fail verify.
    const challenge = await this.recordIntent(phone, 'password_recovery', undefined, new Date(startedAt));
    await this.waitForRecoveryFloor(startedAt);
    return challenge;
  }

  async startRecentAuth(
    source: VerifiedAuthSession,
    purpose: Exclude<RecentAuthPurpose, 'password_recovery'>,
    sourceIp: string,
  ): Promise<StartPhoneOtpResponse> {
    const phone = source.user.phone;
    if (!isChinaMobileE164(phone) || !source.user.providers?.includes('phone')) {
      throw new ForbiddenException('phone_reauthentication_required');
    }
    const startedAt = new Date();
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    });
    if (error) this.throwStartError(error.code);
    return this.recordIntent(phone, purpose, source.user.id, startedAt);
  }

  async startBinding(source: VerifiedAuthSession, phone: string, sourceIp: string): Promise<StartPhoneBindingResponse> {
    const startedAt = new Date();
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: { account_type: 'native_phone_binding_target' },
      },
    });
    if (error) {
      const code = error.code?.toLowerCase();
      if (this.isRateLimit(code)) {
        throw new HttpException('phone_binding_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new ServiceUnavailableException('phone_binding_otp_unavailable');
    }
    const challenge = await this.recordIntent(phone, 'phone_binding', source.user.id, startedAt);
    return { ...challenge, sent: true };
  }

  async verifyLogin(
    request: VerifyPhoneOtpRequest,
    sourceIp: string,
  ): Promise<VerifyPhoneOtpResponse> {
    const purpose: PhoneOtpPurpose = request.purpose === 'recovery' ? 'password_recovery' : 'login';
    const session = await this.verifyChallenge(request.challengeId, request.phone, request.token, purpose, sourceIp);
    return { session, verified: true };
  }

  async consumeOtpIntent(
    source: VerifiedAuthSession,
    purpose: PhoneOtpPurpose,
    now = new Date(),
    boundAccountId = source.user.id,
  ) {
    return this.database.db.transaction((transaction) => this.consumeOtpIntentInTransaction(
      transaction,
      source,
      purpose,
      now,
      boundAccountId,
    ));
  }

  async consumeOtpIntentInTransaction(
    transaction: PhoneAuthTransaction,
    source: VerifiedAuthSession,
    purpose: PhoneOtpPurpose,
    now = new Date(),
    boundAccountId = source.user.id,
  ) {
    const phone = source.user.phone;
    if (!isChinaMobileE164(phone) || !source.user.providers?.includes('phone')) {
      throw new ForbiddenException('phone_reauthentication_required');
    }
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    const otpTimestamp = Math.max(...source.authenticationMethods
      .filter((entry) => entry.method === 'otp' && entry.timestamp <= nowSeconds + 60)
      .map((entry) => entry.timestamp), Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(otpTimestamp)) throw new ForbiddenException('phone_reauthentication_required');
    const accountCondition = purpose === 'login' || purpose === 'password_recovery'
      ? isNull(phoneOtpIntents.accountId)
      : eq(phoneOtpIntents.accountId, boundAccountId);
    const [intent] = await transaction.select({ id: phoneOtpIntents.id })
      .from(phoneOtpIntents)
      .where(and(
        eq(phoneOtpIntents.phoneDigest, this.phoneDigest(phone)),
        eq(phoneOtpIntents.purpose, purpose),
        accountCondition,
        eq(phoneOtpIntents.status, 'pending'),
        gt(phoneOtpIntents.expiresAt, now),
        lte(phoneOtpIntents.otpNotBefore, new Date(otpTimestamp * 1_000)),
      ))
      .orderBy(desc(phoneOtpIntents.createdAt))
      .limit(1)
      .for('update');
    if (!intent) throw new ForbiddenException('phone_reauthentication_required');
    const [updated] = await transaction.update(phoneOtpIntents).set({
      consumedAt: now,
      status: 'consumed',
    }).where(and(
      eq(phoneOtpIntents.id, intent.id),
      eq(phoneOtpIntents.status, 'pending'),
    )).returning({ id: phoneOtpIntents.id });
    if (!updated) throw new ForbiddenException('phone_reauthentication_required');
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

  private phoneDigest(phone: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`phone-otp-intent-v1\0${phone}`)
      .digest('hex');
  }

  private challengeWindow(startedAt: Date, challengeId: string): StartPhoneOtpResponse {
    const issuedAt = startedAt.getTime();
    return {
      accepted: true,
      challengeId,
      expiresAt: issuedAt + PHONE_OTP_TTL_MS,
      issuedAt,
      resendAllowedAt: issuedAt + PHONE_OTP_RESEND_INTERVAL_MS,
      serverTime: Date.now(),
    };
  }

  private async recordIntent(
    phone: string,
    purpose: PhoneOtpPurpose,
    accountId: string | undefined,
    startedAt: Date,
  ): Promise<StartPhoneOtpResponse> {
    const phoneDigest = this.phoneDigest(phone);
    const challengeId = await this.database.db.transaction(async (transaction) => {
      const scope = `${phoneDigest}:${purpose}:${accountId ?? 'unbound'}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-intent:${scope}`}, 0))`);
      const accountCondition = accountId
        ? eq(phoneOtpIntents.accountId, accountId)
        : isNull(phoneOtpIntents.accountId);
      const [newerIntent] = await transaction.select({ id: phoneOtpIntents.id })
        .from(phoneOtpIntents)
        .where(and(
          eq(phoneOtpIntents.phoneDigest, phoneDigest),
          eq(phoneOtpIntents.purpose, purpose),
          accountCondition,
          eq(phoneOtpIntents.status, 'pending'),
          gt(phoneOtpIntents.createdAt, startedAt),
        ))
        .limit(1);
      if (newerIntent) return newerIntent.id;
      await transaction.update(phoneOtpIntents).set({
        consumedAt: startedAt,
        status: 'superseded',
      }).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        eq(phoneOtpIntents.purpose, purpose),
        accountCondition,
        eq(phoneOtpIntents.status, 'pending'),
        lte(phoneOtpIntents.createdAt, startedAt),
      ));
      const [created] = await transaction.insert(phoneOtpIntents).values({
        accountId,
        createdAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + PHONE_OTP_TTL_MS),
        otpNotBefore: new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000),
        phoneDigest,
        purpose,
      }).returning({ id: phoneOtpIntents.id });
      if (!created) throw new ServiceUnavailableException('phone_auth_unavailable');
      return created.id;
    });
    return this.challengeWindow(startedAt, challengeId);
  }

  private async verifyChallenge(
    challengeId: string,
    phone: string,
    token: string,
    purpose: PhoneOtpPurpose,
    sourceIp: string,
  ): Promise<SocialAuthSessionResponse> {
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-verify:${challengeId}`}, 0))`);
      const accountCondition = purpose === 'login' || purpose === 'password_recovery'
        ? isNull(phoneOtpIntents.accountId)
        : sql`true`;
      const [intent] = await transaction.select({
        attemptCount: phoneOtpIntents.attemptCount,
        createdAt: phoneOtpIntents.createdAt,
        expiresAt: phoneOtpIntents.expiresAt,
        id: phoneOtpIntents.id,
        status: phoneOtpIntents.status,
      }).from(phoneOtpIntents).where(and(
        eq(phoneOtpIntents.id, challengeId),
        eq(phoneOtpIntents.phoneDigest, this.phoneDigest(phone)),
        eq(phoneOtpIntents.purpose, purpose),
        accountCondition,
      )).limit(1).for('update');
      if (
        !intent
        || intent.status !== 'pending'
        || intent.expiresAt <= now
        || intent.attemptCount >= PHONE_OTP_MAX_ATTEMPTS
      ) throw new ForbiddenException('invalid_phone_otp');

      await transaction.update(phoneOtpIntents).set({
        attemptCount: intent.attemptCount + 1,
        lastAttemptAt: now,
      }).where(eq(phoneOtpIntents.id, intent.id));

      const { data, error } = await this.client(sourceIp).auth.verifyOtp({ phone, token, type: 'sms' });
      if (error || !data.session || data.user?.phone !== phone) {
        if (intent.attemptCount + 1 >= PHONE_OTP_MAX_ATTEMPTS) {
          await transaction.update(phoneOtpIntents).set({ status: 'failed' })
            .where(eq(phoneOtpIntents.id, intent.id));
        }
        if (error && this.isRateLimit(error.code?.toLowerCase())) {
          throw new HttpException('phone_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new ForbiddenException('invalid_phone_otp');
      }
      const otpTimestamp = Math.max(...((data.session as unknown as { user?: { amr?: Array<{ method?: string; timestamp?: number }> } }).user?.amr ?? [])
        .filter((entry) => entry.method === 'otp' && typeof entry.timestamp === 'number')
        .map((entry) => entry.timestamp!), Number.NEGATIVE_INFINITY);
      // Supabase does not expose the OTP issue timestamp directly. The session
      // AMR is checked when available; the explicit challenge id remains the
      // authoritative resend generation and prevents a stale UI challenge from
      // consuming a newer request.
      if (Number.isFinite(otpTimestamp) && otpTimestamp * 1_000 + 1_000 < intent.createdAt.getTime()) {
        throw new ForbiddenException('invalid_phone_otp');
      }
      await transaction.update(phoneOtpIntents).set({
        consumedAt: now,
        status: 'consumed',
      }).where(and(eq(phoneOtpIntents.id, intent.id), eq(phoneOtpIntents.status, 'pending')));
      return {
        accessToken: data.session.access_token,
        expiresAt: data.session.expires_at,
        refreshToken: data.session.refresh_token,
      };
    });
  }
}
