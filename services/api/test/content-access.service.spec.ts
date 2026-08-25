import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { isFreeQuestionBankCard } from '@icao/contracts';
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
      declaredCardCount: 2,
      cards: [
        { id: 'listening-main-001', audio: '/question-bank-assets/audio/listening/main/001.mp3' },
        { id: 'listening-main-999', audio: '/question-bank-assets/audio/listening/main/999.mp3' },
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
  it('keeps the confirmed free IDs stable across every bank shape', () => {
    expect(isFreeQuestionBankCard('sentences900', 'any-topic', 'any-card')).toBe(true);
    expect(isFreeQuestionBankCard('listening', 'listening-topic-01', 'listening-main-001')).toBe(true);
    expect(isFreeQuestionBankCard('listening', 'listening-topic-01', 'listening-main-999')).toBe(false);
    expect(isFreeQuestionBankCard('radiotelephony', 'atc-scenario-0003', 'any-card')).toBe(true);
    expect(isFreeQuestionBankCard('radiotelephony', 'atc-scenario-0004', 'any-card')).toBe(false);
    expect(isFreeQuestionBankCard('opi', 'opi-topic-0003', 'any-card')).toBe(true);
    expect(isFreeQuestionBankCard('opi', 'opi-topic-0004', 'any-card')).toBe(false);
    expect(isFreeQuestionBankCard('storytelling', 'story-flight-required', 'story-wing-003')).toBe(true);
    expect(isFreeQuestionBankCard('storytelling', 'story-flight-required', 'story-wing-004')).toBe(false);
  });

  it('returns a full directory but never places member-only cards in the catalog payload', async () => {
    const fixture = service(new Date('2026-09-25T00:00:00.000Z'));
    const release = await fixture.service.getCatalog('listening', ACCOUNT_ID, SESSION_ID, 'production', NOW);
    const topic = release.dataset.categories[0]!.topics[0]!;

    expect(release.dataset.access).toEqual({
      policyVersion: 'content-access-v1',
      environment: 'production',
      membershipActive: true,
      membershipExpiresAt: '2026-09-25T00:00:00.000Z',
    });
    expect(topic.cards.map((card) => card.id)).toEqual(['listening-main-001']);
    expect(topic.access).toEqual({ level: 'member', availableCardCount: 1, declaredCardCount: 2 });
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

    expect(release.topic.cards).toHaveLength(2);
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

  it('signs a device- and scope-bound credential capped by membership expiry', async () => {
    const fixture = service(new Date('2026-08-26T00:00:00.000Z'));
    const credential = await fixture.service.issueCredential(ACCOUNT_ID, {
      deviceId: 'device-0000000000000001',
      scopes: [{
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
      }],
    }, SESSION_ID, 'production', NOW);

    expect(credential).toMatchObject({
      expiresAt: '2026-08-26T00:00:00.000Z',
      environment: 'production',
      policyVersion: 'content-access-v1',
    });
    expect(credential.token.split('.')).toHaveLength(3);
    expect(fixture.values).toHaveLength(1);
    expect(fixture.values[0]).toMatchObject({ accountId: ACCOUNT_ID, environment: 'production' });
    expect(fixture.values[0]).not.toHaveProperty('token');
  });

  it('rate limits repeated credential issuance using retained database records', async () => {
    const fixture = service(new Date('2026-08-26T00:00:00.000Z'), 'production', false, 60);
    await expect(fixture.service.issueCredential(ACCOUNT_ID, {
      deviceId: 'device-0000000000000001',
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
