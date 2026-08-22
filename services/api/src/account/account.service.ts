import { ConflictException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { AccountSummary, AuthorizePasswordRecoveryResponse, MergePhoneAccountResponse, StartPhoneBindingResponse, UpdatePhonePasswordResponse } from '@icao/contracts';
import { isChinaMobileE164 } from '@icao/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { AUTH_VERIFIER, type AuthVerifier, type VerifiedAuthSession } from '../auth/auth.types';
import { PhoneAuthService } from '../auth/phone-auth.service';
import { RecentSocialAuthGrantService } from '../auth/recent-social-auth-grant.service';
import { SessionSecurityService } from '../auth/session-security.service';
import { API_CONFIG, type ApiConfig } from '../config';
import {
  accountSessionRevocations,
  accountIdentities,
  accountMerges,
  accounts,
  aiConsents,
  aiQuotaBuckets,
  aiUsageLogs,
  aiWordCache,
  feedbackAttachments,
  feedbackTickets,
  inviteAccounts,
  learningRecords,
  profiles,
  syncChanges,
  syncMutations,
  userCardStates,
  userDocuments,
} from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { FeedbackService } from '../feedback/feedback.service';
import { AccountIdentityService } from './account-identity.service';

const RECENT_SOCIAL_AUTH_WINDOW_SECONDS = 10 * 60;

function sortedProviders(providers: Iterable<string>): AccountSummary['providers'] {
  const supported = new Set(['phone', 'wechat', 'apple']);
  return [...new Set(providers)]
    .filter((provider): provider is AccountSummary['providers'][number] => supported.has(provider))
    .sort((left, right) => ['phone', 'wechat', 'apple'].indexOf(left) - ['phone', 'wechat', 'apple'].indexOf(right));
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
    private readonly recentSocialAuth: RecentSocialAuthGrantService,
    private readonly sessions: SessionSecurityService,
    private readonly feedback: FeedbackService,
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
        if (isChinaMobileE164(data.user?.phone)) resolvedPhone = data.user.phone;
      }
    }
    return {
      accountId,
      phone: resolvedPhone,
      phoneBound: providers.includes('phone'),
      providers,
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
  ): Promise<UpdatePhonePasswordResponse> {
    if (!isChinaMobileE164(source.user.phone) || !source.user.providers?.includes('phone')) {
      throw new UnauthorizedException('verified_phone_required');
    }
    let isPasswordRecovery = false;
    if (currentPassword === undefined) {
      const now = Math.floor(Date.now() / 1_000);
      const recentOtp = source.authenticationMethods.some((entry) => (
        entry.method === 'otp'
        && entry.timestamp <= now + 60
        && now - entry.timestamp <= RECENT_SOCIAL_AUTH_WINDOW_SECONDS
      ));
      if (!recentOtp) throw new UnauthorizedException('phone_reauthentication_required');
      const isFirstPasswordSetup = source.passwordSet === false;
      if (!isFirstPasswordSetup && !this.phoneAuth.consumePasswordRecovery(source)) {
        throw new UnauthorizedException('phone_reauthentication_required');
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
    if (!response) throw new ServiceUnavailableException('phone_auth_unavailable');
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { code?: string; error_code?: string } | undefined;
      const code = body?.code ?? body?.error_code;
      if (code === 'weak_password') throw new HttpException('invalid_phone_password', HttpStatus.BAD_REQUEST);
      if (code === 'same_password') throw new HttpException('password_unchanged', HttpStatus.BAD_REQUEST);
      if (code === 'reauthentication_needed') throw new UnauthorizedException('phone_reauthentication_required');
      if (
        code === 'reauthentication_not_valid'
        || code === 'current_password_invalid'
        || code === 'current_password_mismatch'
        || code === 'current_password_required'
      ) throw new UnauthorizedException('invalid_phone_or_password');
      throw new ServiceUnavailableException('phone_auth_unavailable');
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
      || next.user.phone !== source.user.phone
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

  authorizePasswordRecovery(source: VerifiedAuthSession): AuthorizePasswordRecoveryResponse {
    return this.phoneAuth.authorizePasswordRecovery(source);
  }

  private createRequestAuthClient() {
    return createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async deleteAccount(userId: string) {
    const authUserIds = await this.identities.authUserIdsForAccount(userId);
    const [feedbackObjectKeys, ticketRows] = await Promise.all([
      this.feedback.userObjectKeys(userId),
      this.database.db.select({ id: feedbackTickets.id }).from(feedbackTickets).where(eq(feedbackTickets.userId, userId)),
    ]);
    await Promise.all(authUserIds.map((authUserId) => this.sessions.revokeAll(authUserId)));
    for (const authUserId of authUserIds) {
      const { error } = await this.adminAuth.auth.admin.deleteUser(authUserId, false);
      if (error) throw new Error('account_deletion_failed');
    }
    await this.database.db.transaction(async (transaction) => {
      const ticketIds = ticketRows.map((row) => row.id);
      if (ticketIds.length > 0) await transaction.delete(feedbackAttachments).where(inArray(feedbackAttachments.ticketId, ticketIds));
      await transaction.delete(feedbackTickets).where(eq(feedbackTickets.userId, userId));
      await transaction.delete(userCardStates).where(eq(userCardStates.userId, userId));
      await transaction.delete(learningRecords).where(eq(learningRecords.userId, userId));
      await transaction.delete(syncMutations).where(eq(syncMutations.userId, userId));
      await transaction.delete(userDocuments).where(eq(userDocuments.userId, userId));
      await transaction.delete(syncChanges).where(eq(syncChanges.userId, userId));
      await transaction.delete(aiConsents).where(eq(aiConsents.userId, userId));
      await transaction.delete(aiUsageLogs).where(eq(aiUsageLogs.userId, userId));
      await transaction.delete(aiQuotaBuckets).where(eq(aiQuotaBuckets.userId, userId));
      await transaction.delete(aiWordCache).where(eq(aiWordCache.userId, userId));
      await transaction.delete(profiles).where(eq(profiles.userId, userId));
      if (authUserIds.length > 0) {
        await transaction.delete(accountSessionRevocations).where(inArray(accountSessionRevocations.userId, authUserIds));
        await transaction.update(inviteAccounts)
          .set({ status: 'deleted', userId: null, deletedAt: new Date() })
          .where(inArray(inviteAccounts.userId, authUserIds));
      }
      await transaction.delete(accountIdentities).where(eq(accountIdentities.accountId, userId));
      await transaction.delete(accounts).where(eq(accounts.id, userId));
    });
    await this.feedback.removeObjects(feedbackObjectKeys).catch(() => undefined);
  }

  async mergeWithPhoneOtp(source: VerifiedAuthSession, phone: string, token: string): Promise<MergePhoneAccountResponse> {
    const recentProvider = this.assertSocialPhoneBindingAllowed(source);
    const { data, error } = await this.publicAuth.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.session || data.user?.phone !== phone) throw new UnauthorizedException('invalid_phone_otp');
    const target = await this.verifier.verify(data.session.access_token);
    await this.sessions.assertActive(target);
    try {
      if (
        recentProvider === 'wechat'
        && !this.recentSocialAuth.consume('wechat', source.authUserId, source.sessionId)
      ) throw new UnauthorizedException('recent_social_auth_required');
      const existingPhoneAccountId = await this.identities.accountIdForIdentity('phone', phone);
      let account: AccountSummary;
      if (existingPhoneAccountId) {
        target.user = await this.identities.resolve(target);
        account = await this.mergeAccounts(target, source);
      } else {
        account = await this.attachNewPhoneIdentity(source, target, phone);
      }
      return {
        account,
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
  ): Promise<AccountSummary> {
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
      if (!sourceAccount || sourceAccount.status !== 'active') throw new ConflictException('account_merge_state_changed');
      const phoneSubjectHash = this.identities.hashIdentity('phone', phone);
      const [existingPhoneIdentity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(and(
          eq(accountIdentities.provider, 'phone'),
          eq(accountIdentities.subjectHash, phoneSubjectHash),
        ))
        .limit(1);
      if (existingPhoneIdentity) throw new ConflictException('account_merge_state_changed');
      const [existingAuthIdentity] = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(eq(accountIdentities.authUserId, phoneAuthUserId))
        .limit(1);
      if (existingAuthIdentity) throw new ConflictException('account_merge_state_changed');
      await transaction.insert(accountIdentities).values({
        accountId: sourceAccountId,
        authUserId: phoneAuthUserId,
        provider: 'phone',
        subjectHash: phoneSubjectHash,
      });
      const providers = await transaction.selectDistinct({ provider: accountIdentities.provider })
        .from(accountIdentities)
        .where(eq(accountIdentities.accountId, sourceAccountId));
      return {
        accountId: sourceAccountId,
        phone,
        phoneBound: true,
        providers: sortedProviders(providers.map((row) => row.provider)),
      };
    });
  }

  async startPhoneBinding(source: VerifiedAuthSession, phone: string, sourceIp = '127.0.0.1'): Promise<StartPhoneBindingResponse> {
    this.assertSocialPhoneBindingAllowed(source);
    const phoneAuth = createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { 'Sb-Forwarded-For': sourceIp } },
    });
    const { error } = await phoneAuth.auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true,
        data: { account_type: 'native_phone_binding_target' },
      },
    });
    if (error) {
      const code = error.code?.toLowerCase();
      if (code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit') {
        throw new HttpException('phone_binding_otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new ServiceUnavailableException('phone_binding_otp_unavailable');
    }
    return { sent: true };
  }

  private assertSocialPhoneBindingAllowed(source: VerifiedAuthSession) {
    const providers = source.user.providers ?? [];
    if (providers.includes('phone')) throw new ConflictException('account_phone_identity_conflict');
    if (!providers.some((provider) => provider === 'apple' || provider === 'wechat')) {
      throw new UnauthorizedException('social_identity_required');
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
    if (
      providers.includes('wechat')
      && this.recentSocialAuth.has('wechat', source.authUserId, source.sessionId)
    ) return 'wechat' as const;
    throw new UnauthorizedException('recent_social_auth_required');
  }

  private async mergeAccounts(target: VerifiedAuthSession, source: VerifiedAuthSession): Promise<AccountSummary> {
    if (!isChinaMobileE164(target.user.phone)) throw new UnauthorizedException('verified_phone_required');
    const targetAccountId = target.user.id;
    const sourceAccountId = source.user.id;
    if (targetAccountId === sourceAccountId) return this.summary(targetAccountId, target.user.phone);
    if (!source.user.providers?.some((provider) => provider === 'apple' || provider === 'wechat')) {
      throw new UnauthorizedException('social_identity_required');
    }
    if (source.user.providers.includes('phone')) {
      throw new ConflictException('account_phone_identity_conflict');
    }

    const account = await this.database.db.transaction(async (transaction) => {
      const lockIds = [sourceAccountId, targetAccountId].sort();
      for (const accountId of lockIds) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${accountId}`}, 0))`);
      }
      await transaction.execute(sql`
        select id from accounts
        where id in (${sourceAccountId}::uuid, ${targetAccountId}::uuid)
        order by id
        for update
      `);
      const accountRows = await transaction.select({ id: accounts.id, status: accounts.status })
        .from(accounts)
        .where(inArray(accounts.id, [sourceAccountId, targetAccountId]));
      if (accountRows.length !== 2 || accountRows.some((account) => account.status !== 'active')) {
        throw new ConflictException('account_merge_state_changed');
      }
      await transaction.update(accounts)
        .set({ status: 'merging', updatedAt: new Date() })
        .where(eq(accounts.id, sourceAccountId));

      const sourceAuthUserRows = await transaction.selectDistinct({ authUserId: accountIdentities.authUserId })
        .from(accountIdentities)
        .where(eq(accountIdentities.accountId, sourceAccountId));

      const identityRows = await transaction.select({
        accountId: accountIdentities.accountId,
        provider: accountIdentities.provider,
        subjectHash: accountIdentities.subjectHash,
      }).from(accountIdentities).where(inArray(accountIdentities.accountId, [sourceAccountId, targetAccountId]));
      for (const provider of ['apple', 'wechat']) {
        const sourceSubjects = identityRows.filter((row) => row.accountId === sourceAccountId && row.provider === provider);
        const targetSubjects = identityRows.filter((row) => row.accountId === targetAccountId && row.provider === provider);
        if (sourceSubjects.some((sourceIdentity) => targetSubjects.some((targetIdentity) => targetIdentity.subjectHash !== sourceIdentity.subjectHash))) {
          throw new ConflictException('account_identity_conflict');
        }
      }

      for (const { authUserId } of sourceAuthUserRows) {
        await transaction.execute(sql`
          insert into account_session_revocations (session_id, user_id, revoked_at)
          select id, user_id, now()
          from auth.sessions
          where user_id = ${authUserId}::uuid
          on conflict (session_id) do update set revoked_at = excluded.revoked_at
        `);
      }

      await transaction.execute(sql`
        insert into user_card_states (user_id, bank_id, topic_id, card_id, state, version, updated_at)
        select ${targetAccountId}::uuid, bank_id, topic_id, card_id, state, version, updated_at
        from user_card_states where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, bank_id, topic_id, card_id) do update
        set state = excluded.state, version = excluded.version, updated_at = excluded.updated_at
        where excluded.updated_at > user_card_states.updated_at
      `);
      await transaction.execute(sql`delete from user_card_states where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into learning_records (id, user_id, client_record_id, payload, occurred_at, version, updated_at)
        select gen_random_uuid(), ${targetAccountId}::uuid, client_record_id, payload, occurred_at, version, updated_at
        from learning_records where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, client_record_id) do update
        set payload = excluded.payload, occurred_at = excluded.occurred_at, version = excluded.version,
            updated_at = excluded.updated_at
        where excluded.updated_at > learning_records.updated_at
      `);
      await transaction.execute(sql`delete from learning_records where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into sync_mutations (user_id, mutation_id, kind, payload_hash, result, created_at)
        select ${targetAccountId}::uuid, mutation_id, kind, payload_hash, result, created_at
        from sync_mutations where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, mutation_id) do nothing
      `);
      await transaction.execute(sql`delete from sync_mutations where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into user_documents (user_id, document_key, payload, version, updated_at)
        select ${targetAccountId}::uuid, document_key, payload, version, updated_at
        from user_documents where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, document_key) do update
        set payload = excluded.payload, version = excluded.version, updated_at = excluded.updated_at
        where excluded.updated_at > user_documents.updated_at
      `);
      await transaction.execute(sql`delete from user_documents where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`update sync_changes set user_id = ${targetAccountId}::uuid where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into ai_consents (user_id, policy_version, accepted_at, updated_at)
        select ${targetAccountId}::uuid, policy_version, accepted_at, updated_at
        from ai_consents where user_id = ${sourceAccountId}::uuid
        on conflict (user_id) do update
        set policy_version = excluded.policy_version, accepted_at = excluded.accepted_at,
            updated_at = excluded.updated_at
        where excluded.updated_at > ai_consents.updated_at
      `);
      await transaction.execute(sql`delete from ai_consents where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        update ai_usage_logs set user_id = ${targetAccountId}::uuid
        where user_id = ${sourceAccountId}::uuid and not exists (
          select 1 from ai_usage_logs target
          where target.user_id = ${targetAccountId}::uuid
            and target.request_id = ai_usage_logs.request_id
            and target.capability = ai_usage_logs.capability
        )
      `);
      await transaction.execute(sql`delete from ai_usage_logs where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into ai_quota_buckets (user_id, bucket_date, used_units, updated_at)
        select ${targetAccountId}::uuid, bucket_date, used_units, updated_at
        from ai_quota_buckets where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, bucket_date) do update
        set used_units = ai_quota_buckets.used_units + excluded.used_units,
            updated_at = greatest(ai_quota_buckets.updated_at, excluded.updated_at)
      `);
      await transaction.execute(sql`delete from ai_quota_buckets where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        insert into ai_word_cache (user_id, query_hash, result, created_at, expires_at)
        select ${targetAccountId}::uuid, query_hash, result, created_at, expires_at
        from ai_word_cache where user_id = ${sourceAccountId}::uuid
        on conflict (user_id, query_hash) do update
        set result = excluded.result, created_at = excluded.created_at, expires_at = excluded.expires_at
        where excluded.created_at > ai_word_cache.created_at
      `);
      await transaction.execute(sql`delete from ai_word_cache where user_id = ${sourceAccountId}::uuid`);
      await transaction.execute(sql`
        update feedback_tickets set client_submission_id = gen_random_uuid()
        where user_id = ${sourceAccountId}::uuid and exists (
          select 1 from feedback_tickets target
          where target.user_id = ${targetAccountId}::uuid
            and target.client_submission_id = feedback_tickets.client_submission_id
        )
      `);
      await transaction.execute(sql`update feedback_tickets set user_id = ${targetAccountId}::uuid where user_id = ${sourceAccountId}::uuid`);

      await transaction.update(accountIdentities)
        .set({ accountId: targetAccountId, lastUsedAt: new Date() })
        .where(eq(accountIdentities.accountId, sourceAccountId));
      await transaction.insert(accountMerges).values({
        initiatedByAuthUserId: target.authUserId,
        sourceAccountId,
        targetAccountId,
      });
      await transaction.update(accounts).set({
        mergedIntoAccountId: targetAccountId,
        sessionsRevokedAt: new Date(),
        status: 'merged',
        updatedAt: new Date(),
      }).where(eq(accounts.id, sourceAccountId));
      await transaction.delete(profiles).where(eq(profiles.userId, sourceAccountId));
      const providers = await transaction.selectDistinct({ provider: accountIdentities.provider })
        .from(accountIdentities)
        .where(eq(accountIdentities.accountId, targetAccountId));
      return {
        accountId: targetAccountId,
        phone: target.user.phone,
        phoneBound: true,
        providers: sortedProviders(providers.map((row) => row.provider)),
      };
    });

    await this.adminAuth.auth.admin.signOut(source.accessToken, 'global').catch(() => undefined);
    return account;
  }
}
