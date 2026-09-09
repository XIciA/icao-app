import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { AuthorizePasswordRecoveryResponse, UpdatePhonePasswordResponse } from '@icao/contracts';
import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import type { NativeAccountSummary as AccountSummary, NativeBindPhoneResponse as BindPhoneResponse, NativeStartPhoneBindingResponse as StartPhoneBindingResponse } from '@icao/contracts/native-auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, sql } from 'drizzle-orm';
import { AUTH_VERIFIER, type AuthVerifier, type VerifiedAuthSession } from '../auth/auth.types';
import { PhoneAuthService } from '../auth/phone-auth.service';
import { RecentAuthService } from '../auth/recent-auth.service';
import { SessionSecurityService } from '../auth/session-security.service';
import { API_CONFIG, type ApiConfig } from '../config';
import {
  accountIdentities,
  accountLoginMethodRemovals,
  accounts,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AccountIdentityService } from './account-identity.service';
import { AccountPhoneIdentityService } from './account-phone-identity.service';
import { AccountLoginMethodsService } from './account-login-methods.service';

const RECENT_SOCIAL_AUTH_WINDOW_SECONDS = 10 * 60;

function sortedProviders(providers: Iterable<string>): AccountSummary['providers'] {
  const supported = new Set(['phone', 'apple', 'wechat']);
  return [...new Set(providers)]
    .filter((provider): provider is AccountSummary['providers'][number] => supported.has(provider))
    .sort((left, right) => ['phone', 'apple', 'wechat'].indexOf(left) - ['phone', 'apple', 'wechat'].indexOf(right));
}

@Injectable()
export class AccountService {
  private readonly adminAuth: SupabaseClient;
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly database: DatabaseService,
    private readonly identities: AccountIdentityService,
    private readonly phoneAuth: PhoneAuthService,
    private readonly recentAuth: RecentAuthService,
    private readonly sessions: SessionSecurityService,
    private readonly accountPhones: AccountPhoneIdentityService,
    @Optional() private readonly loginMethods?: AccountLoginMethodsService,
  ) {
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async summary(accountId: string, phone?: string): Promise<AccountSummary> {
    const providers = await this.identities.providersForAccount(accountId);
    let resolvedPhone = isChinaMobileE164(phone) ? phone : undefined;
    let hasPassword = false;
    if (providers.includes('phone')) {
      const identity = await this.accountPhones.resolve(accountId);
      resolvedPhone = identity.phone;
      hasPassword = identity.passwordSet;
    }
    return {
      accountId,
      hasPassword,
      phone: resolvedPhone,
      phoneBound: providers.includes('phone'),
      providers,
    };
  }

  async revokeAll(source: VerifiedAuthSession, grantId: string) {
    const accountId = source.user.id;
    const authUserIds = await this.identities.authUserIdsForAccount(accountId);
    const linkedAuthUserIds = [...new Set([source.authUserId, ...authUserIds])];
    await this.database.db.transaction(async (transaction) => {
      // Grant consumption and every local session fence commit atomically.
      // Once this transaction returns, no old bearer from any linked
      // principal can authorize another API request, even if provider cleanup
      // is unavailable.
      await this.recentAuth.consumeInTransaction(
        transaction,
        source,
        grantId,
        'session_revoke_all',
      );
      for (const authUserId of linkedAuthUserIds) {
        await this.sessions.revokeAllInTransaction(transaction, authUserId);
      }
      await transaction.update(accounts)
        .set({ sessionsRevokedAt: new Date(), updatedAt: new Date() })
        .where(eq(accounts.id, accountId));
    });
    await this.bestEffortGlobalSignOut(source.accessToken);
    return { revoked: true as const };
  }

  async updatePassword(
    source: VerifiedAuthSession,
    password: string,
    currentPassword?: string,
    recoveryGrantId?: string,
  ): Promise<UpdatePhonePasswordResponse> {
    if (!isChinaMobileE164(source.user.phone) || !source.user.providers?.includes('phone')) {
      throw new ForbiddenException('verified_phone_required');
    }
    let isPasswordRecovery = false;
    let recoveryReservationToken: string | undefined;
    if (currentPassword === undefined) {
      const isFirstPasswordSetup = source.passwordSet === false;
      if (isFirstPasswordSetup) {
        this.assertRecentPhoneOtp(source);
      } else {
        if (!recoveryGrantId) throw new ForbiddenException('phone_reauthentication_required');
        recoveryReservationToken = await this.recentAuth.reserve(
          source,
          recoveryGrantId,
          'password_recovery',
        );
        // Establish the local, irreversible bearer fence before any remote
        // password mutation. The in-flight request has already passed the
        // guard and may still call the private GoTrue origin, but every later
        // request carrying an old session is denied even if any subsequent
        // database or provider cleanup step fails.
        await this.sessions.revokeAll(source.authUserId);
      }
      isPasswordRecovery = !isFirstPasswordSetup;
    }
    const response = await fetch(new URL('/auth/v1/user', this.config.supabaseUrl), {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        apikey: this.config.supabasePublishableKey,
        authorization: `Bearer ${source.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        password,
        ...(currentPassword === undefined ? {} : { current_password: currentPassword }),
        data: { password_set: true, registration_pending: false },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
    if (!response) {
      await this.releaseRecoveryReservation(recoveryGrantId, recoveryReservationToken);
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    if (!response.ok) {
      await this.releaseRecoveryReservation(recoveryGrantId, recoveryReservationToken);
      const body = await response.json().catch(() => undefined) as { code?: string; error_code?: string } | undefined;
      const code = body?.code ?? body?.error_code;
      if (code === 'weak_password') throw new HttpException('invalid_phone_password', HttpStatus.BAD_REQUEST);
      if (code === 'same_password') throw new HttpException('password_unchanged', HttpStatus.BAD_REQUEST);
      if (code === 'reauthentication_needed') throw new ForbiddenException('phone_reauthentication_required');
      if (
        code === 'reauthentication_not_valid'
        || code === 'current_password_invalid'
        || code === 'current_password_mismatch'
        || code === 'current_password_required'
      ) throw new ForbiddenException('invalid_phone_or_password');
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    if (recoveryGrantId && recoveryReservationToken) {
      await this.recentAuth.commitReservation(
        source,
        recoveryGrantId,
        'password_recovery',
        recoveryReservationToken,
      );
    }
    if (isPasswordRecovery) {
      // The database fence above is authoritative; provider cleanup is only
      // best-effort and may be retried without reopening the old bearer.
      await this.bestEffortGlobalSignOut(source.accessToken);
    }
    const { data: next, error: signInError } = await this.createRequestAuthClient().auth.signInWithPassword({
      phone: source.user.phone,
      password,
    });
    if (
      signInError
      || !next.session
      || next.user.id !== source.authUserId
      || normalizeChinaMobile(next.user.phone ?? '') !== source.user.phone
    ) {
      if (next.session) {
        await this.adminAuth.auth.admin.signOut(next.session.access_token, 'local').catch(() => undefined);
      }
      throw new ServiceUnavailableException('phone_auth_unavailable');
    }
    if (!isPasswordRecovery) {
      await this.adminAuth.auth.admin.signOut(source.accessToken, 'local').catch(() => undefined);
    }
    return {
      session: {
        accessToken: next.session.access_token,
        refreshToken: next.session.refresh_token,
        expiresAt: next.session.expires_at,
      },
      updated: true,
    };
  }

  async authorizePasswordRecovery(
    source: VerifiedAuthSession,
    challengeId: string,
  ): Promise<AuthorizePasswordRecoveryResponse> {
    const grant = await this.database.db.transaction(async (transaction) => {
      await this.phoneAuth.redeemRecoveryIntentInTransaction(
        transaction,
        source,
        challengeId,
      );
      return this.recentAuth.issueVerifiedGrantInTransaction(
        transaction,
        source,
        'phone_otp',
        'password_recovery',
        new Date(),
      );
    });
    return { authorized: true, expiresAt: grant.expiresAt, grantId: grant.grantId };
  }

  private createRequestAuthClient() {
    return createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  private async bestEffortGlobalSignOut(accessToken: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { error } = await this.adminAuth.auth.admin.signOut(accessToken, 'global');
        if (!error) return;
      } catch {
        // The local revocation fence remains authoritative. Retry below.
      }
    }
    this.logger.warn('provider_global_sign_out_pending');
  }

  private async releaseRecoveryReservation(grantId?: string, reservationToken?: string) {
    if (grantId && reservationToken) {
      await this.recentAuth.releaseReservation(grantId, reservationToken).catch(() => undefined);
    }
  }

  async bindPhoneWithOtp(
    source: VerifiedAuthSession,
    challengeId: string,
    phone: string,
    token: string,
    sourceIp = '127.0.0.1',
    recentAuthGrantId?: string,
  ): Promise<BindPhoneResponse> {
    const authorization = await this.assertSocialPhoneBindingAllowed(source, recentAuthGrantId);
    const verified = await this.phoneAuth.verifyBindingChallenge(
      source,
      challengeId,
      phone,
      token,
      sourceIp,
    );
    try {
      const phoneSession = await this.verifier.verify(verified.accessToken);
      if (phoneSession.user.phone !== phone || !phoneSession.user.providers?.includes('phone')) {
        throw new ForbiddenException('invalid_phone_otp');
      }
      if (phoneSession.identities.some(({ provider }) => provider !== 'phone')) {
        throw new ConflictException('phone_already_registered');
      }
      const binding = await this.attachNewPhoneIdentity(
        source,
        phoneSession,
        phone,
        authorization === 'grant' ? recentAuthGrantId : undefined,
      );
      if (binding.status === 'conflict') throw new ConflictException('phone_already_registered');
      if (binding.removal) await this.loginMethods?.completeIdentityRemoval(binding.removal.id, binding.removal.authUserId);
      return {
        account: binding.account,
        session: {
          accessToken: verified.accessToken,
          refreshToken: verified.refreshToken,
          expiresAt: verified.expiresAt,
        },
      };
    } catch (cause) {
      await this.adminAuth.auth.admin.signOut(verified.accessToken, 'local').catch(() => undefined);
      if (cause instanceof ForbiddenException && cause.message === 'recent_auth_required') {
        throw new ForbiddenException('recent_social_auth_required');
      }
      throw cause;
    }
  }

  private assertRecentPhoneOtp(source: VerifiedAuthSession) {
    const now = Math.floor(Date.now() / 1_000);
    const otpAuthenticatedAt = Math.max(
      0,
      ...source.authenticationMethods
        .filter((entry) => entry.method === 'otp')
        .map((entry) => entry.timestamp),
    );
    if (
      !otpAuthenticatedAt
      || otpAuthenticatedAt > now + 60
      || now - otpAuthenticatedAt > RECENT_SOCIAL_AUTH_WINDOW_SECONDS
    ) {
      throw new ForbiddenException('phone_reauthentication_required');
    }
  }

  private async attachNewPhoneIdentity(
    source: VerifiedAuthSession,
    phoneAuth: VerifiedAuthSession,
    phone: string,
    recentAuthGrantId?: string,
  ): Promise<{ account: AccountSummary; status: 'bound'; removal?: { id: string; authUserId: string } } | { status: 'conflict' }> {
    const sourceAccountId = source.user.id;
    const phoneAuthUserId = phoneAuth.authUserId;
    const [previousPhone] = await this.database.db.select({ authUserId: accountIdentities.authUserId })
      .from(accountIdentities).where(and(eq(accountIdentities.accountId, sourceAccountId), eq(accountIdentities.provider, 'phone'))).limit(1);
    return this.database.db.transaction(async (transaction) => {
      // Auth principals precede the account lock, matching identity resolution
      // and unlinking. Never let a concurrent login claim the replacement.
      const lockIds = [...new Set([phoneAuthUserId, ...(previousPhone ? [previousPhone.authUserId] : [])])].sort().map((id) => `auth:${id}`);
      lockIds.push(`account:${sourceAccountId}`, `phone:${phone}`);
      for (const lockId of lockIds) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockId}, 0))`);
      }
      if (recentAuthGrantId) {
        await this.recentAuth.consumeInTransaction(
          transaction,
          source,
          recentAuthGrantId,
          'phone_binding',
        );
      }
      const [sourceAccount] = await transaction.select({ status: accounts.status, sessionsRevokedAt: accounts.sessionsRevokedAt })
        .from(accounts)
        .where(eq(accounts.id, sourceAccountId))
        .limit(1);
      if (!sourceAccount || sourceAccount.status !== 'active') throw new ConflictException('invalid_phone_binding');
      if (sourceAccount.sessionsRevokedAt && source.issuedAt <= Math.floor(sourceAccount.sessionsRevokedAt.getTime() / 1_000)) {
        throw new ForbiddenException('session_revoked');
      }
      const sourceIdentities = await transaction.select({ id: accountIdentities.id, authUserId: accountIdentities.authUserId, provider: accountIdentities.provider })
        .from(accountIdentities).where(eq(accountIdentities.accountId, sourceAccountId));
      if (!sourceIdentities.some(({ authUserId }) => authUserId === source.authUserId)) throw new ForbiddenException('session_revoked');
      const phoneSubjectHash = this.identities.hashIdentity('phone', phone);
      const [existingPhoneIdentity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(and(
          eq(accountIdentities.provider, 'phone'),
          eq(accountIdentities.subjectHash, phoneSubjectHash),
        ))
        .limit(1);
      const [existingAuthIdentity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(eq(accountIdentities.authUserId, phoneAuthUserId))
        .limit(1);
      const oldPhone = sourceIdentities.find(({ provider }) => provider === 'phone');
      const [removedTarget] = await transaction.select({ id: accountLoginMethodRemovals.id }).from(accountLoginMethodRemovals)
        .where(eq(accountLoginMethodRemovals.authUserId, phoneAuthUserId)).limit(1);
      if (existingPhoneIdentity || existingAuthIdentity || removedTarget) {
        return { status: 'conflict' as const };
      }
      let removal: { id: string; authUserId: string } | undefined;
      if (oldPhone) {
        if (!recentAuthGrantId || oldPhone.authUserId !== previousPhone?.authUserId) throw new ForbiddenException('phone_reauthentication_required');
        const owners = await transaction.select({ id: accountIdentities.id }).from(accountIdentities)
          .where(eq(accountIdentities.authUserId, oldPhone.authUserId));
        if (owners.length !== 1) throw new ConflictException('login_method_shared_principal');
        // The source proof has already authorized this replacement. Stage the
        // old identity fence and the new mapping in one transaction; target
        // occupancy or any database failure leaves the old identity intact.
        const [queued] = await transaction.insert(accountLoginMethodRemovals).values({
          accountId: sourceAccountId, authUserId: oldPhone.authUserId, provider: 'phone', status: 'pending',
        }).returning({ id: accountLoginMethodRemovals.id });
        if (!queued) throw new Error('phone_identity_removal_not_created');
        removal = { id: queued.id, authUserId: oldPhone.authUserId };
        await this.sessions.revokeAllInTransaction(transaction, oldPhone.authUserId);
        await transaction.delete(accountIdentities).where(eq(accountIdentities.id, oldPhone.id));
      }
      await transaction.insert(accountIdentities).values({
        accountId: sourceAccountId,
        authUserId: phoneAuthUserId,
        provider: 'phone',
        subjectHash: phoneSubjectHash,
      });
      await this.identities.claimLifetimeTrialInTransaction(
        transaction,
        [{ provider: 'phone', subject: phone }],
        sourceAccountId,
        new Date(),
        false,
      );
      const providers = await transaction.selectDistinct({ provider: accountIdentities.provider })
        .from(accountIdentities)
        .where(eq(accountIdentities.accountId, sourceAccountId));
      return {
        account: {
          accountId: sourceAccountId,
          hasPassword: phoneAuth.passwordSet === true,
          phone,
          phoneBound: true,
          providers: sortedProviders(providers.map((row) => row.provider)),
        },
        status: 'bound' as const,
        ...(removal ? { removal } : {}),
      };
    });
  }

  async startPhoneBinding(
    source: VerifiedAuthSession,
    phone: string,
    sourceIp = '127.0.0.1',
    recentAuthGrantId?: string,
  ): Promise<StartPhoneBindingResponse> {
    await this.assertSocialPhoneBindingAllowed(source, recentAuthGrantId);
    return this.phoneAuth.startBinding(source, phone, sourceIp);
  }

  private async assertSocialPhoneBindingAllowed(source: VerifiedAuthSession, recentAuthGrantId?: string) {
    const providers = source.user.providers ?? [];
    if (recentAuthGrantId) {
      try {
        await this.recentAuth.assertValid(source, recentAuthGrantId, 'phone_binding', undefined);
      } catch (cause) {
        if (cause instanceof ForbiddenException && cause.message === 'recent_auth_required') {
          throw new ForbiddenException('recent_social_auth_required');
        }
        throw cause;
      }
      return 'grant' as const;
    }
    if (providers.includes('phone')) throw new ForbiddenException('phone_reauthentication_required');
    if (!providers.includes('apple') && !providers.includes('wechat')) {
      throw new ForbiddenException('social_identity_required');
    }
    const appleAuthenticatedAt = Math.max(
      0,
      ...source.authenticationMethods
        .filter((entry) => (
          providers.includes('apple')
          && entry.method === 'oauth'
          && (!entry.provider || entry.provider === 'apple')
        ))
        .map((entry) => entry.timestamp),
    );
    const now = Math.floor(Date.now() / 1_000);
    const appleIsRecent = Boolean(
      appleAuthenticatedAt
      && appleAuthenticatedAt <= now + 60
      && now - appleAuthenticatedAt <= RECENT_SOCIAL_AUTH_WINDOW_SECONDS,
    );
    if (appleIsRecent) return 'apple' as const;
    throw new ForbiddenException('recent_social_auth_required');
  }

}
