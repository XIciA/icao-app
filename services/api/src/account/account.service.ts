import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AccountDataExportResponse, AccountSummary, AuthorizePasswordRecoveryResponse, BindPhoneResponse, StartPhoneBindingResponse, UpdatePhonePasswordResponse } from '@icao/contracts';
import { isChinaMobileE164, normalizeChinaMobile } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, sql } from 'drizzle-orm';
import { AUTH_VERIFIER, type AuthVerifier, type VerifiedAuthSession } from '../auth/auth.types';
import { PhoneAuthService } from '../auth/phone-auth.service';
import { RecentAuthService } from '../auth/recent-auth.service';
import { SessionSecurityService } from '../auth/session-security.service';
import { API_CONFIG, type ApiConfig } from '../config';
import {
  accountIdentities,
  accounts,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { AccountIdentityService } from './account-identity.service';

const RECENT_SOCIAL_AUTH_WINDOW_SECONDS = 10 * 60;

function sortedProviders(providers: Iterable<string>): AccountSummary['providers'] {
  const supported = new Set(['phone', 'apple']);
  return [...new Set(providers)]
    .filter((provider): provider is AccountSummary['providers'][number] => supported.has(provider))
    .sort((left, right) => ['phone', 'apple'].indexOf(left) - ['phone', 'apple'].indexOf(right));
}

@Injectable()
export class AccountService {
  private readonly adminAuth: SupabaseClient;
  private readonly publicAuth: SupabaseClient;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly database: DatabaseService,
    private readonly identities: AccountIdentityService,
    private readonly phoneAuth: PhoneAuthService,
    private readonly recentAuth: RecentAuthService,
    private readonly sessions: SessionSecurityService,
  ) {
    this.adminAuth = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    this.publicAuth = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async summary(accountId: string, phone?: string): Promise<AccountSummary> {
    const providers = await this.identities.providersForAccount(accountId);
    let resolvedPhone = isChinaMobileE164(phone) ? phone : undefined;
    if (!resolvedPhone && providers.includes('phone')) {
      const [phoneIdentity] = await this.database.db.select({ authUserId: accountIdentities.authUserId })
        .from(accountIdentities)
        .where(sql`${accountIdentities.accountId} = ${accountId}::uuid and ${accountIdentities.provider} = 'phone'`)
        .limit(1);
      if (phoneIdentity) {
        const { data } = await this.adminAuth.auth.admin.getUserById(phoneIdentity.authUserId);
        resolvedPhone = normalizeChinaMobile(data.user?.phone ?? '') ?? resolvedPhone;
      }
    }
    return {
      accountId,
      phone: resolvedPhone,
      phoneBound: providers.includes('phone'),
      providers,
    };
  }

  async exportAccountData(accountId: string, phone?: string): Promise<AccountDataExportResponse['account']> {
    const [account, summary] = await Promise.all([
      this.database.db.select({ createdAt: accounts.createdAt })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1)
        .then((rows) => rows[0]),
      this.summary(accountId, phone),
    ]);
    if (!account) throw new ForbiddenException('account_not_active');
    return {
      accountId,
      createdAt: account.createdAt.toISOString(),
      ...(summary.phone ? { phone: summary.phone } : {}),
      providers: summary.providers,
    };
  }

  async revokeAll(accountId: string, accessToken: string) {
    const authUserIds = await this.identities.authUserIdsForAccount(accountId);
    await Promise.all(authUserIds.map((userId) => this.sessions.revokeAll(userId)));
    await this.database.db.update(accounts)
      .set({ sessionsRevokedAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
    const { error } = await this.adminAuth.auth.admin.signOut(accessToken, 'global');
    if (error) throw new Error('global_sign_out_failed');
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
        await this.phoneAuth.consumeOtpIntent(source, 'login');
      } else {
        if (!recoveryGrantId) throw new ForbiddenException('phone_reauthentication_required');
        recoveryReservationToken = await this.recentAuth.reserve(
          source,
          recoveryGrantId,
          'password_recovery',
        );
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
      const { error } = await this.adminAuth.auth.admin.signOut(source.accessToken, 'global');
      if (error) throw new ServiceUnavailableException('phone_auth_unavailable');
      await this.sessions.revokeAll(source.authUserId);
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

  async authorizePasswordRecovery(source: VerifiedAuthSession): Promise<AuthorizePasswordRecoveryResponse> {
    const grant = await this.recentAuth.issuePhoneOtpGrant(source, 'password_recovery');
    return { authorized: true, expiresAt: grant.expiresAt, grantId: grant.grantId };
  }

  private createRequestAuthClient() {
    return createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  private async releaseRecoveryReservation(grantId?: string, reservationToken?: string) {
    if (grantId && reservationToken) {
      await this.recentAuth.releaseReservation(grantId, reservationToken).catch(() => undefined);
    }
  }

  async bindPhoneWithOtp(source: VerifiedAuthSession, phone: string, token: string): Promise<BindPhoneResponse> {
    this.assertSocialPhoneBindingAllowed(source);
    const { data, error } = await this.publicAuth.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.session) {
      throw new ForbiddenException('invalid_phone_otp');
    }
    if (!data.user || normalizeChinaMobile(data.user.phone ?? '') !== phone) {
      await this.adminAuth.auth.admin.signOut(data.session.access_token, 'local').catch(() => undefined);
      throw new ForbiddenException('invalid_phone_otp');
    }
    try {
      // verifyOtp is the authoritative proof that this request just completed an
      // SMS challenge. GoTrue can retain the original OTP timestamp in `amr`
      // when the same phone retries account binding, so relying on the JWT's
      // historical timestamp rejects a newly verified code as stale.
      const otpVerifiedAt = new Date();
      const phoneSession = await this.verifier.verify(data.session.access_token);
      if (phoneSession.authUserId !== data.user.id || phoneSession.user.phone !== phone) {
        throw new ForbiddenException('invalid_phone_otp');
      }
      phoneSession.authenticationMethods = [
        ...phoneSession.authenticationMethods.filter((entry) => entry.method !== 'otp'),
        { method: 'otp', timestamp: Math.floor(otpVerifiedAt.getTime() / 1_000) },
      ];
      phoneSession.user = {
        ...phoneSession.user,
        authUserId: phoneSession.authUserId,
        phone,
        providers: ['phone'],
      };
      // Consume the verified challenge before attempting the binding transaction.
      // A conflict must not roll the challenge back and make the same OTP replayable.
      await this.phoneAuth.consumeOtpIntent(phoneSession, 'phone_binding', otpVerifiedAt, source.user.id);
      const binding = await this.attachNewPhoneIdentity(source, phoneSession, phone);
      if (binding.status === 'conflict') throw new ConflictException('phone_already_registered');
      return {
        account: binding.account,
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        },
      };
    } catch (cause) {
      await this.adminAuth.auth.admin.signOut(data.session.access_token, 'local').catch(() => undefined);
      throw cause;
    }
  }

  private async attachNewPhoneIdentity(
    source: VerifiedAuthSession,
    phoneAuth: VerifiedAuthSession,
    phone: string,
  ): Promise<{ account: AccountSummary; status: 'bound' } | { status: 'conflict' }> {
    const sourceAccountId = source.user.id;
    const phoneAuthUserId = phoneAuth.authUserId;
    return this.database.db.transaction(async (transaction) => {
      const lockIds = [`account:${sourceAccountId}`, `auth:${phoneAuthUserId}`, `phone:${phone}`].sort();
      for (const lockId of lockIds) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockId}, 0))`);
      }
      const [sourceAccount] = await transaction.select({ status: accounts.status })
        .from(accounts)
        .where(eq(accounts.id, sourceAccountId))
        .limit(1);
      if (!sourceAccount || sourceAccount.status !== 'active') throw new ConflictException('invalid_phone_binding');
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
      const [existingSourcePhoneIdentity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(and(
          eq(accountIdentities.accountId, sourceAccountId),
          eq(accountIdentities.provider, 'phone'),
        ))
        .limit(1);
      if (existingPhoneIdentity || existingAuthIdentity || existingSourcePhoneIdentity) {
        return { status: 'conflict' as const };
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
          phone,
          phoneBound: true,
          providers: sortedProviders(providers.map((row) => row.provider)),
        },
        status: 'bound' as const,
      };
    });
  }

  async startPhoneBinding(source: VerifiedAuthSession, phone: string, sourceIp = '127.0.0.1'): Promise<StartPhoneBindingResponse> {
    this.assertSocialPhoneBindingAllowed(source);
    return this.phoneAuth.startBinding(source, phone, sourceIp);
  }

  private assertSocialPhoneBindingAllowed(source: VerifiedAuthSession) {
    const providers = source.user.providers ?? [];
    if (providers.includes('phone')) throw new ConflictException('invalid_phone_binding');
    if (!providers.includes('apple')) {
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
