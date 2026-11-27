import { randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { BindAppleLoginMethodRequest, BindWechatLoginMethodRequest, LoginMethodActionPurpose, LoginMethodChangeResponse, NativeAuthIdentityProvider } from '@icao/contracts/native-auth';
import { and, eq, or, sql } from 'drizzle-orm';

import { AUTH_VERIFIER, type AuthVerifier, type VerifiedAuthSession } from '../auth/auth.types';
import { RecentAuthService } from '../auth/recent-auth.service';
import { SessionSecurityService } from '../auth/session-security.service';
import { WechatAuthService } from '../auth/wechat-auth.service';
import { DatabaseService } from '../database/database.service';
import { accountIdentities, accountLoginMethodRemovals, accounts } from '../database/schema';
import { ACCOUNT_AUTH_ADMIN, type AccountAuthAdmin } from './account-auth-admin';
import { AccountIdentityService } from './account-identity.service';

type Provider = 'apple' | 'wechat';
type IdentityProof = { authUserId: string; provider: Provider; subject: string };
const APPLE_RECENT_SECONDS = 10 * 60;

@Injectable()
export class AccountLoginMethodsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountLoginMethodsService.name);
  private retryTimer?: ReturnType<typeof setInterval>;
  private retrying = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly identities: AccountIdentityService,
    private readonly recentAuth: RecentAuthService,
    private readonly sessions: SessionSecurityService,
    private readonly wechat: WechatAuthService,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    @Inject(ACCOUNT_AUTH_ADMIN) private readonly authAdmin: AccountAuthAdmin,
  ) {}

  onModuleInit() {
    this.retryTimer = setInterval(() => { void this.retryRemovals(); }, 30_000);
    this.retryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  async verifyAppleProof(providerAccessToken: string, now = new Date()) {
    // The transient Apple session never passes through account resolution: a
    // binding proof must not auto-register a second business account.
    const proof = await this.verifier.verify(providerAccessToken);
    await this.sessions.assertActive(proof);
    const appleIdentities = proof.identities.filter(({ provider }) => provider === 'apple');
    const latestOauth = Math.max(0, ...proof.authenticationMethods.filter(({ method, provider }) => (
      method === 'oauth' && (!provider || provider === 'apple')
    )).map(({ timestamp }) => timestamp));
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (
      appleIdentities.length !== 1
      || latestOauth > nowSeconds + 30
      || nowSeconds - latestOauth > APPLE_RECENT_SECONDS
    ) throw new ForbiddenException('apple_reauthentication_required');
    return { proof, identity: { authUserId: proof.authUserId, provider: 'apple' as const, subject: appleIdentities[0]!.subject } };
  }

  async verifiedBoundApple(source: VerifiedAuthSession, providerAccessToken: string) {
    const { proof, identity } = await this.verifyAppleProof(providerAccessToken);
    const [bound] = await this.database.db.select({ id: accountIdentities.id }).from(accountIdentities).where(and(
      eq(accountIdentities.accountId, source.user.id),
      eq(accountIdentities.authUserId, identity.authUserId),
      eq(accountIdentities.provider, 'apple'),
      eq(accountIdentities.subjectHash, this.identities.hashIdentity('apple', identity.subject)),
    )).limit(1);
    if (!bound) throw new ForbiddenException('apple_reauthentication_required');
    return { ...proof, user: { ...proof.user, id: source.user.id, providers: source.user.providers } };
  }

  async bindApple(source: VerifiedAuthSession, input: BindAppleLoginMethodRequest) {
    const { proof, identity } = await this.verifyAppleProof(input.providerAccessToken);
    // New methods use one provider per authentication principal. Do not
    // accidentally inherit another provider auto-linked by the auth server.
    if (proof.user.phone || proof.identities.some(({ provider }) => provider === 'phone' || provider === 'wechat')) {
      throw new ConflictException('login_method_already_owned');
    }
    return this.attach(source, identity, input.recentAuthGrantId, 'apple_binding');
  }

  startWechatBinding(source: VerifiedAuthSession, sourceIp: string) {
    return this.wechat.startIdentityBinding(source, sourceIp);
  }

  async bindWechat(source: VerifiedAuthSession, input: BindWechatLoginMethodRequest, sourceIp: string) {
    const identity = await this.wechat.verifyIdentityBinding(source, input, sourceIp);
    return this.attach(source, identity, input.recentAuthGrantId, 'wechat_binding');
  }

  private async attach(source: VerifiedAuthSession, identity: IdentityProof, grantId: string, purpose: LoginMethodActionPurpose): Promise<LoginMethodChangeResponse> {
    const result = await this.database.db.transaction(async (tx) => {
      // Same lock order as AccountIdentityService.resolve, including competing logins.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth:${identity.authUserId}`}, 0))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${source.user.id}`}, 0))`);
      const [account] = await tx.select({ status: accounts.status, sessionsRevokedAt: accounts.sessionsRevokedAt }).from(accounts).where(eq(accounts.id, source.user.id)).limit(1);
      if (account?.status !== 'active') throw new ForbiddenException('account_not_active');
      if (account.sessionsRevokedAt && source.issuedAt <= Math.floor(account.sessionsRevokedAt.getTime() / 1_000)) {
        throw new ForbiddenException('session_revoked');
      }
      const [sourceIdentity] = await tx.select({ id: accountIdentities.id }).from(accountIdentities).where(and(
        eq(accountIdentities.accountId, source.user.id), eq(accountIdentities.authUserId, source.authUserId),
      )).limit(1);
      if (!sourceIdentity) throw new ForbiddenException('session_revoked');
      await this.recentAuth.consumeInTransaction(tx, source, grantId, purpose);
      const subjectHash = this.identities.hashIdentity(identity.provider, identity.subject);
      const occupied = await tx.select({ id: accountIdentities.id }).from(accountIdentities).where(or(
        eq(accountIdentities.authUserId, identity.authUserId),
        and(eq(accountIdentities.provider, identity.provider), eq(accountIdentities.subjectHash, subjectHash)),
        and(eq(accountIdentities.accountId, source.user.id), eq(accountIdentities.provider, identity.provider)),
      )).limit(1);
      const [removed] = await tx.select({ id: accountLoginMethodRemovals.id }).from(accountLoginMethodRemovals)
        .where(eq(accountLoginMethodRemovals.authUserId, identity.authUserId)).limit(1);
      // Return a value so the one-use source grant is consumed even on conflict.
      if (occupied.length || removed) return undefined;
      await tx.insert(accountIdentities).values({
        accountId: source.user.id, authUserId: identity.authUserId, provider: identity.provider, subjectHash,
      });
      await this.identities.claimLifetimeTrialInTransaction(tx, [identity], source.user.id, new Date(), false);
      const rows = await tx.selectDistinct({ provider: accountIdentities.provider }).from(accountIdentities)
        .where(eq(accountIdentities.accountId, source.user.id));
      return rows.map(({ provider }) => provider as NativeAuthIdentityProvider);
    });
    if (!result) throw new ConflictException('login_method_already_owned');
    return { accountId: source.user.id, providers: result, sessionEnded: false };
  }

  async unbind(source: VerifiedAuthSession, provider: Provider, grantId: string): Promise<LoginMethodChangeResponse> {
    const [candidate] = await this.database.db.select({ authUserId: accountIdentities.authUserId })
      .from(accountIdentities).where(and(eq(accountIdentities.accountId, source.user.id), eq(accountIdentities.provider, provider))).limit(1);
    if (!candidate) throw new ConflictException('login_method_not_bound');
    const removal = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth:${candidate.authUserId}`}, 0))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${source.user.id}`}, 0))`);
      const [account] = await tx.select({ status: accounts.status, sessionsRevokedAt: accounts.sessionsRevokedAt }).from(accounts).where(eq(accounts.id, source.user.id)).limit(1);
      if (account?.status !== 'active') throw new ForbiddenException('account_not_active');
      if (account.sessionsRevokedAt && source.issuedAt <= Math.floor(account.sessionsRevokedAt.getTime() / 1_000)) {
        throw new ForbiddenException('session_revoked');
      }
      const [sourceIdentity] = await tx.select({ id: accountIdentities.id }).from(accountIdentities).where(and(
        eq(accountIdentities.accountId, source.user.id), eq(accountIdentities.authUserId, source.authUserId),
      )).limit(1);
      if (!sourceIdentity) throw new ForbiddenException('session_revoked');
      const identities = await tx.select().from(accountIdentities).where(eq(accountIdentities.accountId, source.user.id));
      const target = identities.find((identity) => identity.provider === provider && identity.authUserId === candidate.authUserId);
      if (!target) throw new ConflictException('login_method_not_bound');
      const remaining = identities.filter(({ id }) => id !== target.id);
      if (!remaining.length) throw new ConflictException('last_login_method_required');
      // Older shared principals need the provider's unlink API, not deletion of
      // a principal still needed by another method. New bindings never create this state.
      if (remaining.some(({ authUserId }) => authUserId === target.authUserId)) {
        throw new ConflictException('login_method_shared_principal');
      }
      const otherOwners = await tx.select({ id: accountIdentities.id }).from(accountIdentities).where(and(
        eq(accountIdentities.authUserId, target.authUserId), sql`${accountIdentities.accountId} <> ${source.user.id}::uuid`,
      )).limit(1);
      if (otherOwners.length) throw new ConflictException('login_method_shared_principal');
      await this.recentAuth.consumeInTransaction(tx, source, grantId, `${provider}_unbinding`);
      const id = randomUUID();
      await tx.insert(accountLoginMethodRemovals).values({
        id, accountId: source.user.id, authUserId: target.authUserId, provider, status: 'pending',
      });
      await this.sessions.revokeAllInTransaction(tx, target.authUserId);
      await tx.delete(accountIdentities).where(eq(accountIdentities.id, target.id));
      return { id, authUserId: target.authUserId, providers: remaining.map(({ provider: value }) => value as NativeAuthIdentityProvider) };
    });
    // The local identity and all its old sessions are already fenced. A provider
    // outage cannot undo the unlink or grant access to this business account.
    await this.completeIdentityRemoval(removal.id, removal.authUserId);
    return { accountId: source.user.id, providers: removal.providers, sessionEnded: source.authUserId === removal.authUserId };
  }

  async completeIdentityRemoval(id: string, authUserId: string) {
    await this.finishRemoval(id, authUserId).catch(() => {
      this.logger.warn('login_method_auth_cleanup_pending');
    });
  }

  private async finishRemoval(id: string, authUserId: string) {
    await this.authAdmin.deleteUser(authUserId);
    await this.database.db.update(accountLoginMethodRemovals).set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(accountLoginMethodRemovals.id, id), eq(accountLoginMethodRemovals.authUserId, authUserId), eq(accountLoginMethodRemovals.status, 'pending')));
  }

  async retryRemovals() {
    if (this.retrying) return;
    this.retrying = true;
    try {
      const pending = await this.database.db.select({ id: accountLoginMethodRemovals.id, authUserId: accountLoginMethodRemovals.authUserId })
        .from(accountLoginMethodRemovals).where(eq(accountLoginMethodRemovals.status, 'pending')).limit(20);
      for (const row of pending) await this.finishRemoval(row.id, row.authUserId).catch(() => {
        this.logger.warn('login_method_auth_cleanup_pending');
      });
    } catch { this.logger.warn('login_method_cleanup_retry_unavailable'); }
    finally { this.retrying = false; }
  }
}
