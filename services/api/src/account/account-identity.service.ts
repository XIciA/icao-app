import { createHmac } from 'node:crypto';

import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { isChinaMobileE164 } from '@icao/contracts';
import type { NativeAuthenticatedUser as AuthenticatedUser, NativeAuthIdentityProvider as AuthIdentityProvider } from '@icao/contracts/native-auth';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { VerifiedAuthSession } from '../auth/auth.types';
import { API_CONFIG, type ApiConfig } from '../config';
import { accountIdentities, accountLoginMethodRemovals, accounts, lifetimeIdentityBenefitClaims, profiles, syncChanges, userDocuments } from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { PersistentCommerceBenefitsService } from '../commerce/persistent-commerce-benefits.service';
import { IdentityDigestService } from './identity-digest.service';
import { createDefaultAccountProfile } from './default-account-profile';

export type IdentityCandidate = {
  provider: AuthIdentityProvider;
  subject: string;
};

const SUPPORTED_PROVIDERS = new Set<AuthIdentityProvider>(['phone', 'apple', 'wechat']);
const FREE_TRIAL_BENEFIT_KEY = 'free-trial-100-v1';

@Injectable()
export class AccountIdentityService {
  private readonly commerce: PersistentCommerceBenefitsService;
  private readonly digests: IdentityDigestService;
  private readonly hashKey: string;

  constructor(
    @Inject(API_CONFIG) config: Pick<ApiConfig, 'accountIdentityHashSecret'>,
    private readonly database: DatabaseService,
    @Optional() digests?: IdentityDigestService,
    @Optional() commerce?: PersistentCommerceBenefitsService,
  ) {
    this.hashKey = config.accountIdentityHashSecret;
    this.digests = digests ?? new IdentityDigestService(config);
    this.commerce = commerce ?? new PersistentCommerceBenefitsService();
  }

  hashIdentity(provider: AuthIdentityProvider, subject: string) {
    return createHmac('sha256', this.hashKey)
      .update(`account-identity-v1\0${provider}\0${subject}`)
      .digest('hex');
  }

  async accountIdForIdentity(provider: AuthIdentityProvider, subject: string) {
    const [identity] = await this.database.db.select({ accountId: accountIdentities.accountId })
      .from(accountIdentities)
      .where(and(
        eq(accountIdentities.provider, provider),
        eq(accountIdentities.subjectHash, this.hashIdentity(provider, subject)),
      ))
      .limit(1);
    return identity?.accountId;
  }

  private candidates(auth: VerifiedAuthSession): IdentityCandidate[] {
    const result = new Map<string, IdentityCandidate>();
    if (isChinaMobileE164(auth.user.phone)) {
      result.set(`phone:${auth.user.phone}`, { provider: 'phone', subject: auth.user.phone });
    }
    for (const identity of auth.identities) {
      if (!SUPPORTED_PROVIDERS.has(identity.provider as AuthIdentityProvider)) continue;
      const provider = identity.provider as AuthIdentityProvider;
      if (provider === 'phone') continue;
      result.set(`${provider}:${identity.subject}`, { provider, subject: identity.subject });
    }
    return [...result.values()];
  }

  async resolve(auth: VerifiedAuthSession): Promise<AuthenticatedUser> {
    const candidates = this.candidates(auth);
    if (candidates.length === 0) {
      throw new UnauthorizedException('unsupported_auth_identity');
    }
    const candidateHashes = candidates.map((candidate) => ({
      ...candidate,
      hash: this.hashIdentity(candidate.provider, candidate.subject),
    }));

    const accountId = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth:${auth.authUserId}`}, 0))`);

      const [removed] = await transaction.select({ id: accountLoginMethodRemovals.id })
        .from(accountLoginMethodRemovals).where(eq(accountLoginMethodRemovals.authUserId, auth.authUserId)).limit(1);
      if (removed) throw new UnauthorizedException('login_method_unlinked');

      // Correct only the old verified Apple row-UUID representation. This is
      // a key repair for the exact same principal, never an ownership merge.
      for (const identity of auth.identities) {
        if (identity.provider !== 'apple' || !identity.legacySubject || identity.legacySubject === identity.subject) continue;
        await transaction.update(accountIdentities).set({ subjectHash: this.hashIdentity('apple', identity.subject) }).where(and(
          eq(accountIdentities.authUserId, auth.authUserId), eq(accountIdentities.provider, 'apple'),
          eq(accountIdentities.subjectHash, this.hashIdentity('apple', identity.legacySubject)),
        ));
      }

      const byAuthUser = await transaction.select({ accountId: accountIdentities.accountId })
        .from(accountIdentities)
        .where(eq(accountIdentities.authUserId, auth.authUserId));
      const hashes = candidateHashes.map((candidate) => candidate.hash);
      const bySubject = hashes.length === 0
        ? []
        : await transaction.select({ accountId: accountIdentities.accountId })
          .from(accountIdentities)
          .where(inArray(accountIdentities.subjectHash, hashes));
      const linkedAccounts = [...new Set([...byAuthUser, ...bySubject].map((row) => row.accountId))];
      if (linkedAccounts.length > 1) throw new UnauthorizedException('identity_account_conflict');

      const resolvedAccountId = linkedAccounts[0] ?? auth.authUserId;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`account:${resolvedAccountId}`}, 0))`);
      const [createdAccount] = await transaction.insert(accounts).values({ id: resolvedAccountId })
        .onConflictDoNothing({ target: accounts.id }).returning({ id: accounts.id });
      const [account] = await transaction.select({
        sessionsRevokedAt: accounts.sessionsRevokedAt,
        status: accounts.status,
      })
        .from(accounts)
        .where(eq(accounts.id, resolvedAccountId))
        .limit(1);
      if (!account || account.status !== 'active') throw new UnauthorizedException('account_not_active');
      if (account.sessionsRevokedAt && auth.issuedAt <= Math.floor(account.sessionsRevokedAt.getTime() / 1_000)) {
        throw new UnauthorizedException('session_revoked');
      }

      await transaction.insert(profiles).values({ userId: resolvedAccountId })
        .onConflictDoNothing({ target: profiles.userId });
      if (createdAccount) {
        const document = createDefaultAccountProfile();
        const updatedAt = new Date();
        await transaction.insert(userDocuments).values({
          userId: resolvedAccountId, documentKey: 'account_profile', payload: document, version: 1, updatedAt,
        });
        await transaction.insert(syncChanges).values({
          userId: resolvedAccountId, kind: 'document', entityKey: 'account_profile', version: 1,
          payload: { documentKey: 'account_profile', document, version: 1, updatedAt: updatedAt.toISOString() },
        });
      }
      for (const candidate of candidateHashes) {
        await transaction.insert(accountIdentities).values({
          accountId: resolvedAccountId,
          authUserId: auth.authUserId,
          provider: candidate.provider,
          subjectHash: candidate.hash,
        }).onConflictDoNothing();
      }

      const finalLinks = await transaction.select({
        accountId: accountIdentities.accountId,
        provider: accountIdentities.provider,
        subjectHash: accountIdentities.subjectHash,
      })
        .from(accountIdentities)
        .where(eq(accountIdentities.authUserId, auth.authUserId));
      if (
        finalLinks.length === 0
        || finalLinks.some((row) => row.accountId !== resolvedAccountId)
        || candidateHashes.some((candidate) => !finalLinks.some((link) => (
          link.provider === candidate.provider
          && link.subjectHash === candidate.hash
        )))
      ) {
        throw new UnauthorizedException('identity_account_conflict');
      }
      await this.claimLifetimeTrialInTransaction(transaction, candidates, resolvedAccountId, new Date());
      await transaction.update(accountIdentities)
        .set({ lastUsedAt: new Date() })
        .where(eq(accountIdentities.authUserId, auth.authUserId));
      return resolvedAccountId;
    });

    const providers = await this.providersForAccount(accountId);
    return {
      id: accountId,
      authUserId: auth.authUserId,
      email: auth.user.email,
      phone: auth.user.phone,
      providers,
    };
  }

  async claimLifetimeTrialInTransaction(
    transaction: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    candidates: IdentityCandidate[],
    accountId: string,
    claimedAt: Date,
    grantIfAllNew = true,
  ) {
    const aliases = [...new Map(candidates.flatMap((candidate) => (
      this.digests.candidates('lifetime-benefit-v1', candidate.provider, candidate.subject)
        .map(({ digest, version }) => ({
          benefitKey: FREE_TRIAL_BENEFIT_KEY,
          claimContextDigest: this.digests.accountContext(accountId),
          digestKeyVersion: version,
          identityDigest: digest,
          provider: candidate.provider,
          claimedAt,
        }))
    )).map((alias) => [`${alias.benefitKey}:${alias.identityDigest}`, alias])).values()];
    for (const digest of aliases.map(({ identityDigest }) => identityDigest).sort()) {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`lifetime-benefit:${digest}`}, 0))`);
    }
    const inserted = await transaction.insert(lifetimeIdentityBenefitClaims).values(aliases)
      .onConflictDoNothing()
      .returning({ identityDigest: lifetimeIdentityBenefitClaims.identityDigest });
    if (!grantIfAllNew || inserted.length !== aliases.length) return;
    await this.commerce.grantFreeTrial(transaction, {
      accountId,
      externalEligibilityClaimed: true,
      grantedAt: claimedAt,
    });
  }

  async providersForAccount(accountId: string): Promise<AuthIdentityProvider[]> {
    const rows = await this.database.db.selectDistinct({ provider: accountIdentities.provider })
      .from(accountIdentities)
      .where(eq(accountIdentities.accountId, accountId));
    return rows
      .map((row) => row.provider)
      .filter((provider): provider is AuthIdentityProvider => SUPPORTED_PROVIDERS.has(provider as AuthIdentityProvider))
      .sort((left, right) => ['phone', 'apple', 'wechat'].indexOf(left) - ['phone', 'apple', 'wechat'].indexOf(right));
  }

  async authUserIdsForAccount(accountId: string) {
    const rows = await this.database.db.selectDistinct({ authUserId: accountIdentities.authUserId })
      .from(accountIdentities)
      .where(eq(accountIdentities.accountId, accountId));
    return rows.map((row) => row.authUserId);
  }
}
