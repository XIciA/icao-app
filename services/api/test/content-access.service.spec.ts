import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { freeQuestionBankCardIds } from '@icao/contracts';
import { generateKeyPairSync } from 'node:crypto';

import { ContentAccessService } from '../src/content-access/content-access.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import {
  contentAccessCredentials,
  contentEnvironmentSessionGrants,
  membershipEntitlementSegments,
  questionBankReleases,
} from '../src/database/schema';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-08-25T00:00:00.000Z');
const TEST_CONTENT_PRIVATE_KEY = generateKeyPairSync('ed25519').privateKey.export({
  format: 'pem',
  type: 'pkcs8',
}).toString();

const dataset = {
  id: 'listening',
  title: '听力',
  categories: [{
    id: 'listening-category-01',
    name: '模块',
    topics: [{
      id: 'listening-topic-01',
      name: '10s航空英语',
      declaredCardCount: 11,
      cards: [
        { id: 'listening-main-001', audio: '/question-bank-assets/audio/listening/main/001.mp3', studyTier: 2 },
        ...Array.from({length: 9}, (_, index) => ({ id: `middle-${index}`, studyTier: 1 })),
        { id: 'listening-main-999', audio: '/question-bank-assets/audio/listening/main/999.mp3', studyTier: 1 },
      ],
    }],
  }],
};

function database(
  membershipExpiresAt?: Date,
  membershipEnvironment: 'sandbox' | 'production' = 'production',
  sandboxGrant = false,
  credentialCount = 0,
) {
  const values: Array<Record<string, unknown>> = [];
  const rows = async (table: unknown) => {
    if (table === questionBankReleases) {
      return [{ bankId: 'listening', version: 7, checksum: 'a'.repeat(64), payload: dataset, active: true }];
    }
    if (table === contentEnvironmentSessionGrants && sandboxGrant) return [{ id: 'grant-1' }];
    if (table === contentAccessCredentials) return [{ total: credentialCount }];
    if (table === membershipEntitlementSegments && membershipExpiresAt) {
      return [{ endsAt: membershipExpiresAt, environment: membershipEnvironment, id: '00000000-0000-4000-8000-000000000099' }];
    }
    return [];
  };
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: () => ({
            limit: () => rows(table),
          }),
          limit: () => rows(table),
          then: (resolve: (value: unknown) => unknown) => rows(table).then(resolve),
        }),
      }),
    }),
    insert: () => ({ values: async (value: Record<string, unknown>) => { values.push(value); } }),
  };
  return { database: { db } as unknown as DatabaseService, values };
}

function service(
  membershipExpiresAt?: Date,
  membershipEnvironment: 'sandbox' | 'production' = 'production',
  sandboxGrant = false,
  credentialCount = 0,
) {
  const fixture = database(membershipExpiresAt, membershipEnvironment, sandboxGrant, credentialCount);
  return {
    ...fixture,
    service: new ContentAccessService({
      contentCredentialSigningPrivateKey: TEST_CONTENT_PRIVATE_KEY,
      contentCredentialSigningSecret: 's'.repeat(32),
    } as ApiConfig, fixture.database),
  };
}

describe('versioned content access policy', () => {
  it('selects release order, not numeric card IDs, independently in each listening module', () => {
    const topics = Array.from({ length: 4 }, (_, t) => ({ id: `topic-${t}`, cards: [{ id: `retired-${t}`, retired: true }, ...Array.from({ length: 12 }, (_, c) => ({ id: `arbitrary-${t}-${11-c}` }))] }));
    const bank = { id: 'listening', categories: topics.map(topic => ({ topics: [topic] })) };
    const ids = freeQuestionBankCardIds(bank);
    expect(ids.size).toBe(40);
    for (let t = 0; t < 4; t++) {
      expect(ids.has(`arbitrary-${t}-11`)).toBe(true);
      expect(ids.has(`arbitrary-${t}-2`)).toBe(true);
      expect(ids.has(`arbitrary-${t}-1`)).toBe(false);
      expect(ids.has(`retired-${t}`)).toBe(false);
    }
    expect(freeQuestionBankCardIds({ ...bank, id: 'radiotelephony' }).size).toBe(12);
    expect(freeQuestionBankCardIds({ ...bank, id: 'opi' }).size).toBe(36);
    expect(freeQuestionBankCardIds({ ...bank, id: 'storytelling' }).size).toBe(3);
    expect(freeQuestionBankCardIds({ ...bank, id: 'sentences900' }).size).toBe(48);
  });

  it('lets guests read only free topics and resources, and never select Sandbox', async () => {
    const fixture = service(new Date('2026-09-25T00:00:00.000Z'));
    const release = await fixture.service.getTopic('listening', 'listening-category-01', 'listening-topic-01', undefined, undefined, 'production', NOW);
    expect(release.topic.cards).toHaveLength(10);
    expect(release.access.membershipActive).toBe(false);
    await expect(fixture.service.assertResourceAccess(undefined, 'listening', '/question-bank-assets/audio/listening/main/999.mp3', undefined, 'production', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture.service.assertResourceAccess(undefined, 'listening', '/question-bank-assets/audio/listening/main/001.mp3', undefined, 'production', NOW)).resolves.toBeUndefined();
    await expect(fixture.service.getCatalog('listening', undefined, undefined, 'sandbox', NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a full directory but never places member-only cards in the catalog payload', async () => {
    const fixture = service(new Date('2026-09-25T00:00:00.000Z'));
    const release = await fixture.service.getCatalog('listening', ACCOUNT_ID, SESSION_ID, 'production', NOW);
    const topic = release.dataset.categories[0]!.topics[0]!;

    expect(release.dataset.access).toEqual({
      policyVersion: 'content-access-v2',
      environment: 'production',
      membershipActive: true,
      membershipExpiresAt: '2026-09-25T00:00:00.000Z',
    });
    expect(topic.cards.map((card) => card.id)).toEqual(['listening-main-001', ...Array.from({length: 9}, (_, i) => `middle-${i}`)]);
    expect(topic.radioEntries).toEqual([{ id: 'listening-main-001', title: '', durationSeconds: 0 }, { id: 'listening-main-999', title: '', durationSeconds: 0 }]);
    expect(topic.scopeCardIds?.all).toHaveLength(11);
    expect(topic.scopeCardIds?.crash).toEqual(['listening-main-001']);
    expect(topic.access).toMatchObject({ level: 'member', availableCardCount: 10, declaredCardCount: 11 });
    expect(topic.access.freeCardIds).toHaveLength(10);
  });

  it('returns full topic content only to an active production member', async () => {
    const fixture = service(new Date('2026-09-25T00:00:00.000Z'));
    const release = await fixture.service.getTopic(
      'listening',
      'listening-category-01',
      'listening-topic-01',
      ACCOUNT_ID,
      SESSION_ID,
      'production',
      NOW,
    );

    expect(release.topic.cards).toHaveLength(11);
  });

  it('requires a server-issued session grant before sandbox content can be selected', async () => {
    const expiry = new Date('2026-09-25T00:00:00.000Z');
    await expect(service(expiry, 'sandbox').service.getCatalog(
      'listening',
      ACCOUNT_ID,
      SESSION_ID,
      'sandbox',
      NOW,
    )).rejects.toBeInstanceOf(ForbiddenException);

    const release = await service(expiry, 'sandbox', true).service.getCatalog(
      'listening',
      ACCOUNT_ID,
      SESSION_ID,
      'sandbox',
      NOW,
    );
    expect(release.dataset.access).toMatchObject({ environment: 'sandbox', membershipActive: true });
  });

  it('fails closed for a topic or media object with no free content', async () => {
    const fixture = service();
    await expect(fixture.service.assertResourceAccess(
      ACCOUNT_ID,
      'listening',
      '/question-bank-assets/audio/listening/main/999.mp3',
      SESSION_ID,
      'production',
      NOW,
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture.service.assertResourceAccess(
      ACCOUNT_ID,
      'listening',
      '/question-bank-assets/audio/listening/main/001.mp3',
      SESSION_ID,
      'production',
      NOW,
    )).resolves.toBeUndefined();
  });

  it('keeps discovery protected for authenticated non-members', async () => {
    await expect(service().service.assertMembership(ACCOUNT_ID, SESSION_ID, 'production')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service(new Date('2099-01-01T00:00:00.000Z')).service.assertMembership(ACCOUNT_ID, SESSION_ID, 'production')).resolves.toBeUndefined();
  });

  it('signs an account- and scope-bound credential capped by membership expiry', async () => {
    const fixture = service(new Date('2026-08-26T00:00:00.000Z'));
    const credential = await fixture.service.issueCredential(ACCOUNT_ID, {
      scopes: [{
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
      }],
    }, SESSION_ID, 'production', NOW);

    expect(credential).toMatchObject({
      expiresAt: '2026-08-26T00:00:00.000Z',
      environment: 'production',
      policyVersion: 'content-access-v2',
    });
    expect(credential.token.split('.')).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(credential.token.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({
      policyVersion: 'content-access-v2', // Published clients keep accepting the offline credential.
      sub: ACCOUNT_ID,
      entitlementSegmentId: '00000000-0000-4000-8000-000000000099',
      environment: 'production',
      scopes: [{
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
      }],
    });
    expect(claims).not.toHaveProperty('did');
    expect(fixture.values).toHaveLength(1);
    expect(fixture.values[0]).toMatchObject({ accountId: ACCOUNT_ID, environment: 'production' });
    expect(fixture.values[0]).not.toHaveProperty('token');
    expect(fixture.values[0]).not.toHaveProperty('deviceDigest');
  });

  it('caps account credentials at the 72-hour offline window', async () => {
    const fixture = service(new Date('2026-09-25T00:00:00.000Z'));
    const credential = await fixture.service.issueCredential(ACCOUNT_ID, {
      scopes: [{
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
      }],
    }, SESSION_ID, 'production', NOW);

    expect(credential.expiresAt).toBe('2026-08-28T00:00:00.000Z');
  });

  it('rate limits repeated credential issuance by account using retained database records', async () => {
    const fixture = service(new Date('2026-08-26T00:00:00.000Z'), 'production', false, 240);
    await expect(fixture.service.issueCredential(ACCOUNT_ID, {
      scopes: [{
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
      }],
    }, SESSION_ID, 'production', NOW)).rejects.toMatchObject({
      message: 'content_credential_rate_limited',
      status: 429,
    });
  });
});
