import { createHmac } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AccountIdentityService } from '../src/account/account-identity.service';
import type { VerifiedAuthSession } from '../src/auth/auth.types';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';

const hashSecret = 'test-account-identity-hash-secret-at-least-32-bytes';

const config = {
  accountIdentityHashSecret: hashSecret,
  inviteAuthSecret: 'different-test-invite-auth-secret-at-least-32-bytes',
} as ApiConfig;

type FluentQuery<T> = {
  from: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
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
    return query;
  });
  query.set.mockImplementation((set: unknown) => {
    record.set = set;
    return query;
  });
  return query;
}

function databaseFixture(options: {
  distinctSelects?: unknown[][];
  transactionSelects?: unknown[][];
}) {
  const transactionSelects = [...(options.transactionSelects ?? [])];
  const distinctSelects = [...(options.distinctSelects ?? [])];
  const mutations: RecordedMutation[] = [];
  const transaction = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn((table: unknown) => {
      const record: RecordedMutation = { kind: 'insert', table };
      mutations.push(record);
      return mutationQuery(record);
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

function identityHash(provider: 'apple' | 'phone', subject: string) {
  return createHmac('sha256', hashSecret)
    .update(`account-identity-v1\0${provider}\0${subject}`)
    .digest('hex');
}

describe('AccountIdentityService', () => {
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
    const service = new AccountIdentityService(config, fixture.database);

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
    const service = new AccountIdentityService(config, fixture.database);

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
    const service = new AccountIdentityService(config, fixture.database);

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
    const service = new AccountIdentityService(config, fixture.database);

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
    const service = new AccountIdentityService(config, fixture.database);

    await expect(service.resolve(auth))
      .rejects.toSatisfy((error: unknown) => error instanceof UnauthorizedException
        && error.message === 'unsupported_auth_identity');
    expect(fixture.mutations).toHaveLength(0);
  });
});
