import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { RecentAuthPurpose, SocialAuthSessionResponse } from '@icao/contracts';
import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import type { NativeStartPhoneBindingResponse as StartPhoneBindingResponse, NativeStartPhoneOtpResponse as StartPhoneOtpResponse, VerifyPhoneOtpRequest, VerifyPhoneOtpResponse } from '@icao/contracts/native-auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { phoneOtpIntents, smsDeliveryAttempts } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';

const RECOVERY_RESPONSE_FLOOR_MS = 350;
const RECOVERY_VERIFY_RESPONSE_FLOOR_MS = 350;
export const PHONE_OTP_RESEND_INTERVAL_MS = 60 * 1_000;
export const PHONE_OTP_TTL_MS = 5 * 60 * 1_000;
export const PHONE_OTP_MAX_ATTEMPTS = 6;
export const PHONE_OTP_PROVIDER_TIMEOUT_MS = 15 * 1_000;
const PHONE_OTP_QUEUE_LEASE_MS = 30 * 1_000;
type PhoneOtpPurpose = 'login' | RecentAuthPurpose;
export type PhoneAuthTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

@Injectable()
export class PhoneAuthService {
  private readonly logger = new Logger(PhoneAuthService.name);

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
    const { challengeId } = await this.reserveIntent(phone, 'login', undefined, startedAt);
    return this.dispatchReservedIntent(phone, challengeId, async () => this.client(sourceIp).auth.signInWithOtp({
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
    }));
  }

  async startRecovery(phone: string, sourceIp: string): Promise<StartPhoneOtpResponse> {
    const startedAt = Date.now();
    const requestedAt = new Date(startedAt);
    const reservation = await this.reserveIntent(phone, 'password_recovery', undefined, requestedAt, true);
    // Recovery is deliberately returned on a fixed server schedule, without
    // awaiting provider settlement. Known-user delivery and unknown-user
    // rejection therefore expose the same response timing and shape. The
    // background state machine still settles this exact challenge.
    if (reservation.shouldDispatch) {
      void this.dispatchReservedIntent(phone, reservation.challengeId, async () => this.client(sourceIp).auth.signInWithOtp({
        phone,
        options: { channel: 'sms', shouldCreateUser: false },
      }), 'recovery').catch(() => this.logger.error('phone_recovery_dispatch_settlement_failed'));
    }
    await this.waitForRecoveryFloor(startedAt);
    return this.challengeWindow(new Date(startedAt + RECOVERY_RESPONSE_FLOOR_MS), reservation.challengeId);
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
    const { challengeId } = await this.reserveIntent(phone, purpose, source.user.id, startedAt);
    return this.dispatchReservedIntent(phone, challengeId, async () => this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    }));
  }

  async startBinding(source: VerifiedAuthSession, phone: string, sourceIp: string): Promise<StartPhoneBindingResponse> {
    const startedAt = new Date();
    const { challengeId } = await this.reserveIntent(phone, 'phone_binding', source.user.id, startedAt);
    const challenge = await this.dispatchReservedIntent(phone, challengeId, async () => this.client(sourceIp).auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: { account_type: 'native_phone_binding_target' },
      },
    }), 'binding');
    return { ...challenge, sent: true };
  }

  async verifyLogin(
    request: VerifyPhoneOtpRequest,
    sourceIp: string,
  ): Promise<VerifyPhoneOtpResponse> {
    const purpose: PhoneOtpPurpose = request.purpose === 'recovery' ? 'password_recovery' : 'login';
    const startedAt = Date.now();
    try {
      const session = await this.verifyChallenge(request.challengeId, request.phone, request.token, purpose, sourceIp);
      return { session, verified: true };
    } catch (error) {
      if (purpose === 'password_recovery' && error instanceof ForbiddenException) {
        await this.waitForRecoveryVerifyFloor(startedAt);
      }
      throw error;
    }
  }

  async verifyRecentChallenge(
    source: VerifiedAuthSession,
    challengeId: string,
    token: string,
    purpose: Exclude<RecentAuthPurpose, 'password_recovery'>,
    sourceIp: string,
  ) {
    const phone = source.user.phone;
    if (!isChinaMobileE164(phone) || !source.user.providers?.includes('phone')) {
      throw new ForbiddenException('phone_reauthentication_required');
    }
    await this.verifyChallenge(
      challengeId,
      phone,
      token,
      purpose,
      sourceIp,
      source.user.id,
      source.authUserId,
    );
  }

  async verifyBindingChallenge(
    source: VerifiedAuthSession,
    challengeId: string,
    phone: string,
    token: string,
    sourceIp: string,
  ): Promise<SocialAuthSessionResponse> {
    return this.verifyChallenge(
      challengeId,
      phone,
      token,
      'phone_binding',
      sourceIp,
      source.user.id,
    );
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
        eq(phoneOtpIntents.status, 'ready'),
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
      verifiedAuthUserId: source.authUserId,
    }).where(and(
      eq(phoneOtpIntents.id, intent.id),
      eq(phoneOtpIntents.status, 'ready'),
    )).returning({ id: phoneOtpIntents.id });
    if (!updated) throw new ForbiddenException('phone_reauthentication_required');
  }

  async redeemRecoveryIntentInTransaction(
    transaction: PhoneAuthTransaction,
    source: VerifiedAuthSession,
    challengeId: string,
    now = new Date(),
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
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-verify:${challengeId}`}, 0))`);
    const [intent] = await transaction.select({
      consumedAt: phoneOtpIntents.consumedAt,
      id: phoneOtpIntents.id,
      otpNotBefore: phoneOtpIntents.otpNotBefore,
      verifiedAuthUserId: phoneOtpIntents.verifiedAuthUserId,
    }).from(phoneOtpIntents).where(and(
      eq(phoneOtpIntents.id, challengeId),
      eq(phoneOtpIntents.phoneDigest, this.phoneDigest(phone)),
      eq(phoneOtpIntents.purpose, 'password_recovery'),
      isNull(phoneOtpIntents.accountId),
      eq(phoneOtpIntents.status, 'consumed'),
    )).limit(1).for('update');
    if (
      !intent?.consumedAt
      || intent.verifiedAuthUserId !== source.authUserId
      || intent.consumedAt.getTime() <= now.getTime() - PHONE_OTP_TTL_MS
      || intent.otpNotBefore.getTime() > (otpTimestamp + 1) * 1_000
    ) throw new ForbiddenException('phone_reauthentication_required');
    const [redeemed] = await transaction.update(phoneOtpIntents).set({
      status: 'redeemed',
    }).where(and(
      eq(phoneOtpIntents.id, intent.id),
      eq(phoneOtpIntents.status, 'consumed'),
      eq(phoneOtpIntents.verifiedAuthUserId, source.authUserId),
    )).returning({ id: phoneOtpIntents.id });
    if (!redeemed) throw new ForbiddenException('phone_reauthentication_required');
  }

  private isRateLimit(code: string | undefined) {
    return code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit';
  }

  private isDefinitivePreHookRejection(code: string | undefined) {
    return code === 'otp_disabled'
      || code === 'over_sms_send_rate_limit'
      || code === 'over_request_rate_limit';
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

  private async waitForRecoveryVerifyFloor(startedAt: number) {
    const remaining = RECOVERY_VERIFY_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private phoneDigest(phone: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`phone-otp-intent-v1\0${phone}`)
      .digest('hex');
  }

  private challengeWindow(sentAt: Date, challengeId: string): StartPhoneOtpResponse {
    const issuedAt = sentAt.getTime();
    return {
      accepted: true,
      challengeId,
      expiresAt: issuedAt + PHONE_OTP_TTL_MS,
      issuedAt,
      resendAllowedAt: issuedAt + PHONE_OTP_RESEND_INTERVAL_MS,
      serverTime: Date.now(),
    };
  }

  private async reserveIntent(
    phone: string,
    purpose: PhoneOtpPurpose,
    accountId: string | undefined,
    startedAt: Date,
    maskBlocked = false,
  ): Promise<{ challengeId: string; shouldDispatch: boolean }> {
    const phoneDigest = this.phoneDigest(phone);
    const reservation = await this.database.db.transaction(async (transaction) => {
      // Reservation is intentionally short. Provider I/O happens later,
      // outside every database transaction and connection lease.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${phoneDigest}`}, 0))`);
      await transaction.update(phoneOtpIntents).set({
        dispatchLeaseUntil: null,
        status: 'failed',
      }).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        eq(phoneOtpIntents.status, 'queued'),
        lte(phoneOtpIntents.dispatchLeaseUntil, startedAt),
      ));
      const [activeDispatch] = await transaction.select({ id: phoneOtpIntents.id })
        .from(phoneOtpIntents).where(and(
          eq(phoneOtpIntents.phoneDigest, phoneDigest),
          inArray(phoneOtpIntents.status, ['dispatching', 'quarantined', 'verifying']),
        )).limit(1).for('update');
      if (activeDispatch) return { blocked: true as const };
      const [activePending] = await transaction.select({
        createdAt: phoneOtpIntents.createdAt,
        id: phoneOtpIntents.id,
        providerCompletedAt: phoneOtpIntents.providerCompletedAt,
        purpose: phoneOtpIntents.purpose,
      }).from(phoneOtpIntents).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        eq(phoneOtpIntents.status, 'ready'),
      )).limit(1).for('update');
      const resendAnchor = activePending?.purpose === 'password_recovery'
        ? activePending.createdAt.getTime() + RECOVERY_RESPONSE_FLOOR_MS
        : activePending?.providerCompletedAt?.getTime();
      if (
        activePending
        && (
          resendAnchor === undefined
          || resendAnchor + PHONE_OTP_RESEND_INTERVAL_MS > startedAt.getTime()
        )
      ) return { blocked: true as const };
      await transaction.update(phoneOtpIntents).set({
        consumedAt: new Date(),
        dispatchLeaseUntil: null,
        status: 'superseded',
      }).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        inArray(phoneOtpIntents.status, ['queued', 'ready']),
      ));
      const [created] = await transaction.insert(phoneOtpIntents).values({
        accountId,
        createdAt: startedAt,
        dispatchLeaseUntil: new Date(startedAt.getTime() + PHONE_OTP_QUEUE_LEASE_MS),
        expiresAt: new Date(startedAt.getTime() + PHONE_OTP_QUEUE_LEASE_MS + PHONE_OTP_TTL_MS),
        otpNotBefore: new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000),
        phoneDigest,
        purpose,
        status: 'queued',
      }).returning({ id: phoneOtpIntents.id });
      if (!created) throw new ServiceUnavailableException('phone_auth_unavailable');
      return { blocked: false as const, challengeId: created.id };
    });
    if (reservation.blocked && maskBlocked) {
      // Never reveal or mutate the active challenge. A fresh opaque id keeps
      // recovery start responses indistinguishable without allowing an
      // attacker to exhaust someone else's real OTP attempts.
      return { challengeId: randomUUID(), shouldDispatch: false };
    }
    if (reservation.blocked) {
      throw new HttpException('phone_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    return { challengeId: reservation.challengeId, shouldDispatch: true };
  }

  private async dispatchReservedIntent(
    phone: string,
    challengeId: string,
    send: () => Promise<{ error: { code?: string } | null }>,
    errorSurface: 'login' | 'binding' | 'recovery' = 'login',
  ): Promise<StartPhoneOtpResponse> {
    const phoneDigest = this.phoneDigest(phone);
    const claim = await this.claimDispatch(phoneDigest, challengeId, new Date());
    if (claim === 'superseded') {
      throw new HttpException('phone_otp_request_superseded', HttpStatus.CONFLICT);
    }
    if (claim === 'quarantined') {
      throw new HttpException('phone_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }

    const provider = await this.sendWithHardTimeout(send);
    if (provider.first.kind === 'timeout') {
      // A timeout is ambiguous: the Supabase request (and therefore its SMS
      // hook) may still complete. Quarantine is never released by a clock.
      // Keep an observed continuation so a definitive late success/failure
      // settles this exact generation without an unhandled rejection.
      const timedOutAt = new Date();
      await this.quarantineDispatch(phoneDigest, challengeId, timedOutAt);
      void provider.settlement.then(async (lateOutcome) => {
        await this.finalizeDispatch(
          phoneDigest,
          challengeId,
          new Date(),
          lateOutcome.kind === 'provider_error',
          lateOutcome.kind === 'provider_error' ? lateOutcome.code : undefined,
        );
      }).catch(() => this.logger.error('phone_otp_late_settlement_failed'));
      if (errorSurface === 'recovery') return this.challengeWindow(timedOutAt, challengeId);
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    const providerOutcome = provider.first.outcome;
    const completedAt = new Date();
    const outcome = await this.finalizeDispatch(
      phoneDigest,
      challengeId,
      completedAt,
      providerOutcome.kind === 'provider_error',
      providerOutcome.kind === 'provider_error' ? providerOutcome.code : undefined,
    );
    if (outcome.kind === 'superseded') {
      throw new HttpException('phone_otp_request_superseded', HttpStatus.CONFLICT);
    }
    if (outcome.kind === 'provider_error') {
      if (errorSurface === 'recovery') return this.challengeWindow(completedAt, challengeId);
      if (errorSurface === 'binding') {
        if (this.isRateLimit(outcome.code)) {
          throw new HttpException('phone_binding_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new ServiceUnavailableException('phone_binding_otp_unavailable');
      }
      this.throwStartError(outcome.code);
    }
    return this.challengeWindow(completedAt, challengeId);
  }

  private async claimDispatch(phoneDigest: string, challengeId: string, now: Date) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${phoneDigest}`}, 0))`);
      const [reserved] = await transaction.select({
        dispatchLeaseUntil: phoneOtpIntents.dispatchLeaseUntil,
        dispatchSequence: phoneOtpIntents.dispatchSequence,
        lastAttemptAt: phoneOtpIntents.lastAttemptAt,
        status: phoneOtpIntents.status,
      }).from(phoneOtpIntents)
        .where(eq(phoneOtpIntents.id, challengeId))
        .limit(1)
        .for('update');
      if (!reserved || ['failed', 'superseded', 'consumed', 'redeemed', 'ready', 'verifying'].includes(reserved.status)) {
        return 'superseded' as const;
      }
      if (reserved.status === 'dispatching' || reserved.status === 'quarantined') {
        return 'quarantined' as const;
      }
      if (reserved.status !== 'queued' || !reserved.dispatchLeaseUntil || reserved.dispatchLeaseUntil <= now) {
        return 'superseded' as const;
      }
      const [claimed] = await transaction.update(phoneOtpIntents).set({
        dispatchLeaseUntil: new Date(now.getTime() + PHONE_OTP_PROVIDER_TIMEOUT_MS + PHONE_OTP_TTL_MS),
        lastAttemptAt: now,
        status: 'dispatching',
      }).where(and(
        eq(phoneOtpIntents.id, challengeId),
        eq(phoneOtpIntents.status, 'queued'),
      )).returning({ id: phoneOtpIntents.id });
      return claimed ? 'claimed' as const : 'superseded' as const;
    });
  }

  private async quarantineDispatch(phoneDigest: string, challengeId: string, timedOutAt: Date) {
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${phoneDigest}`}, 0))`);
      await transaction.update(phoneOtpIntents).set({
        dispatchLeaseUntil: new Date(timedOutAt.getTime() + PHONE_OTP_TTL_MS),
        expiresAt: new Date(timedOutAt.getTime() + PHONE_OTP_TTL_MS),
        status: 'quarantined',
      }).where(and(
        eq(phoneOtpIntents.id, challengeId),
        eq(phoneOtpIntents.status, 'dispatching'),
      ));
    });
  }

  private async sendWithHardTimeout(send: () => Promise<{ error: { code?: string } | null }>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settlement = Promise.resolve().then(send).then(
      ({ error }) => error
        ? { code: error.code?.toLowerCase(), kind: 'provider_error' as const }
        : { kind: 'sent' as const },
      () => ({ code: undefined, kind: 'provider_error' as const }),
    );
    const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), PHONE_OTP_PROVIDER_TIMEOUT_MS);
    });
    try {
      const first = await Promise.race([
        settlement.then((outcome) => ({ kind: 'settled' as const, outcome })),
        timeout,
      ]);
      return { first, settlement };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async finalizeDispatch(
    phoneDigest: string,
    challengeId: string,
    completedAt: Date,
    providerFailed: boolean,
    providerErrorCode: string | undefined,
  ) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${phoneDigest}`}, 0))`);
      const [reserved] = await transaction.select({
        createdAt: phoneOtpIntents.createdAt,
        dispatchSequence: phoneOtpIntents.dispatchSequence,
        purpose: phoneOtpIntents.purpose,
        status: phoneOtpIntents.status,
      }).from(phoneOtpIntents).where(eq(phoneOtpIntents.id, challengeId)).limit(1).for('update');
      if (!reserved || !['dispatching', 'quarantined'].includes(reserved.status)) {
        return { kind: 'superseded' as const };
      }
      const [newer] = await transaction.select({ id: phoneOtpIntents.id })
        .from(phoneOtpIntents).where(and(
          eq(phoneOtpIntents.phoneDigest, phoneDigest),
          eq(phoneOtpIntents.status, 'queued'),
          gt(phoneOtpIntents.dispatchSequence, reserved.dispatchSequence),
        )).orderBy(asc(phoneOtpIntents.dispatchSequence)).limit(1).for('update');
      if (newer) {
        await transaction.update(phoneOtpIntents).set({
          consumedAt: completedAt,
          dispatchLeaseUntil: null,
          providerCompletedAt: completedAt,
          status: 'superseded',
        }).where(eq(phoneOtpIntents.id, challengeId));
        return { kind: 'superseded' as const };
      }
      if (providerFailed) {
        const [delivery] = await transaction.select({
          status: smsDeliveryAttempts.status,
          submissionStartedAt: smsDeliveryAttempts.submissionStartedAt,
        }).from(smsDeliveryAttempts)
          .where(eq(smsDeliveryAttempts.otpIntentId, challengeId))
          .limit(1)
          .for('update');
        const exactPreSubmissionRejection = delivery?.status === 'rejected'
          && !delivery.submissionStartedAt;
        if (
          (delivery && !exactPreSubmissionRejection)
          || (!delivery && !this.isDefinitivePreHookRejection(providerErrorCode))
        ) {
          // A generic outer failure cannot prove that the hook will never
          // arrive. Never release this phone to a newer generation: because
          // the upstream hook carries no business challenge id, a late first
          // callback could otherwise bind itself to that newer generation.
          await transaction.update(phoneOtpIntents).set({
            providerCompletedAt: completedAt,
            status: 'quarantined',
          }).where(eq(phoneOtpIntents.id, challengeId));
          return { code: providerErrorCode, kind: 'provider_error' as const };
        } else if (reserved.purpose === 'password_recovery') {
          // A pre-hook rejection (including an unknown phone) still gets a
          // real, rate-limited challenge row. Its uniform fake digest follows
          // the same attempt path as a delivered challenge but can never be
          // submitted to Supabase because providerRejected is checked below.
          const responseEpoch = reserved.createdAt.getTime() + RECOVERY_RESPONSE_FLOOR_MS;
          await transaction.update(phoneOtpIntents).set({
            dispatchLeaseUntil: null,
            expiresAt: new Date(responseEpoch + PHONE_OTP_TTL_MS),
            otpNotBefore: new Date(Math.floor(completedAt.getTime() / 1_000) * 1_000),
            otpTokenDigest: this.otpTokenDigest(challengeId, randomUUID()),
            providerCompletedAt: completedAt,
            providerRejected: true,
            status: 'ready',
          }).where(eq(phoneOtpIntents.id, challengeId));
          return { code: providerErrorCode, kind: 'provider_error' as const };
        } else {
          await transaction.update(phoneOtpIntents).set({
            dispatchLeaseUntil: null,
            providerCompletedAt: completedAt,
            status: 'failed',
          }).where(eq(phoneOtpIntents.id, challengeId));
          return { code: providerErrorCode, kind: 'provider_error' as const };
        }
      }
      const expiryAnchor = reserved.purpose === 'password_recovery'
        ? reserved.createdAt.getTime() + RECOVERY_RESPONSE_FLOOR_MS
        : completedAt.getTime();
      await transaction.update(phoneOtpIntents).set({
        dispatchLeaseUntil: null,
        expiresAt: new Date(expiryAnchor + PHONE_OTP_TTL_MS),
        otpNotBefore: new Date(Math.floor(completedAt.getTime() / 1_000) * 1_000),
        providerCompletedAt: completedAt,
        providerRejected: false,
        status: 'ready',
      }).where(eq(phoneOtpIntents.id, challengeId));
      return { kind: 'sent' as const };
    });
  }

  private async verifyChallenge(
    challengeId: string,
    phone: string,
    token: string,
    purpose: PhoneOtpPurpose,
    sourceIp: string,
    expectedAccountId?: string,
    expectedAuthUserId?: string,
  ): Promise<SocialAuthSessionResponse> {
    const now = new Date();
    const verificationToken = randomUUID();
    // Reserve and persist the attempt before contacting the OTP supplier. The
    // supplier call must not live in the database transaction: throwing after
    // an invalid code would otherwise roll back both the attempt counter and
    // the terminal `failed` state, allowing an unlimited number of guesses.
    const reserved = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-verify:${challengeId}`}, 0))`);
      const accountCondition = purpose === 'login' || purpose === 'password_recovery'
        ? isNull(phoneOtpIntents.accountId)
        : expectedAccountId
          ? eq(phoneOtpIntents.accountId, expectedAccountId)
          : sql`false`;
      const [intent] = await transaction.select({
        attemptCount: phoneOtpIntents.attemptCount,
        expiresAt: phoneOtpIntents.expiresAt,
        id: phoneOtpIntents.id,
        otpNotBefore: phoneOtpIntents.otpNotBefore,
        otpTokenDigest: phoneOtpIntents.otpTokenDigest,
        providerRejected: phoneOtpIntents.providerRejected,
        status: phoneOtpIntents.status,
        verificationToken: phoneOtpIntents.verificationToken,
      }).from(phoneOtpIntents).where(and(
        eq(phoneOtpIntents.id, challengeId),
        eq(phoneOtpIntents.phoneDigest, this.phoneDigest(phone)),
        eq(phoneOtpIntents.purpose, purpose),
        accountCondition,
      )).limit(1).for('update');
      if (
        !intent
        || intent.status !== 'ready'
        || intent.expiresAt <= now
        || intent.attemptCount >= PHONE_OTP_MAX_ATTEMPTS
        || !intent.otpTokenDigest
        || !/^[a-f0-9]{64}$/u.test(intent.otpTokenDigest)
        || intent.verificationToken
      ) throw new ForbiddenException('invalid_phone_otp');

      const submittedDigest = this.otpTokenDigest(intent.id, token);
      const digestMatched = timingSafeEqual(
        Buffer.from(intent.otpTokenDigest, 'hex'),
        Buffer.from(submittedDigest, 'hex'),
      );

      const shouldVerify = digestMatched && !intent.providerRejected;
      const [updated] = await transaction.update(phoneOtpIntents).set({
        attemptCount: intent.attemptCount + 1,
        lastAttemptAt: now,
        status: !shouldVerify && intent.attemptCount + 1 >= PHONE_OTP_MAX_ATTEMPTS
          ? 'failed'
          : shouldVerify
            ? 'verifying'
            : 'ready',
        verificationToken: shouldVerify ? verificationToken : null,
      }).where(and(
        eq(phoneOtpIntents.id, intent.id),
        eq(phoneOtpIntents.status, 'ready'),
        isNull(phoneOtpIntents.verificationToken),
      )).returning({ id: phoneOtpIntents.id });
      if (!updated) throw new ForbiddenException('invalid_phone_otp');
      return {
        digestMatched: shouldVerify,
        id: intent.id,
        otpNotBefore: intent.otpNotBefore,
        verificationToken,
      };
    });
    if (!reserved.digestMatched) throw new ForbiddenException('invalid_phone_otp');

    const provider = await this.verifyWithHardTimeout(
      () => this.client(sourceIp).auth.verifyOtp({ phone, token, type: 'sms' }),
    );
    if (provider.first.kind === 'timeout') {
      // Verification is state-changing at the provider: a timeout may mean the
      // OTP was consumed and its session response was merely delayed. Keep the
      // exact fence fail-closed and settle only when this same call resolves.
      void provider.settlement.then(async (lateOutcome) => {
        if (lateOutcome.kind !== 'response') return;
        await this.finalizeVerification(
          reserved.id,
          reserved.verificationToken,
          phone,
          reserved.otpNotBefore,
          expectedAuthUserId,
          lateOutcome.value,
        );
      }).catch(() => this.logger.error('phone_otp_late_verification_settlement_failed'));
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    if (provider.first.outcome.kind !== 'response') {
      // A transport failure cannot prove whether the provider consumed the
      // OTP. Preserve `verifying` forever rather than permit a second call.
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    const providerResponse = provider.first.outcome.value;
    const { data, error } = providerResponse;
    if (
      error
      || !data.session
      || normalizeChinaMobile(data.user?.phone ?? '') !== phone
      || (expectedAuthUserId && data.user?.id !== expectedAuthUserId)
    ) {
      await this.finalizeVerification(
        reserved.id,
        reserved.verificationToken,
        phone,
        reserved.otpNotBefore,
        expectedAuthUserId,
        providerResponse,
      );
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
    if (Number.isFinite(otpTimestamp) && otpTimestamp * 1_000 + 1_000 < reserved.otpNotBefore.getTime()) {
      await this.failVerification(reserved.id, reserved.verificationToken);
      throw new ForbiddenException('invalid_phone_otp');
    }

    const consumed = await this.consumeVerification(
      reserved.id,
      reserved.verificationToken,
      data.user!.id,
    );
    if (!consumed) throw new ForbiddenException('invalid_phone_otp');
    return {
      accessToken: data.session.access_token,
      expiresAt: data.session.expires_at,
      refreshToken: data.session.refresh_token,
    };
  }

  private async verifyWithHardTimeout<T>(verify: () => Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settlement = Promise.resolve().then(verify).then(
      (value) => ({ kind: 'response' as const, value }),
      () => ({ kind: 'transport_error' as const }),
    );
    const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), PHONE_OTP_PROVIDER_TIMEOUT_MS);
    });
    try {
      const first = await Promise.race([
        settlement.then((outcome) => ({ kind: 'settled' as const, outcome })),
        timeout,
      ]);
      return { first, settlement };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async finalizeVerification(
    challengeId: string,
    verificationToken: string,
    phone: string,
    otpNotBefore: Date,
    expectedAuthUserId: string | undefined,
    response: Awaited<ReturnType<SupabaseClient['auth']['verifyOtp']>>,
  ) {
    const { data, error } = response;
    const otpTimestamp = Math.max(...((data.session as unknown as { user?: { amr?: Array<{ method?: string; timestamp?: number }> } } | null)?.user?.amr ?? [])
      .filter((entry) => entry.method === 'otp' && typeof entry.timestamp === 'number')
      .map((entry) => entry.timestamp!), Number.NEGATIVE_INFINITY);
    const valid = !error
      && Boolean(data.session)
      && normalizeChinaMobile(data.user?.phone ?? '') === phone
      && (!expectedAuthUserId || data.user?.id === expectedAuthUserId)
      && (!Number.isFinite(otpTimestamp) || otpTimestamp * 1_000 + 1_000 >= otpNotBefore.getTime());
    return valid
      ? this.consumeVerification(challengeId, verificationToken, data.user!.id)
      : this.failVerification(challengeId, verificationToken);
  }

  private async consumeVerification(
    challengeId: string,
    verificationToken: string,
    verifiedAuthUserId: string,
  ) {
    const [updated] = await this.database.db.update(phoneOtpIntents).set({
      consumedAt: new Date(),
      status: 'consumed',
      verificationToken: null,
      verifiedAuthUserId,
    }).where(and(
      eq(phoneOtpIntents.id, challengeId),
      eq(phoneOtpIntents.status, 'verifying'),
      eq(phoneOtpIntents.verificationToken, verificationToken),
    )).returning({ id: phoneOtpIntents.id });
    return Boolean(updated);
  }

  private async failVerification(challengeId: string, verificationToken: string) {
    const [updated] = await this.database.db.update(phoneOtpIntents).set({
      status: 'failed',
      verificationToken: null,
    }).where(and(
      eq(phoneOtpIntents.id, challengeId),
      eq(phoneOtpIntents.status, 'verifying'),
      eq(phoneOtpIntents.verificationToken, verificationToken),
    )).returning({ id: phoneOtpIntents.id });
    return Boolean(updated);
  }

  private otpTokenDigest(challengeId: string, token: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update('phone-otp-token-v1\0')
      .update(challengeId)
      .update('\0')
      .update(token)
      .digest('hex');
  }
}
