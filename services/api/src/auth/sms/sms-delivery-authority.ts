import { createHmac, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig, DISABLED_SMS_CONFIG } from '../../config';
import { phoneOtpIntents, smsDeliveryAttempts, smsUsageCounters } from '../../database/schema';
import { DatabaseService } from '../../database/database.service';
import type { SmsSubmission } from './aliyun-sms.provider';

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DELIVERY_LEASE_MS = 2 * 60 * 1_000;
const DELIVERY_DEDUPE_TTL_MS = 10 * 60 * 1_000;

type UsageRule = {
  expiresAt: Date;
  limit: number;
  scopeKey: string;
};

export type SmsDeliveryClaim = {
  otpDispatchSequence: number;
  otpIntentId: string;
  leaseToken: string;
  outcome: 'claimed';
  rules: UsageRule[];
} | {
  otpDispatchSequence: number;
  otpIntentId: string;
  leaseToken: string;
  outcome: 'reconcile_required';
  submissionStartedAt: Date;
} | {
  outcome: 'local_rate_limited';
} | {
  outcome: 'duplicate_completed';
} | {
  outcome: 'duplicate_inflight';
} | {
  outcome: 'unauthorized_generation';
};

function chinaTimeBuckets(now: number) {
  const shifted = new Date(now + CHINA_TIME_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    day: { key: dayKey, expiresAt: Date.UTC(year, month, day + 1) - CHINA_TIME_OFFSET_MS },
    hour: {
      key: `${dayKey}T${String(hour).padStart(2, '0')}`,
      expiresAt: Date.UTC(year, month, day, hour + 1) - CHINA_TIME_OFFSET_MS,
    },
    month: { key: dayKey.slice(0, 7), expiresAt: Date.UTC(year, month + 1, 1) - CHINA_TIME_OFFSET_MS },
  };
}

@Injectable()
export class SmsDeliveryAuthority {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
  ) {}

  async claim(dedupeKey: string, phone: string, now = new Date()): Promise<SmsDeliveryClaim> {
    const leaseToken = randomUUID();
    const rules = this.usageRules(phone, now.getTime());
    const phoneDigest = createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`phone-otp-intent-v1\0${phone}`)
      .digest('hex');
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${phoneDigest}`}, 0))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [activeIntent] = await transaction.select({
        dispatchSequence: phoneOtpIntents.dispatchSequence,
        id: phoneOtpIntents.id,
        status: phoneOtpIntents.status,
      }).from(phoneOtpIntents).where(and(
        eq(phoneOtpIntents.phoneDigest, phoneDigest),
        inArray(phoneOtpIntents.status, ['dispatching', 'quarantined']),
        gt(phoneOtpIntents.dispatchLeaseUntil, now),
      )).limit(1).for('update');
      if (!activeIntent) return { outcome: 'unauthorized_generation' };

      const [existing] = await transaction.select().from(smsDeliveryAttempts)
        .where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey)).limit(1);
      if (existing && (
        existing.otpIntentId !== activeIntent.id
        || existing.otpDispatchSequence !== activeIntent.dispatchSequence
      )) return { outcome: 'unauthorized_generation' };
      // A hook that first arrives after the outer request was quarantined is
      // stale and must never reach Aliyun. A quarantined generation may only
      // re-enter through a delivery record proving that the exact hook had
      // already crossed the provider-submission fence.
      if (activeIntent.status === 'quarantined' && !existing?.submissionStartedAt) {
        return { outcome: 'unauthorized_generation' };
      }
      if (existing && existing.expiresAt > now && existing.status === 'completed_v2') {
        return { outcome: 'duplicate_completed' };
      }
      if (existing && existing.status === 'processing_v2' && existing.leaseUntil > now) {
        return { outcome: 'duplicate_inflight' };
      }
      if (existing?.submissionStartedAt) {
        await transaction.update(smsDeliveryAttempts).set({
          leaseToken,
          leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
          updatedAt: now,
        }).where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey));
        return {
          leaseToken,
          otpDispatchSequence: activeIntent.dispatchSequence,
          otpIntentId: activeIntent.id,
          outcome: 'reconcile_required',
          submissionStartedAt: existing.submissionStartedAt,
        };
      }

      for (const rule of [...rules].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey))) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-usage:${rule.scopeKey}`}, 0))`);
      }
      const counters = await transaction.select().from(smsUsageCounters)
        .where(inArray(smsUsageCounters.scopeKey, rules.map(({ scopeKey }) => scopeKey)));
      const rateLimited = rules.some((rule) => {
        const counter = counters.find(({ scopeKey }) => scopeKey === rule.scopeKey);
        return counter && counter.expiresAt > now && counter.count >= rule.limit;
      });
      if (rateLimited) {
        const rejectedValues = {
          attemptCount: existing ? existing.attemptCount + 1 : 1,
          completedAt: null,
          expiresAt: new Date(now.getTime() + DELIVERY_DEDUPE_TTL_MS),
          lastErrorCode: 'sms_rate_limited',
          leaseToken,
          leaseUntil: now,
          otpDispatchSequence: activeIntent.dispatchSequence,
          otpIntentId: activeIntent.id,
          phoneDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
            .update(`sms-phone-v1\0${phone}`)
            .digest('hex'),
          providerBizId: null,
          providerOutId: dedupeKey,
          providerRequestId: null,
          status: 'rejected_v2',
          submissionStartedAt: null,
          updatedAt: now,
        } as const;
        if (existing) {
          await transaction.update(smsDeliveryAttempts).set(rejectedValues)
            .where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey));
        } else {
          await transaction.insert(smsDeliveryAttempts).values({
            ...rejectedValues,
            createdAt: now,
            dedupeKey,
          });
        }
        // Return instead of throwing so the exact pre-submission rejection is
        // durably visible to the outer OTP dispatch settlement transaction.
        return { outcome: 'local_rate_limited' };
      }

      for (const rule of rules) {
        await transaction.insert(smsUsageCounters).values({
          count: 1,
          expiresAt: rule.expiresAt,
          scopeKey: rule.scopeKey,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: smsUsageCounters.scopeKey,
          set: {
            count: sql`case
              when ${smsUsageCounters.expiresAt} <= ${now.toISOString()}::timestamptz then 1
              else ${smsUsageCounters.count} + 1
            end`,
            expiresAt: rule.expiresAt,
            updatedAt: now,
          },
        });
      }
      const values = {
        attemptCount: existing ? existing.attemptCount + 1 : 1,
        completedAt: null,
        expiresAt: new Date(now.getTime() + DELIVERY_DEDUPE_TTL_MS),
        lastErrorCode: null,
        leaseToken,
        leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
        otpDispatchSequence: activeIntent.dispatchSequence,
        otpIntentId: activeIntent.id,
        phoneDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
          .update(`sms-phone-v1\0${phone}`)
          .digest('hex'),
        providerBizId: null,
        providerOutId: dedupeKey,
        providerRequestId: null,
        status: 'processing_v2',
        submissionStartedAt: null,
        updatedAt: now,
      } as const;
      if (existing) {
        await transaction.update(smsDeliveryAttempts).set(values)
          .where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey));
      } else {
        await transaction.insert(smsDeliveryAttempts).values({
          ...values,
          createdAt: now,
          dedupeKey,
        });
      }
      return {
        leaseToken,
        otpDispatchSequence: activeIntent.dispatchSequence,
        otpIntentId: activeIntent.id,
        outcome: 'claimed',
        rules,
      };
    });
  }

  async authorizeSubmission(
    dedupeKey: string,
    leaseToken: string,
    otpIntentId: string,
    otpTokenDigest: string,
    now = new Date(),
  ) {
    return this.database.db.transaction(async (transaction) => {
      const [binding] = await transaction.select({ phoneDigest: phoneOtpIntents.phoneDigest })
        .from(phoneOtpIntents).where(eq(phoneOtpIntents.id, otpIntentId)).limit(1);
      if (!binding) return false;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${binding.phoneDigest}`}, 0))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [intent] = await transaction.select({ id: phoneOtpIntents.id })
        .from(phoneOtpIntents).where(and(
          eq(phoneOtpIntents.id, otpIntentId),
          eq(phoneOtpIntents.status, 'dispatching'),
          gt(phoneOtpIntents.dispatchLeaseUntil, now),
      )).limit(1).for('update');
      if (!intent) return false;
      const [attempt] = await transaction.select({ dedupeKey: smsDeliveryAttempts.dedupeKey })
        .from(smsDeliveryAttempts).where(and(
          eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
          eq(smsDeliveryAttempts.leaseToken, leaseToken),
          eq(smsDeliveryAttempts.otpIntentId, otpIntentId),
          eq(smsDeliveryAttempts.status, 'processing_v2'),
          gt(smsDeliveryAttempts.leaseUntil, now),
        )).limit(1).for('update');
      if (!attempt) return false;
      const [boundIntent] = await transaction.update(phoneOtpIntents).set({
        otpTokenDigest,
      }).where(and(
        eq(phoneOtpIntents.id, otpIntentId),
        eq(phoneOtpIntents.status, 'dispatching'),
        gt(phoneOtpIntents.dispatchLeaseUntil, now),
      )).returning({ id: phoneOtpIntents.id });
      if (!boundIntent) return false;
      await transaction.update(smsDeliveryAttempts).set({
        submissionStartedAt: now,
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.otpIntentId, otpIntentId),
        eq(smsDeliveryAttempts.status, 'processing_v2'),
        gt(smsDeliveryAttempts.leaseUntil, now),
      ));
      return { submissionStartedAt: now };
    });
  }

  async complete(dedupeKey: string, leaseToken: string, submission: SmsSubmission, now = new Date()) {
    return this.database.db.transaction(async (transaction) => {
      const [attempt] = await transaction.select({
        otpIntentId: smsDeliveryAttempts.otpIntentId,
        submissionStartedAt: smsDeliveryAttempts.submissionStartedAt,
      })
        .from(smsDeliveryAttempts).where(and(
          eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
          eq(smsDeliveryAttempts.leaseToken, leaseToken),
          eq(smsDeliveryAttempts.status, 'processing_v2'),
        )).limit(1);
      if (!attempt?.otpIntentId || !attempt.submissionStartedAt) return false;
      const [binding] = await transaction.select({ phoneDigest: phoneOtpIntents.phoneDigest })
        .from(phoneOtpIntents).where(eq(phoneOtpIntents.id, attempt.otpIntentId)).limit(1);
      if (!binding) return false;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`phone-otp-dispatch:${binding.phoneDigest}`}, 0))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [intent] = await transaction.select({
        id: phoneOtpIntents.id,
        otpTokenDigest: phoneOtpIntents.otpTokenDigest,
      })
        .from(phoneOtpIntents).where(and(
          eq(phoneOtpIntents.id, attempt.otpIntentId),
          inArray(phoneOtpIntents.status, ['dispatching', 'quarantined']),
        )).limit(1).for('update');
      if (!intent?.otpTokenDigest) return false;
      const [completed] = await transaction.update(smsDeliveryAttempts).set({
        completedAt: now,
        expiresAt: new Date(now.getTime() + DELIVERY_DEDUPE_TTL_MS),
        lastErrorCode: null,
        leaseUntil: now,
        providerBizId: submission.bizId ?? null,
        providerRequestId: submission.requestId ?? null,
        status: 'completed_v2',
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.status, 'processing_v2'),
        gt(smsDeliveryAttempts.leaseUntil, now),
      )).returning({ dedupeKey: smsDeliveryAttempts.dedupeKey });
      return Boolean(completed);
    });
  }

  async fail(dedupeKey: string, leaseToken: string, _rules: UsageRule[], now = new Date()) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [owned] = await transaction.select({ dedupeKey: smsDeliveryAttempts.dedupeKey })
        .from(smsDeliveryAttempts)
        .where(and(
          eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
          eq(smsDeliveryAttempts.leaseToken, leaseToken),
          eq(smsDeliveryAttempts.status, 'processing_v2'),
        )).limit(1);
      if (!owned) return false;
      const [failed] = await transaction.update(smsDeliveryAttempts).set({
        lastErrorCode: 'sms_delivery_failed',
        leaseUntil: now,
        status: 'retryable_v2',
        submissionStartedAt: null,
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.status, 'processing_v2'),
      )).returning({ dedupeKey: smsDeliveryAttempts.dedupeKey });
      return Boolean(failed);
    });
  }

  async rejectBeforeAcceptance(dedupeKey: string, leaseToken: string, now = new Date()) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [rejected] = await transaction.update(smsDeliveryAttempts).set({
        lastErrorCode: 'sms_provider_rejected',
        leaseUntil: now,
        status: 'rejected_v2',
        // A synchronous provider rejection proves that Aliyun did not accept
        // the request. Clear the pre-call marker so outer settlement can
        // distinguish this result from transport-ambiguous submission.
        submissionStartedAt: null,
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.status, 'processing_v2'),
      )).returning({ dedupeKey: smsDeliveryAttempts.dedupeKey });
      return Boolean(rejected);
    });
  }

  async markAmbiguous(dedupeKey: string, leaseToken: string, now = new Date()) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [marked] = await transaction.update(smsDeliveryAttempts).set({
        lastErrorCode: 'sms_delivery_ambiguous',
        // No clock may turn this into a resendable attempt. The processing
        // state plus submissionStartedAt is a durable reconciliation fence;
        // claim() can only query the provider and can never resubmit it.
        leaseUntil: now,
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.status, 'processing_v2'),
      )).returning({ dedupeKey: smsDeliveryAttempts.dedupeKey });
      return Boolean(marked);
    });
  }

  private usageRules(phone: string, now: number): UsageRule[] {
    const limits = this.config.sms ?? DISABLED_SMS_CONFIG;
    const time = chinaTimeBuckets(now);
    const phoneHash = createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`sms-usage-phone-v1\0${phone}`)
      .digest('hex');
    return [
      { scopeKey: `total:day:${time.day.key}`, limit: limits.dailyLimit, expiresAt: new Date(time.day.expiresAt) },
      { scopeKey: `total:month:${time.month.key}`, limit: limits.monthlyLimit, expiresAt: new Date(time.month.expiresAt) },
      { scopeKey: `phone:${phoneHash}:hour:${time.hour.key}`, limit: limits.phoneHourlyLimit, expiresAt: new Date(time.hour.expiresAt) },
      { scopeKey: `phone:${phoneHash}:day:${time.day.key}`, limit: limits.phoneDailyLimit, expiresAt: new Date(time.day.expiresAt) },
    ];
  }
}
