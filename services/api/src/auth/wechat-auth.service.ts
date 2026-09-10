import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { LoginMethodActionPurpose, CompleteWechatAuthRequest, CompleteWechatAuthResponse, NativeRecentAuthGrantResponse as RecentAuthGrantResponse, StartWechatAuthResponse, WechatRecentAuthRequest } from '@icao/contracts/native-auth';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { and, eq, gt, sql } from 'drizzle-orm';

import { AccountIdentityService } from '../account/account-identity.service';
import { API_CONFIG, type ApiConfig } from '../config';
import { accountDeletionAuthUsers, accountDeletionJobs, accountIdentities, accountLoginMethodRemovals, accounts, authUsageCounters, wechatAuthChallenges, wechatAuthPrincipals } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthSession } from './auth.types';
import { RecentAuthService } from './recent-auth.service';
import { WECHAT_AUTH_HTTP, type WechatAuthHttp } from './wechat-auth-http';

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const START_LIMIT_PER_HOUR = 30;
const COMPLETE_LIMIT_PER_HOUR = 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const VERIFICATION_LEASE_MS = 60 * 1_000;
const PHONE_BINDING_REAUTH_TTL_MS = 10 * 60 * 1_000;
type WechatChallengePurpose = 'login' | 'account_delete' | 'binding' | 'session_revoke_all' | LoginMethodActionPurpose | 'wechat_identity_binding';
type WechatRecentAuthPurpose = 'account_delete' | 'phone_binding' | 'session_revoke_all' | LoginMethodActionPurpose;

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
    private readonly recentAuth: RecentAuthService,
  ) {
    this.admin = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    this.publicClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async start(sourceIp: string): Promise<StartWechatAuthResponse> {
    return this.startChallenge('login', sourceIp);
  }

  async startRecentAuth(
    source: VerifiedAuthSession,
    sourceIp: string,
    purpose: WechatRecentAuthPurpose = 'account_delete',
  ): Promise<StartWechatAuthResponse> {
    return this.startChallenge(this.challengePurpose(purpose), sourceIp, source);
  }

  startIdentityBinding(source: VerifiedAuthSession, sourceIp: string) {
    return this.startChallenge('wechat_identity_binding', sourceIp, source);
  }

  /** Consumes the provider code before ownership errors; never issues or switches a login session. */
  async verifyIdentityBinding(source: VerifiedAuthSession, input: CompleteWechatAuthRequest, sourceIp: string) {
    await this.consumeRate(`wechat-complete:${this.digest('ip', sourceIp)}`, COMPLETE_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const { codeDigest, subjectDigest } = await this.verifyProviderSubject(input, 'wechat_identity_binding', source);
    const [consumed] = await this.database.db.update(wechatAuthChallenges).set({
      status: 'consumed', consumedAt: new Date(),
    }).where(and(
      eq(wechatAuthChallenges.id, input.challengeId),
      eq(wechatAuthChallenges.accountId, source.user.id),
      eq(wechatAuthChallenges.authUserId, source.authUserId),
      eq(wechatAuthChallenges.purpose, 'wechat_identity_binding'),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.status, 'verified'),
      gt(wechatAuthChallenges.expiresAt, new Date()),
    )).returning({ id: wechatAuthChallenges.id });
    if (!consumed) throw new ForbiddenException('invalid_wechat_auth_response');
    const authUser = await this.ensureAuthUser(subjectDigest);
    return { authUserId: authUser.id, provider: 'wechat' as const, subject: subjectDigest };
  }

  private async startChallenge(
    purpose: WechatChallengePurpose,
    sourceIp: string,
    source?: VerifiedAuthSession,
  ): Promise<StartWechatAuthResponse> {
    const issuedAt = Date.now();
    const state = randomBytes(32).toString('base64url');
    const configured = Boolean(
      this.config.wechatAppId
      && this.config.wechatAppSecret
      && this.config.wechatUniversalLink,
    );
    if (!configured) {
      return {
        challengeId: randomUUID(),
        expiresAt: issuedAt + CHALLENGE_TTL_MS,
        issuedAt,
        state,
        status: 'configuration_pending',
      };
    }

    await this.consumeRate(`wechat-start:${this.digest('ip', sourceIp)}`, START_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const [challenge] = await this.database.db.insert(wechatAuthChallenges).values({
      accountId: source?.user.id,
      authUserId: source?.authUserId,
      expiresAt: new Date(issuedAt + CHALLENGE_TTL_MS),
      purpose,
      stateDigest: this.digest('state', state),
    }).returning({ id: wechatAuthChallenges.id });
    if (!challenge) throw new ServiceUnavailableException('wechat_auth_unavailable');
    return {
      appId: this.config.wechatAppId,
      challengeId: challenge.id,
      expiresAt: issuedAt + CHALLENGE_TTL_MS,
      issuedAt,
      state,
      status: 'available',
    };
  }

  async complete(input: CompleteWechatAuthRequest, sourceIp: string): Promise<CompleteWechatAuthResponse> {
    if (!this.config.wechatAppId || !this.config.wechatAppSecret || !this.config.wechatUniversalLink) {
      throw new ServiceUnavailableException('wechat_auth_configuration_pending');
    }
    await this.consumeRate(`wechat-complete:${this.digest('ip', sourceIp)}`, COMPLETE_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const { codeDigest, subjectDigest } = await this.verifyProviderSubject(input, 'login');
    await this.consumeLoginChallenge(input.challengeId, codeDigest, subjectDigest);
    const authUser = await this.ensureAuthUser(subjectDigest);
    const session = await this.issueSession(authUser, subjectDigest);
    const verified = this.verifiedSession(session.access_token, session.user, subjectDigest);
    const account = await this.identities.resolve(verified);

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

  async completeRecentAuth(
    source: VerifiedAuthSession,
    input: WechatRecentAuthRequest,
    sourceIp: string,
  ): Promise<RecentAuthGrantResponse> {
    if (!this.config.wechatAppId || !this.config.wechatAppSecret || !this.config.wechatUniversalLink) {
      throw new ServiceUnavailableException('wechat_auth_configuration_pending');
    }
    await this.consumeRate(`wechat-complete:${this.digest('ip', sourceIp)}`, COMPLETE_LIMIT_PER_HOUR, 60 * 60 * 1_000);
    const purpose = input.purpose as WechatRecentAuthPurpose;
    const challengePurpose = this.challengePurpose(purpose);
    const { codeDigest, subjectDigest } = await this.verifyProviderSubject(input, challengePurpose, source);
    const now = new Date();
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-challenge:${input.challengeId}`}, 0))`);
      const [challenge] = await transaction.select({
        accountId: wechatAuthChallenges.accountId,
        authUserId: wechatAuthChallenges.authUserId,
        id: wechatAuthChallenges.id,
        status: wechatAuthChallenges.status,
        subjectDigest: wechatAuthChallenges.subjectDigest,
      }).from(wechatAuthChallenges).where(and(
        eq(wechatAuthChallenges.id, input.challengeId),
        eq(wechatAuthChallenges.codeDigest, codeDigest),
        eq(wechatAuthChallenges.purpose, challengePurpose),
        gt(wechatAuthChallenges.expiresAt, now),
      )).limit(1).for('update');
      if (
        !challenge
        || challenge.status !== 'verified'
        || challenge.accountId !== source.user.id
        || challenge.authUserId !== source.authUserId
        || challenge.subjectDigest !== subjectDigest
      ) throw new ForbiddenException('wechat_reauthentication_required');

      const [principal] = await transaction.select({ authUserId: wechatAuthPrincipals.authUserId })
        .from(wechatAuthPrincipals)
        .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest))
        .limit(1);
      if (!principal) throw new ForbiddenException('wechat_reauthentication_required');
      const [identity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(and(
          eq(accountIdentities.accountId, source.user.id),
          eq(accountIdentities.authUserId, principal.authUserId),
          eq(accountIdentities.provider, 'wechat'),
          eq(accountIdentities.subjectHash, this.identities.hashIdentity('wechat', subjectDigest)),
        ))
        .limit(1);
      if (!identity) throw new ForbiddenException('wechat_reauthentication_required');

      const grant = await this.recentAuth.issueVerifiedGrantInTransaction(
        transaction,
        source,
        'wechat',
        purpose,
        now,
        ['phone_binding', 'apple_binding', 'wechat_binding'].includes(purpose)
          ? new Date(now.getTime() + PHONE_BINDING_REAUTH_TTL_MS)
          : undefined,
      );
      const [consumed] = await transaction.update(wechatAuthChallenges).set({
        consumedAt: now,
        status: 'consumed',
      }).where(and(
        eq(wechatAuthChallenges.id, challenge.id),
        eq(wechatAuthChallenges.status, 'verified'),
      )).returning({ id: wechatAuthChallenges.id });
      if (!consumed) throw new ConflictException('wechat_auth_state_conflict');
      return grant;
    });
  }

  private async verifyProviderSubject(
    input: CompleteWechatAuthRequest,
    purpose: WechatChallengePurpose,
    source?: VerifiedAuthSession,
  ) {
    const appId = this.config.wechatAppId;
    const appSecret = this.config.wechatAppSecret;
    if (!appId || !appSecret) throw new ServiceUnavailableException('wechat_auth_configuration_pending');
    const codeDigest = this.digest('code', input.code);
    const now = new Date();
    const reservation = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-challenge:${input.challengeId}`}, 0))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-code:${codeDigest}`}, 0))`);
      const [challenge] = await transaction.select({
        accountId: wechatAuthChallenges.accountId,
        attemptCount: wechatAuthChallenges.attemptCount,
        authUserId: wechatAuthChallenges.authUserId,
        codeDigest: wechatAuthChallenges.codeDigest,
        id: wechatAuthChallenges.id,
        purpose: wechatAuthChallenges.purpose,
        stateDigest: wechatAuthChallenges.stateDigest,
        status: wechatAuthChallenges.status,
        subjectDigest: wechatAuthChallenges.subjectDigest,
        verificationExpiresAt: wechatAuthChallenges.verificationExpiresAt,
      }).from(wechatAuthChallenges).where(and(
        eq(wechatAuthChallenges.id, input.challengeId),
        gt(wechatAuthChallenges.expiresAt, now),
      )).limit(1).for('update');
      const sourceMatches = purpose === 'login'
        ? challenge?.accountId === null && challenge?.authUserId === null
        : challenge?.accountId === source?.user.id && challenge?.authUserId === source?.authUserId;
      if (
        !challenge
        || challenge.purpose !== purpose
        || !sourceMatches
        || challenge.stateDigest !== this.digest('state', input.state)
        || challenge.attemptCount >= MAX_CHALLENGE_ATTEMPTS
      ) throw new ForbiddenException('invalid_wechat_auth_response');

      if (
        challenge.status === 'verified'
        && challenge.codeDigest === codeDigest
        && challenge.subjectDigest
      ) return {
        subjectDigest: challenge.subjectDigest,
        shouldExchange: false,
      };

      if (
        challenge.status === 'verifying'
        && challenge.verificationExpiresAt
        && challenge.verificationExpiresAt <= now
      ) {
        await transaction.update(wechatAuthChallenges).set({
          status: 'failed',
          verificationExpiresAt: null,
        }).where(and(
          eq(wechatAuthChallenges.id, challenge.id),
          eq(wechatAuthChallenges.status, 'verifying'),
        ));
        return { shouldExchange: false };
      }
      if (challenge.status !== 'pending') throw new ForbiddenException('invalid_wechat_auth_response');
      const [replayed] = await transaction.select({ id: wechatAuthChallenges.id })
        .from(wechatAuthChallenges)
        .where(and(eq(wechatAuthChallenges.codeDigest, codeDigest), sql`${wechatAuthChallenges.id} <> ${challenge.id}::uuid`))
        .limit(1);
      if (replayed) throw new ForbiddenException('invalid_wechat_auth_response');
      const [reserved] = await transaction.update(wechatAuthChallenges).set({
        attemptCount: challenge.attemptCount + 1,
        codeDigest,
        lastAttemptAt: now,
        status: 'verifying',
        verificationExpiresAt: new Date(now.getTime() + VERIFICATION_LEASE_MS),
      }).where(and(
        eq(wechatAuthChallenges.id, challenge.id),
        eq(wechatAuthChallenges.status, 'pending'),
      )).returning({ id: wechatAuthChallenges.id });
      if (!reserved) throw new ConflictException('wechat_auth_state_conflict');
      return { alreadyConsumed: false, shouldExchange: true };
    });
    if (!reservation.shouldExchange) {
      if (reservation.subjectDigest) {
        return {
          codeDigest,
          subjectDigest: reservation.subjectDigest,
        };
      }
      throw new ForbiddenException('invalid_wechat_auth_response');
    }

    let tokenResponse;
    try {
      tokenResponse = await this.http.exchangeCode({
        appId,
        appSecret,
        code: input.code,
      });
    } catch {
      await this.failChallenge(input.challengeId, codeDigest);
      throw new ServiceUnavailableException('wechat_provider_unavailable');
    }
    if (tokenResponse.errcode || !tokenResponse.openid || !tokenResponse.access_token) {
      await this.failChallenge(input.challengeId, codeDigest);
      throw new ForbiddenException('invalid_wechat_auth_response');
    }
    const stableSubject = tokenResponse.unionid
      ? `unionid:${tokenResponse.unionid}`
      : `openid:${appId}:${tokenResponse.openid}`;
    const subjectDigest = this.digest('subject', stableSubject);
    const [verified] = await this.database.db.update(wechatAuthChallenges).set({
      status: 'verified',
      subjectDigest,
      verificationExpiresAt: null,
    }).where(and(
      eq(wechatAuthChallenges.id, input.challengeId),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.status, 'verifying'),
    )).returning({ id: wechatAuthChallenges.id });
    if (!verified) throw new ConflictException('wechat_auth_state_conflict');
    return { codeDigest, subjectDigest };
  }

  private async consumeLoginChallenge(challengeId: string, codeDigest: string, subjectDigest: string) {
    const now = new Date();
    const [consumed] = await this.database.db.update(wechatAuthChallenges).set({
      consumedAt: now,
      status: 'consumed',
    }).where(and(
      eq(wechatAuthChallenges.id, challengeId),
      eq(wechatAuthChallenges.codeDigest, codeDigest),
      eq(wechatAuthChallenges.subjectDigest, subjectDigest),
      eq(wechatAuthChallenges.purpose, 'login'),
      eq(wechatAuthChallenges.status, 'verified'),
      gt(wechatAuthChallenges.expiresAt, now),
    )).returning({ id: wechatAuthChallenges.id });
    if (!consumed) throw new ForbiddenException('invalid_wechat_auth_response');
  }

  private challengePurpose(purpose: WechatRecentAuthPurpose): WechatChallengePurpose {
    if (purpose === 'phone_binding') return 'binding';
    return purpose;
  }

  private async ensureAuthUser(subjectDigest: string): Promise<User> {
    const authUserId = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wechat-principal:${subjectDigest}`}, 0))`);
      const [principal] = await transaction.select({ authUserId: wechatAuthPrincipals.authUserId })
        .from(wechatAuthPrincipals)
        .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest))
        .limit(1);
      if (principal) {
        const [identity] = await transaction.select({ accountId: accountIdentities.accountId })
          .from(accountIdentities).where(eq(accountIdentities.authUserId, principal.authUserId)).limit(1);
        // Auth deletion cascades identity rows before the deletion job finishes.
        const [deletion] = await transaction.select({ accountId: accountDeletionJobs.accountId })
          .from(accountDeletionAuthUsers)
          .innerJoin(accountDeletionJobs, eq(accountDeletionJobs.id, accountDeletionAuthUsers.jobId))
          .where(eq(accountDeletionAuthUsers.authUserId, principal.authUserId)).limit(1);
        const accountId = identity?.accountId ?? deletion?.accountId ?? principal.authUserId;
        // Serialize this decision with account deletion, including identities linked to a phone account.
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))`);
        const [account] = await transaction.select({ status: accounts.status })
          .from(accounts).where(eq(accounts.id, accountId)).limit(1);
        if (account && !['active', 'deleted'].includes(account.status)) {
          throw new ServiceUnavailableException('account_not_active');
        }
        const [removal] = await transaction.select({ status: accountLoginMethodRemovals.status })
          .from(accountLoginMethodRemovals).where(eq(accountLoginMethodRemovals.authUserId, principal.authUserId)).limit(1);
        if (removal && removal.status !== 'completed') throw new ServiceUnavailableException('login_method_removal_pending');
        if (!removal && account?.status !== 'deleted') return principal.authUserId;
        // A new authorization after cleanup gets a new principal, never the old account.
        const replacementId = randomUUID();
        // Finalization may have removed this row while we waited for the account lock.
        await transaction.insert(wechatAuthPrincipals).values({ authUserId: replacementId, subjectDigest })
          .onConflictDoUpdate({ target: wechatAuthPrincipals.subjectDigest,
            set: { authUserId: replacementId, lastUsedAt: new Date() } });
        return replacementId;
      }
      // Persist a fresh reservation before contacting Auth; retries reuse it, while
      // re-registration must never regenerate the ID of a deleted account.
      const [reserved] = await transaction.insert(wechatAuthPrincipals).values({
        authUserId: randomUUID(),
        subjectDigest,
      }).onConflictDoNothing().returning({ authUserId: wechatAuthPrincipals.authUserId });
      if (reserved) return reserved.authUserId;
      const [winner] = await transaction.select({ authUserId: wechatAuthPrincipals.authUserId })
        .from(wechatAuthPrincipals)
        .where(eq(wechatAuthPrincipals.subjectDigest, subjectDigest))
        .limit(1);
      if (!winner) throw new ServiceUnavailableException('wechat_session_unavailable');
      return winner.authUserId;
    });

    const existing = await this.admin.auth.admin.getUserById(authUserId);
    let user = existing.data.user;
    if (!user) {
      if (existing.error && existing.error.status !== 404) {
        throw new ServiceUnavailableException('wechat_session_unavailable');
      }
      const privateEmail = `wx-${subjectDigest.slice(0, 24)}-${authUserId.replaceAll('-', '')}@wechat-auth.invalid`;
      const created = await this.admin.auth.admin.createUser({
        app_metadata: {
          icao_identity_provider: 'wechat',
          icao_wechat_subject: subjectDigest,
        },
        email: privateEmail,
        email_confirm: true,
        id: authUserId,
      });
      user = created.data.user;
      if (!user) {
        // A concurrent retry may have created the reserved user after our
        // initial lookup. Recover it by id instead of creating a second email
        // or deleting another request's successful side effect.
        const recovered = await this.admin.auth.admin.getUserById(authUserId);
        user = recovered.data.user;
      }
    }
    if (
      !user
      || user.id !== authUserId
      || user.app_metadata?.icao_identity_provider !== 'wechat'
      || user.app_metadata?.icao_wechat_subject !== subjectDigest
    ) throw new ServiceUnavailableException('wechat_session_unavailable');
    await this.database.db.update(wechatAuthPrincipals).set({ lastUsedAt: new Date() })
      .where(and(
        eq(wechatAuthPrincipals.subjectDigest, subjectDigest),
        eq(wechatAuthPrincipals.authUserId, authUserId),
      ));
    return user;
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

  private async failChallenge(challengeId: string, codeDigest: string) {
    await this.database.db.update(wechatAuthChallenges).set({
      status: 'failed',
      verificationExpiresAt: null,
    }).where(and(
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
        count: sql`CASE WHEN ${authUsageCounters.expiresAt} <= ${now.toISOString()}::timestamptz THEN 1 ELSE ${authUsageCounters.count} + 1 END`,
        expiresAt: sql`CASE WHEN ${authUsageCounters.expiresAt} <= ${now.toISOString()}::timestamptz THEN ${expiresAt.toISOString()}::timestamptz ELSE ${authUsageCounters.expiresAt} END`,
        updatedAt: now,
      },
    }).returning({ count: authUsageCounters.count, expiresAt: authUsageCounters.expiresAt });
    if (!counter || (counter.expiresAt > now && counter.count > limit)) {
      throw new HttpException('wechat_auth_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
