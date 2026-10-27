import { createHmac } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AccountIdentityService } from '../src/account/account-identity.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import { accounts, userDocuments, syncChanges } from '../src/database/schema';

const hashSecret = 'test-account-identity-hash-secret-at-least-32-bytes';

const config = {
  accountIdentityHashSecret: hashSecret,
  inviteAuthSecret: 'different-test-invite-auth-secret-at-least-32-bytes',
} as ApiConfig;

type FluentQuery<T> = {
  from: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  then: Promise<T>['then'];
  values: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

type RecordedMutation = {
  kind: 'insert' | 'update';
  set?: unknown;
  table: unknown;
  values?: unknown;
};

function fluent<T>(result: T): FluentQuery<T> {
  const query = {} as FluentQuery<T>;
  const then: Promise<T>['then'] = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  Object.assign(query, {
    from: vi.fn(() => query),
    limit: vi.fn(() => query),
    onConflictDoNothing: vi.fn(() => query),
    returning: vi.fn(() => {
      const values = (query as unknown as { recordedValues?: unknown }).recordedValues;
      const rows = (Array.isArray(values) ? values : [values])
        .filter((value): value is { identityDigest: string } => Boolean(
          value && typeof value === 'object' && 'identityDigest' in value,
        ))
        .map(({ identityDigest }) => ({ identityDigest }));
      return Promise.resolve(rows);
    }),
    set: vi.fn(() => query),
    then,
    values: vi.fn(() => query),
    where: vi.fn(() => query),
  });
  return query;
}

function mutationQuery(record: RecordedMutation) {
  const query = fluent(undefined);
  query.values.mockImplementation((values: unknown) => {
    record.values = values;
    (query as unknown as { recordedValues?: unknown }).recordedValues = values;
    return query;
  });
  query.set.mockImplementation((set: unknown) => {
    record.set = set;
    return query;
  });
  return query;
}

function databaseFixture(options: {
  accountCreated?: boolean;
  distinctSelects?: unknown[][];
  transactionSelects?: unknown[][];
}) {
  const transactionSelects = [[], ...(options.transactionSelects ?? [])];
  const distinctSelects = [...(options.distinctSelects ?? [])];
  const mutations: RecordedMutation[] = [];
  const transaction = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn((table: unknown) => {
      const record: RecordedMutation = { kind: 'insert', table };
      mutations.push(record);
      const query = mutationQuery(record);
      if (table === accounts) query.returning.mockResolvedValue(options.accountCreated ? [{ id: 'new-account' }] : []);
      return query;
    }),
    select: vi.fn(() => fluent(transactionSelects.shift() ?? [])),
    update: vi.fn((table: unknown) => {
      const record: RecordedMutation = { kind: 'update', table };
      mutations.push(record);
      return mutationQuery(record);
    }),
  };
  const db = {
    selectDistinct: vi.fn(() => fluent(distinctSelects.shift() ?? [])),
    transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)),
  };
  return {
    database: { db } as unknown as DatabaseService,
    db,
    mutations,
    transaction,
  };
}

function authSession(overrides: Partial<VerifiedAuthSession> = {}): VerifiedAuthSession {
  return {
    accessToken: 'access-token',
    authenticationMethods: [{ method: 'otp', timestamp: 1_800_000_000 }],
    authUserId: '11111111-1111-4111-8111-111111111111',
    identities: [],
    issuedAt: 1_800_000_000,
    sessionId: 'session-1',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      phone: '+8613800138000',
      providers: ['phone'],
    },
    ...overrides,
  };
}

function identityHash(provider: 'apple' | 'phone' | 'wechat', subject: string) {
  return createHmac('sha256', hashSecret)
    .update(`account-identity-v1\0${provider}\0${subject}`)
    .digest('hex');
}

describe('AccountIdentityService', () => {
  it('seeds only a newly created account with one editable, synced pilot nickname', async () => {
    const auth = authSession();
    const fixture = databaseFixture({
      accountCreated: true,
      distinctSelects: [[{ provider: 'phone' }]],
      transactionSelects: [[], [], [{ sessionsRevokedAt: null, status: 'active' }], [{
        accountId: auth.authUserId, provider: 'phone', subjectHash: identityHash('phone', '+8613800138000'),
      }]],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);
    await service.resolve(auth);
    const document = fixture.mutations.find((row) => row.table === userDocuments)?.values as { payload: { displayName: string } };
    expect(document).toEqual(expect.objectContaining({
      documentKey: 'account_profile', userId: auth.authUserId, version: 1,
      payload: { displayName: expect.stringMatching(/^飞行员(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{4}$/u), avatarUri: null, target: 'icao4-first', studyScope: 'selected', studySetup: 'pending' },
    }));
    expect(fixture.mutations.find((row) => row.table === syncChanges)?.values).toEqual(expect.objectContaining({
      entityKey: 'account_profile', kind: 'document', userId: auth.authUserId,
      payload: expect.objectContaining({ document: document.payload, version: 1 }),
    }));
  });
  it('lazily creates the permanent account and hashed phone identity for a legacy phone session', async () => {
    const auth = authSession();
    const fixture = databaseFixture({
      distinctSelects: [[{ provider: 'phone' }]],
      transactionSelects: [
        [],
        [],
        [{ sessionsRevokedAt: null, status: 'active' }],
        [{
          accountId: auth.authUserId,
          provider: 'phone',
          subjectHash: identityHash('phone', '+8613800138000'),
        }],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    const resolved = await service.resolve(auth);

    expect(resolved).toEqual({
      authUserId: auth.authUserId,
      email: undefined,
      id: auth.authUserId,
      phone: '+8613800138000',
      providers: ['phone'],
    });
    expect(fixture.mutations.slice(0, 3).map((entry) => entry.values)).toEqual([
      { id: auth.authUserId },
      { userId: auth.authUserId },
      {
        accountId: auth.authUserId,
        authUserId: auth.authUserId,
        provider: 'phone',
        subjectHash: identityHash('phone', '+8613800138000'),
      },
    ]);
    expect(JSON.stringify(fixture.mutations.map((entry) => ({
      set: entry.set,
      values: entry.values,
    })))).not.toContain('+8613800138000');
    expect(fixture.mutations.some((entry) => entry.table === userDocuments || entry.table === syncChanges)).toBe(false);
  });

  it('fails closed when a new auth user presents an Apple subject already owned by another auth user', async () => {
    const accountId = '22222222-2222-4222-8222-222222222222';
    const auth = authSession({
      authUserId: '33333333-3333-4333-8333-333333333333',
      identities: [{ provider: 'apple', subject: 'stable-apple-subject' }],
      user: {
        id: '33333333-3333-4333-8333-333333333333',
        providers: ['apple'],
      },
    });
    const fixture = databaseFixture({
      transactionSelects: [
        [],
        [{ accountId }],
        [{ sessionsRevokedAt: null, status: 'active' }],
        [],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'identity_account_conflict');
    expect(fixture.mutations.find((entry) => (
      entry.values as { provider?: string } | undefined
    )?.provider === 'apple')?.values).toEqual({
      accountId,
      authUserId: auth.authUserId,
      provider: 'apple',
      subjectHash: identityHash('apple', 'stable-apple-subject'),
    });
    expect(fixture.db.selectDistinct).not.toHaveBeenCalled();
  });

  it.each([
    {
      identity: { provider: 'phone', subject: '+8613800138000' },
      provider: 'phone' as const,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        phone: '+8613800138000',
        providers: ['phone'] as const,
      },
    },
    {
      identity: { provider: 'apple', subject: 'stable-apple-subject' },
      provider: 'apple' as const,
      user: {
        email: 'private@privaterelay.appleid.com',
        id: '11111111-1111-4111-8111-111111111111',
        providers: ['apple'] as const,
      },
    },
  ])('reuses a historical $provider identity and refreshes its usage', async ({ identity, provider, user }) => {
    const accountId = '22222222-2222-4222-8222-222222222222';
    const auth = authSession({
      identities: [identity],
      user: { ...user, providers: [...user.providers] },
    });
    const hash = identityHash(provider, identity.subject);
    const fixture = databaseFixture({
      distinctSelects: [[{ provider }, { provider: 'wechat' }]],
      transactionSelects: [
        [{ accountId }],
        [{ accountId }],
        [{ sessionsRevokedAt: null, status: 'active' }],
        [{ accountId, provider, subjectHash: hash }],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth)).resolves.toEqual(expect.objectContaining({
      authUserId: auth.authUserId,
      id: accountId,
      providers: provider === 'phone' ? ['phone', 'wechat'] : ['apple', 'wechat'],
    }));
    expect(fixture.mutations).toContainEqual(expect.objectContaining({
      kind: 'update',
      set: { lastUsedAt: expect.any(Date) },
    }));
  });

  it('fails closed when a phone auth user changes numbers outside the protected binding flow', async () => {
    const auth = authSession({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        phone: '+8613900139000',
        providers: ['phone'],
      },
    });
    const fixture = databaseFixture({
      transactionSelects: [
        [{ accountId: auth.authUserId }],
        [],
        [{ sessionsRevokedAt: null, status: 'active' }],
        [{
          accountId: auth.authUserId,
          provider: 'phone',
          subjectHash: identityHash('phone', '+8613800138000'),
        }],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'identity_account_conflict');
    expect(fixture.db.selectDistinct).not.toHaveBeenCalled();
  });

  it('fails closed when the auth user and supplied identities point at different accounts', async () => {
    const auth = authSession({
      identities: [{ provider: 'apple', subject: 'conflicting-apple-subject' }],
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        phone: '+8613800138000',
        providers: ['phone', 'apple'],
      },
    });
    const fixture = databaseFixture({
      transactionSelects: [
        [{ accountId: '11111111-1111-4111-8111-111111111111' }],
        [{ accountId: '22222222-2222-4222-8222-222222222222' }],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'identity_account_conflict');
    expect(fixture.mutations).toHaveLength(0);
    expect(fixture.db.selectDistinct).not.toHaveBeenCalled();
  });

  it('rejects unsupported email-only sessions without creating a second account system', async () => {
    const auth = authSession({
      identities: [{ provider: 'email', subject: 'person@example.com' }],
      user: {
        email: 'person@example.com',
        id: '11111111-1111-4111-8111-111111111111',
      },
    });
    const fixture = databaseFixture({ transactionSelects: [[]] });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'unsupported_auth_identity');
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    expect(fixture.mutations).toHaveLength(0);
  });

  it('resolves an existing WeChat identity to the same durable account without creating a parallel account', async () => {
    const accountId = '22222222-2222-4222-8222-222222222222';
    const subject = 'legacy-wechat-openid';
    const auth = authSession({
      accessToken: 'valid-legacy-wechat-token',
      identities: [{ provider: 'wechat', subject }],
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        providers: ['wechat'],
      },
    });
    const fixture = databaseFixture({
      distinctSelects: [[{ provider: 'wechat' }]],
      transactionSelects: [
        [{ accountId }],
        [{ accountId }],
        [{ sessionsRevokedAt: null, status: 'active' }],
        [{ accountId, provider: 'wechat', subjectHash: identityHash('wechat', subject) }],
      ],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.resolve(auth)).resolves.toEqual(expect.objectContaining({
      authUserId: auth.authUserId,
      id: accountId,
      providers: ['wechat'],
    }));
    expect(fixture.mutations).toContainEqual(expect.objectContaining({
      kind: 'update',
      set: { lastUsedAt: expect.any(Date) },
    }));
  });

  it('lists all supported identity providers in deterministic order', async () => {
    const fixture = databaseFixture({
      distinctSelects: [[{ provider: 'wechat' }, { provider: 'apple' }, { provider: 'phone' }]],
    });
    const service = new AccountIdentityService(config, fixture.database, undefined, { grantFreeTrial: vi.fn().mockResolvedValue({ created: true }) } as never);

    await expect(service.providersForAccount('22222222-2222-4222-8222-222222222222'))
      .resolves.toEqual(['phone', 'apple', 'wechat']);
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    expect(fixture.mutations).toHaveLength(0);
  });
});

describe('persisted repeat-registration trial eligibility', () => {
  function deniedClaimFixture(context: string, hasTrial = false) {
    const fixture = databaseFixture({ transactionSelects: [[{ context }], hasTrial ? [{ id: 'existing-trial' }] : []] });
    // Directly testing claimLifetimeTrial does not run resolveAccount's first select.
    fixture.transaction.select.mockImplementationOnce(() => fluent([{ context }]));
    fixture.transaction.select.mockImplementationOnce(() => fluent(hasTrial ? [{ id: 'existing-trial' }] : []));
    const originalInsert = fixture.transaction.insert.getMockImplementation()!;
    fixture.transaction.insert.mockImplementation((table: unknown) => {
      const query = originalInsert(table);
      query.returning.mockResolvedValue([]);
      return query;
    });
    return fixture;
  }

  it('records a denied trial only from an existing claim belonging to another account', async () => {
    const fixture = deniedClaimFixture('other-account-context');
    const service = new AccountIdentityService(config, fixture.database);
    await service.claimLifetimeTrialInTransaction(fixture.transaction as never,
      [{ provider: 'wechat', subject: 'verified-subject' }], 'new-account', new Date());
    expect(fixture.mutations).toContainEqual({ kind: 'update', table: accounts,
      set: { aiTrialEligibilityReason: 'trial_already_claimed' } });
  });

  it('does not mark an account with its own trial when binding an already-used identity', async () => {
    const fixture = deniedClaimFixture('other-account-context', true);
    const service = new AccountIdentityService(config, fixture.database);
    await service.claimLifetimeTrialInTransaction(fixture.transaction as never,
      [{ provider: 'wechat', subject: 'verified-subject' }], 'current-account', new Date(), false);
    expect(fixture.mutations.filter((mutation) => mutation.kind === 'update')).toEqual([]);
  });

  it('does not mistake an ordinary repeated login for a re-registration', async () => {
    const context = createHmac('sha256', hashSecret)
      .update('lifetime-benefit-account-context-v1\0current-account').digest('hex');
    const fixture = deniedClaimFixture(context);
    const service = new AccountIdentityService(config, fixture.database);
    await service.claimLifetimeTrialInTransaction(fixture.transaction as never,
      [{ provider: 'phone', subject: '+8613800138000' }], 'current-account', new Date());
    expect(fixture.mutations.filter((mutation) => mutation.kind === 'update')).toEqual([]);
  });
});
