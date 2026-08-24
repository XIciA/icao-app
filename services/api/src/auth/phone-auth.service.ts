import { createHmac } from 'node:crypto';

import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RecentAuthPurpose, StartPhoneOtpResponse } from '@icao/contracts';
import { isChinaMobileE164 } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { phoneOtpIntents } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';

const RECOVERY_RESPONSE_FLOOR_MS = 350;
const OTP_INTENT_TTL_MS = 10 * 60 * 1_000;
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
    await this.recordIntent(phone, 'login', undefined, startedAt);
    return { accepted: true };
  }

  async startRecovery(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const startedAt = Date.now();
    const { error } = await this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    });
    if (!error) {
      await this.recordIntent(phone, 'password_recovery', undefined, new Date(startedAt));
    }
    await this.waitForRecoveryFloor(startedAt);
    return { accepted: true };
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
    await this.recordIntent(phone, purpose, source.user.id, startedAt);
    return { accepted: true };
  }

  async startBinding(source: VerifiedAuthSession, phone: string, sourceIp: string) {
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
    await this.recordIntent(phone, 'phone_binding', source.user.id, startedAt);
    return { sent: true as const };
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

  private async recordIntent(
    phone: string,
    purpose: PhoneOtpPurpose,
    accountId: string | undefined,
    startedAt: Date,
  ) {
    const phoneDigest = this.phoneDigest(phone);
    await this.database.db.transaction(async (transaction) => {
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
      if (newerIntent) return;
      await transaction.update(phoneOtpIntents).set({
        consumedAt: startedAt,
        status: 'consumed',
      }).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        eq(phoneOtpIntents.purpose, purpose),
        accountCondition,
        eq(phoneOtpIntents.status, 'pending'),
        lte(phoneOtpIntents.createdAt, startedAt),
      ));
      await transaction.insert(phoneOtpIntents).values({
        accountId,
        createdAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + OTP_INTENT_TTL_MS),
        otpNotBefore: new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000),
        phoneDigest,
        purpose,
      });
    });
  }
}
