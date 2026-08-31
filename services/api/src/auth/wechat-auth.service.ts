import { createHmac, randomBytes } from 'node:crypto';

import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CompleteWechatAuthRequest, CompleteWechatAuthResponse, StartWechatAuthResponse } from '@icao/contracts';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { and, eq, gt, sql } from 'drizzle-orm';

import { AccountIdentityService } from '../account/account-identity.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { authUsageCounters, wechatAuthChallenges, wechatAuthPrincipals } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';
import { WECHAT_AUTH_HTTP, type WechatAuthHttp } from './wechat-auth-http';

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const START_LIMIT_PER_HOUR = 30;
const COMPLETE_LIMIT_PER_HOUR = 60;
const MAX_CHALLENGE_ATTEMPTS = 5;

function jwtClaims(token: string) {
  try {
    const raw = token.split('.')[1];
    if (!raw) throw new Error('missing');
    const claims = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      amr?: Array<{ method?: string; provider?: string; timestamp?: number }>;
      iat?: number;
      session_id?: string;
    };
    if (typeof claims.iat !== 'number' || typeof claims.session_id !== 'string') throw new Error('invalid');
    return claims;
  } catch {
    throw new ServiceUnavailableException('wechat_session_unavailable');
  }
}

@Injectable()
export class WechatAuthService {
  private readonly admin: SupabaseClient;
  private readonly publicClient: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(WECHAT_AUTH_HTTP) private readonly http: WechatAuthHttp,
    private readonly database: DatabaseService,
    private readonly identities: AccountIdentityService,
  ) {
    this.admin = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    this.publicClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async start(sourceIp: string): Promise<StartWechatAuthResponse> {
    await this.consumeRate(`wechat-start:${this.digest('ip', sourceIp)}`, START_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const issuedAt = Date.now();
    const state = randomBytes(32).toString('base64url');
    const [challenge] = await this.database.db.insert(wechatAuthChallenges).values({
      expiresAt: new Date(issuedAt + CHALLENGE_TTL_MS),
      stateDigest: this.digest('state', state),
    }).returning({ id: wechatAuthChallenges.id });
    if (!challenge) throw new ServiceUnavailableException('wechat_auth_unavailable');
    const configured = Boolean(
      this.config.wechatAppId
      && this.config.wechatAppSecret
      && this.config.wechatUniversalLink,
    );
    return {
      ...(configured ? { appId: this.config.wechatAppId } : {}),
      challengeId: challenge.id,
      expiresAt: issuedAt + CHALLENGE_TTL_MS,
      issuedAt,
      state,
      status: configured ? 'available' : 'configuration_pending',
    };
  }

  async complete(input: CompleteWechatAuthRequest, sourceIp: string): Promise<CompleteWechatAuthResponse> {
    if (!this.config.wechatAppId || !this.config.wechatAppSecret || !this.config.wechatUniversalLink) {
      throw new ServiceUnavailableException('wechat_auth_configuration_pending');
    }
    await this.consumeRate(`wechat-complete:${this.digest('ip', sourceIp)}`, COMPLETE_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const codeDigest = this.digest('code', input.code);
    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-challenge:${input.challengeId}`}, 0))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-code:${codeDigest}`}, 0))`);
      const [challenge] = await transaction.select({
        attemptCount: wechatAuthChallenges.attemptCount,
        id: wechatAuthChallenges.id,
        stateDigest: wechatAuthChallenges.stateDigest,
        status: wechatAuthChallenges.status,
      }).from(wechatAuthChallenges).where(and(
        eq(wechatAuthChallenges.id, input.challengeId),
        gt(wechatAuthChallenges.expiresAt, now),
        eq(wechatAuthChallenges.status, 'pending'),
      )).limit(1).for('update');
      if (
        !challenge
        || challenge.stateDigest !== this.digest('state', input.state)
        || challenge.attemptCount >= MAX_CHALLENGE_ATTEMPTS
      ) throw new ForbiddenException('invalid_wechat_auth_response');
      const [replayed] = await transaction.select({ id: wechatAuthChallenges.id })
        .from(wechatAuthChallenges)
        .where(and(eq(wechatAuthChallenges.codeDigest, codeDigest), sql`${wechatAuthChallenges.id} <> ${challenge.id}::uuid`))
        .limit(1);
      if (replayed) throw new ForbiddenException('invalid_wechat_auth_response');
      await transaction.update(wechatAuthChallenges).set({
        attemptCount: challenge.attemptCount + 1,
        codeDigest,
        lastAttemptAt: now,
        status: 'verifying',
      }).where(eq(wechatAuthChallenges.id, challenge.id));
    });

    let tokenResponse;
    try {
      tokenResponse = await this.http.exchangeCode({
        appId: this.config.wechatAppId,
        appSecret: this.config.wechatAppSecret,
        code: input.code,
      });
    } catch {
      await this.resetTransientChallenge(input.challengeId, codeDigest);
      throw new ServiceUnavailableException('wechat_provider_unavailable');
    }
    if (
      tokenResponse.errcode
      || !tokenResponse.openid
      || !tokenResponse.access_token
    ) {
      await this.failChallenge(input.challengeId, codeDigest);
      throw new ForbiddenException('invalid_wechat_auth_response');
    }

    const stableSubject = tokenResponse.unionid
      ? `unionid:${tokenResponse.unionid}`
      : `openid:${this.config.wechatAppId}:${tokenResponse.openid}`;
    const subjectDigest = this.digest('subject', stableSubject);
    const authUser = await this.ensureAuthUser(subjectDigest);
    const session = await this.issueSession(authUser, subjectDigest);
    const verified = this.verifiedSession(session.access_token, session.user, subjectDigest);
    const account = await this.identities.resolve(verified);

    const [consumed] = await this.database.db.update(wechatAuthChallenges).set({
      consumedAt: new Date(),
      status: 'consumed',
      subjectDigest,
    }).where(and(
      eq(wechatAuthChallenges.id, input.challengeId),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.status, 'verifying'),
    )).returning({ id: wechatAuthChallenges.id });
    if (!consumed) {
      throw new ConflictException('wechat_auth_state_conflict');
    }
    return {
      account: {
        accountId: account.id,
        phone: account.phone,
        phoneBound: Boolean(account.phone),
        providers: account.providers ?? ['wechat'],
      },
      session: {
        accessToken: session.access_token,
        expiresAt: session.expires_at,
        refreshToken: session.refresh_token,
      },
    };
  }

  private async ensureAuthUser(subjectDigest: string): Promise<User> {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-principal:${subjectDigest}`}, 0))`);
      const [principal] = await transaction.select({ authUserId: wechatAuthPrincipals.authUserId })
        .from(wechatAuthPrincipals)
        .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest))
        .limit(1);
      if (principal) {
        const { data, error } = await this.admin.auth.admin.getUserById(principal.authUserId);
        if (data.user) {
          await transaction.update(wechatAuthPrincipals).set({ lastUsedAt: new Date() })
            .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest));
          return data.user;
        }
        if (error && error.status !== 404) {
          throw new ServiceUnavailableException('wechat_session_unavailable');
        }
        // A prior account deletion may already have removed the provider-specific auth user.
        // Drop the stale pointer under the same advisory lock and create a fresh principal below;
        // the separate lifetime-benefit digest still prevents another trial grant.
        await transaction.delete(wechatAuthPrincipals)
          .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest));
      }
      const privateEmail = `wx-${subjectDigest.slice(0, 40)}@wechat-auth.invalid`;
      const { data, error } = await this.admin.auth.admin.createUser({
        app_metadata: {
          icao_identity_provider: 'wechat',
          icao_wechat_subject: subjectDigest,
        },
        email: privateEmail,
        email_confirm: true,
      });
      if (error || !data.user) throw new ServiceUnavailableException('wechat_session_unavailable');
      try {
        await transaction.insert(wechatAuthPrincipals).values({
          authUserId: data.user.id,
          subjectDigest,
        });
      } catch (error) {
        await this.admin.auth.admin.deleteUser(data.user.id, false).catch(() => undefined);
        throw error;
      }
      return data.user;
    });
  }

  private async issueSession(user: User, subjectDigest: string) {
    if (!user.email) throw new ServiceUnavailableException('wechat_session_unavailable');
    const { data: linkData, error: linkError } = await this.admin.auth.admin.generateLink({
      email: user.email,
      options: {
        data: {
          login_surface: 'native_wechat',
        },
      },
      type: 'magiclink',
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new ServiceUnavailableException('wechat_session_unavailable');
    const { data, error } = await this.publicClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (error || !data.session || !data.user || data.user.id !== user.id) {
      throw new ServiceUnavailableException('wechat_session_unavailable');
    }
    const metadata = data.user.app_metadata;
    if (
      metadata?.icao_identity_provider !== 'wechat'
      || metadata?.icao_wechat_subject !== subjectDigest
    ) throw new ServiceUnavailableException('wechat_session_unavailable');
    return data.session;
  }

  private verifiedSession(
    accessToken: string,
    user: User,
    subjectDigest: string,
  ): VerifiedAuthSession {
    const claims = jwtClaims(accessToken);
    return {
      accessToken,
      authenticationMethods: (claims.amr ?? []).flatMap((entry) => (
        typeof entry.method === 'string' && typeof entry.timestamp === 'number'
          ? [{ method: entry.method, ...(entry.provider ? { provider: entry.provider } : {}), timestamp: entry.timestamp }]
          : []
      )),
      authUserId: user.id,
      identities: [{ provider: 'wechat', subject: subjectDigest }],
      issuedAt: claims.iat!,
      sessionId: claims.session_id!,
      user: { id: user.id, providers: ['wechat'] },
    };
  }

  private async resetTransientChallenge(challengeId: string, codeDigest: string) {
    await this.database.db.update(wechatAuthChallenges).set({ status: 'pending' }).where(and(
      eq(wechatAuthChallenges.id, challengeId),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.status, 'verifying'),
    ));
  }

  private async failChallenge(challengeId: string, codeDigest: string) {
    await this.database.db.update(wechatAuthChallenges).set({ status: 'failed' }).where(and(
      eq(wechatAuthChallenges.id, challengeId),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.status, 'verifying'),
    ));
  }

  private digest(domain: 'code' | 'ip' | 'state' | 'subject', value: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`wechat-auth-v1\0${domain}\0${value}`)
      .digest('hex');
  }

  private async consumeRate(scopeKey: string, limit: number, durationMs: number) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    const [counter] = await this.database.db.insert(authUsageCounters).values({
      count: 1,
      expiresAt,
      scopeKey,
    }).onConflictDoUpdate({
      target: authUsageCounters.scopeKey,
      set: {
        count: sql`CASE WHEN ${authUsageCounters.expiresAt} <= ${now} THEN 1 ELSE ${authUsageCounters.count} + 1 END`,
        expiresAt: sql`CASE WHEN ${authUsageCounters.expiresAt} <= ${now} THEN ${expiresAt} ELSE ${authUsageCounters.expiresAt} END`,
        updatedAt: now,
      },
    }).returning({ count: authUsageCounters.count, expiresAt: authUsageCounters.expiresAt });
    if (!counter || (counter.expiresAt > now && counter.count > limit)) {
      throw new HttpException('wechat_auth_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
