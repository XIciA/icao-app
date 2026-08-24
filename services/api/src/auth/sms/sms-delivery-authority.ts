import { createHmac, randomUUID } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig, DISABLED_SMS_CONFIG } from '../../config';
import { smsDeliveryAttempts, smsUsageCounters } from '../../database/schema';
import { DatabaseService } from '../../database/database.service';

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DELIVERY_LEASE_MS = 2 * 60 * 1_000;
const DELIVERY_DEDUPE_TTL_MS = 10 * 60 * 1_000;

type UsageRule = {
  expiresAt: Date;
  limit: number;
  scopeKey: string;
};

export type SmsDeliveryClaim = {
  leaseToken: string;
  outcome: 'claimed';
  rules: UsageRule[];
} | {
  outcome: 'duplicate';
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
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [existing] = await transaction.select().from(smsDeliveryAttempts)
        .where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey)).limit(1);
      if (
        existing
        && existing.expiresAt > now
        && (
          existing.status === 'completed'
          || (existing.status === 'processing' && existing.leaseUntil > now)
        )
      ) return { outcome: 'duplicate' };

      for (const rule of [...rules].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey))) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-usage:${rule.scopeKey}`}, 0))`);
      }
      const counters = await transaction.select().from(smsUsageCounters)
        .where(inArray(smsUsageCounters.scopeKey, rules.map(({ scopeKey }) => scopeKey)));
      if (rules.some((rule) => {
        const counter = counters.find(({ scopeKey }) => scopeKey === rule.scopeKey);
        return counter && counter.expiresAt > now && counter.count >= rule.limit;
      })) throw new HttpException('sms_rate_limited', HttpStatus.TOO_MANY_REQUESTS);

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
        phoneDigest: createHmac('sha256', this.config.accountIdentityHashSecret)
          .update(`sms-phone-v1\0${phone}`)
          .digest('hex'),
        status: 'processing',
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
      return { leaseToken, outcome: 'claimed', rules };
    });
  }

  async complete(dedupeKey: string, leaseToken: string, now = new Date()) {
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      await transaction.update(smsDeliveryAttempts).set({
        completedAt: now,
        expiresAt: new Date(now.getTime() + DELIVERY_DEDUPE_TTL_MS),
        lastErrorCode: null,
        leaseUntil: now,
        status: 'completed',
        updatedAt: now,
      }).where(and(
        eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
        eq(smsDeliveryAttempts.leaseToken, leaseToken),
        eq(smsDeliveryAttempts.status, 'processing'),
      ));
    });
  }

  async fail(dedupeKey: string, leaseToken: string, rules: UsageRule[], now = new Date()) {
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-delivery:${dedupeKey}`}, 0))`);
      const [owned] = await transaction.select({ dedupeKey: smsDeliveryAttempts.dedupeKey })
        .from(smsDeliveryAttempts)
        .where(and(
          eq(smsDeliveryAttempts.dedupeKey, dedupeKey),
          eq(smsDeliveryAttempts.leaseToken, leaseToken),
          eq(smsDeliveryAttempts.status, 'processing'),
        )).limit(1);
      if (!owned) return;
      for (const rule of [...rules].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey))) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sms-usage:${rule.scopeKey}`}, 0))`);
      }
      const counters = await transaction.select().from(smsUsageCounters)
        .where(inArray(smsUsageCounters.scopeKey, rules.map(({ scopeKey }) => scopeKey)));
      for (const counter of counters) {
        if (counter.count <= 1) {
          await transaction.delete(smsUsageCounters).where(eq(smsUsageCounters.scopeKey, counter.scopeKey));
        } else {
          await transaction.update(smsUsageCounters).set({
            count: counter.count - 1,
            updatedAt: now,
          }).where(eq(smsUsageCounters.scopeKey, counter.scopeKey));
        }
      }
      await transaction.update(smsDeliveryAttempts).set({
        lastErrorCode: 'sms_delivery_failed',
        leaseUntil: now,
        status: 'retryable',
        updatedAt: now,
      }).where(eq(smsDeliveryAttempts.dedupeKey, dedupeKey));
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
