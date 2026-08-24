import { createHmac } from 'node:crypto';

import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import type { RecentAuthGrantResponse, RecentAuthMethod, RecentAuthPurpose } from '@icao/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { API_CONFIG, type ApiConfig } from '../config';
import { recentAuthChallenges, recentAuthGrants } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';
import { PhoneAuthService } from './phone-auth.service';
import {
  RECENT_AUTH_PASSWORD_VERIFIER,
  type RecentAuthPasswordVerifier,
} from './recent-auth-password.verifier';

const RECENT_AUTH_GRANT_TTL_MS = 5 * 60 * 1_000;

export type RecentAuthTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

@Injectable()
export class RecentAuthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    @Inject(RECENT_AUTH_PASSWORD_VERIFIER)
    private readonly passwordVerifier: RecentAuthPasswordVerifier,
    @Optional() private readonly phoneAuth?: PhoneAuthService,
  ) {}

  async issuePasswordGrant(
    source: VerifiedAuthSession,
    purpose: 'account_delete',
    password: string,
  ) {
    await this.passwordVerifier.verify(source, password);
    return this.issueVerifiedGrant(source, 'password', purpose);
  }

  async issuePhoneOtpGrant(
    source: VerifiedAuthSession,
    purpose: RecentAuthPurpose,
    now = new Date(),
  ) {
    const phoneAuth = this.phoneAuth;
    if (!phoneAuth) throw new UnauthorizedException('phone_reauthentication_required');
    return this.database.db.transaction(async (transaction) => {
      await phoneAuth.consumeOtpIntentInTransaction(transaction, source, purpose, now);
      return this.issueVerifiedGrantInTransaction(transaction, source, 'phone_otp', purpose, now);
    });
  }

  async issueVerifiedGrant(
    source: VerifiedAuthSession,
    method: RecentAuthMethod,
    purpose: RecentAuthPurpose,
    now = new Date(),
  ): Promise<RecentAuthGrantResponse> {
    const expiresAt = new Date(now.getTime() + RECENT_AUTH_GRANT_TTL_MS);
    return this.database.db.transaction((transaction) => (
      this.issueVerifiedGrantInTransaction(transaction, source, method, purpose, now, expiresAt)
    ));
  }

  private async issueVerifiedGrantInTransaction(
    transaction: RecentAuthTransaction,
    source: VerifiedAuthSession,
    method: RecentAuthMethod,
    purpose: RecentAuthPurpose,
    now: Date,
    expiresAt = new Date(now.getTime() + RECENT_AUTH_GRANT_TTL_MS),
  ): Promise<RecentAuthGrantResponse> {
    const targetDigest = this.targetDigest(source.user.id, purpose);
    const [challenge] = await transaction.insert(recentAuthChallenges).values({
      accountId: source.user.id,
      authUserId: source.authUserId,
      sessionId: source.sessionId,
      method,
      purpose,
      targetDigest,
      status: 'verified',
      expiresAt,
      verifiedAt: now,
      createdAt: now,
    }).returning({ id: recentAuthChallenges.id });
    if (!challenge) throw new Error('recent_auth_challenge_not_created');

    const [grant] = await transaction.insert(recentAuthGrants).values({
      challengeId: challenge.id,
      accountId: source.user.id,
      authUserId: source.authUserId,
      sessionId: source.sessionId,
      method,
      purpose,
      targetDigest,
      expiresAt,
      createdAt: now,
    }).returning({ id: recentAuthGrants.id });
    if (!grant) throw new Error('recent_auth_grant_not_created');
    return {
      expiresAt: expiresAt.getTime(),
      grantId: grant.id,
      method,
      purpose,
    };
  }

  consume(
    source: VerifiedAuthSession,
    grantId: string,
    purpose: RecentAuthPurpose,
    now = new Date(),
  ) {
    return this.database.db.transaction((transaction) => (
      this.consumeInTransaction(transaction, source, grantId, purpose, now)
    ));
  }

  async consumeInTransaction(
    transaction: RecentAuthTransaction,
    source: VerifiedAuthSession,
    grantId: string,
    purpose: RecentAuthPurpose,
    now = new Date(),
  ) {
    const targetDigest = this.targetDigest(source.user.id, purpose);
    const [consumed] = await transaction.update(recentAuthGrants)
      .set({ consumedAt: now })
      .where(and(
        eq(recentAuthGrants.id, grantId),
        eq(recentAuthGrants.accountId, source.user.id),
        eq(recentAuthGrants.authUserId, source.authUserId),
        eq(recentAuthGrants.sessionId, source.sessionId),
        eq(recentAuthGrants.purpose, purpose),
        eq(recentAuthGrants.targetDigest, targetDigest),
        gt(recentAuthGrants.expiresAt, now),
        isNull(recentAuthGrants.consumedAt),
      ))
      .returning({ challengeId: recentAuthGrants.challengeId });
    if (!consumed) throw new UnauthorizedException('recent_auth_required');

    const [challenge] = await transaction.update(recentAuthChallenges)
      .set({ consumedAt: now, status: 'consumed' })
      .where(and(
        eq(recentAuthChallenges.id, consumed.challengeId),
        eq(recentAuthChallenges.status, 'verified'),
        isNull(recentAuthChallenges.consumedAt),
      ))
      .returning({ id: recentAuthChallenges.id });
    if (!challenge) throw new UnauthorizedException('recent_auth_required');
  }

  private targetDigest(accountId: string, purpose: RecentAuthPurpose) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`recent-auth-target-v1\0${accountId}\0${purpose}`)
      .digest('hex');
  }
}
