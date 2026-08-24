import { createHmac } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthIdentityProvider, AuthenticatedUser } from '@icao/contracts';
import { isChinaMobileE164 } from '@icao/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { VerifiedAuthSession } from '../auth/auth.types';
import { API_CONFIG, type ApiConfig } from '../config';
import { accountIdentities, accounts, profiles } from '../database/schema';
import { DatabaseService } from '../database/database.service';

type IdentityCandidate = {
  provider: AuthIdentityProvider;
  subject: string;
};

const SUPPORTED_PROVIDERS = new Set<AuthIdentityProvider>(['phone', 'apple']);

@Injectable()
export class AccountIdentityService {
  private readonly hashKey: string;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly database: DatabaseService,
  ) {
    this.hashKey = config.accountIdentityHashSecret;
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
    const candidateHashes = candidates.map((candidate) => ({
      ...candidate,
        hash: this.hashIdentity(candidate.provider, candidate.subject),
    }));

    const accountId = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth:${auth.authUserId}`}, 0))`);

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
      if (linkedAccounts.length === 0 && candidateHashes.length === 0) {
        throw new UnauthorizedException('unsupported_auth_identity');
      }

      const resolvedAccountId = linkedAccounts[0] ?? auth.authUserId;
      await transaction.insert(accounts).values({ id: resolvedAccountId })
        .onConflictDoNothing({ target: accounts.id });
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

  async providersForAccount(accountId: string): Promise<AuthIdentityProvider[]> {
    const rows = await this.database.db.selectDistinct({ provider: accountIdentities.provider })
      .from(accountIdentities)
      .where(eq(accountIdentities.accountId, accountId));
    return rows
      .map((row) => row.provider)
      .filter((provider): provider is AuthIdentityProvider => SUPPORTED_PROVIDERS.has(provider as AuthIdentityProvider))
      .sort((left, right) => ['phone', 'apple'].indexOf(left) - ['phone', 'apple'].indexOf(right));
  }

  async authUserIdsForAccount(accountId: string) {
    const rows = await this.database.db.selectDistinct({ authUserId: accountIdentities.authUserId })
      .from(accountIdentities)
      .where(eq(accountIdentities.accountId, accountId));
    return rows.map((row) => row.authUserId);
  }
}
