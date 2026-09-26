/* eslint-disable import/first */
const mockStorageValues = new Map<string, string>();
const mockSecureValues = new Map<string, string>();
const mockFiles = new Set<string>();

jest.mock('expo-sqlite/kv-store', () => ({
  getItem: jest.fn(async (key: string) => mockStorageValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStorageValues.set(key, value); }),
  getAllKeys: jest.fn(async () => [...mockStorageValues.keys()]),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach((key) => mockStorageValues.delete(key)); }),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockSecureValues.delete(key); }),
}));
jest.mock('expo-crypto', () => {
  const encode = (value: Uint8Array) => btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
  const decode = (value: string) => new Uint8Array(Array.from(atob(value), (character) => character.charCodeAt(0)));
  class TestKey {
    static async generate() { return new TestKey(); }
    static async import() { return new TestKey(); }
    async encoded() { return 'dGVzdC1rZXk='; }
  }
  return {
    AESKeySize: { AES256: 256 },
    AESEncryptionKey: TestKey,
    AESSealedData: { fromCombined: (value: string) => value },
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: jest.fn(async () => new Uint8Array(32).fill(0xab)),
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `digest-${value.replaceAll('/', '-')}`),
    aesEncryptAsync: jest.fn(async (value: Uint8Array) => ({ combined: async () => encode(value) })),
    aesDecryptAsync: jest.fn(async (value: string) => decode(value)),
  };
});
jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    constructor(first: MockDirectory | string, ...parts: string[]) { this.uri = [typeof first === 'string' ? first : first.uri, ...parts].join('/'); }
    get exists() { return [...mockFiles].some((value) => value.startsWith(this.uri)); }
    create() { return undefined; }
    delete() { [...mockFiles].filter((value) => value.startsWith(this.uri)).forEach((value) => mockFiles.delete(value)); }
    list() { return [...mockFiles].filter((value) => value.startsWith(`${this.uri}/`)).map((uri) => new MockFile(uri)); }
  }
  class MockFile {
    uri: string;
    constructor(first: MockDirectory | string, ...parts: string[]) { this.uri = [typeof first === 'string' ? first : first.uri, ...parts].join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return 10; }
    get name() { return this.uri.split('/').pop()!; }
    get modificationTime() { return 0; }
    async bytes() { return new Uint8Array(10); }
    delete() { mockFiles.delete(this.uri); }
    move(destination: MockFile) { mockFiles.delete(this.uri); this.uri = destination.uri; mockFiles.add(this.uri); }
    static async downloadFileAsync(_url: string, file: MockFile) { mockFiles.add(file.uri); return file; }
  }
  return { Directory: MockDirectory, File: MockFile, Paths: { document: new MockDirectory('file:///document'), cache: new MockDirectory('file:///cache') } };
});

import { embeddedQuestionBankRepository, getEmbeddedQuestionBankIds, loadQuestionBank, questionBankRepository } from '../data/repository';
import {
  activateQuestionBankContentAccount,
  clearQuestionBankMemberContent,
  readMemberTopicCache,
  writeMemberTopicCache,
  inspectOfflineMemberTopicAccess,
  cacheMemberResource,
  resolveOfflineMemberResource,
} from '../data/member-content-cache.native';
import { resolveRemoteQuestionBankAsset } from '../platform/resource-service';
import resourceManifest from '../../../../content/question-banks/resources/manifest.source.json';
import { AESEncryptionKey, aesDecryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import Storage from '@/platform/storage';
import completeQuestionBanks from '../data/question-bank.json';
import type { QuestionBankDataset } from '../types';
import { buildMockExamSession } from '@/features/mock-exam/build-session.native';
import { loadHotspotAccess } from '@/features/content/hotspot/access-loader.native';
import * as hotspotRepository from '@/features/content/hotspot/repository.native';
import hotspotIndex from '../../../../content/question-banks/opi-hotspots.json';

function testContentCredential(
  accountId: string,
  scope: { bankId: string; categoryId: string; topicId: string },
) {
  const issuedAtSeconds = Math.floor(Date.now() / 1_000) - 5;
  const expiresAtSeconds = issuedAtSeconds + 60 * 60;
  const claims = {
    aud: 'icao-content-offline',
    entitlementSegmentId: '00000000-0000-4000-8000-000000000099',
    environment: 'production' as const,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    iss: 'icao-api',
    jti: '00000000-0000-4000-8000-000000000098',
    policyVersion: 'content-access-v2' as const,
    scopes: [scope],
    sub: accountId,
  };
  return {
    token: `header.${btoa(JSON.stringify(claims)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}.signature`,
    issuedAt: new Date(issuedAtSeconds * 1_000).toISOString(),
    expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
    policyVersion: 'content-access-v2' as const,
    environment: 'production' as const,
    scopes: [scope],
  };
}

describe('embeddedQuestionBankRepository', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;
  const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalWebContentBaseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL;
  const originalPlatform = Platform.OS;

  async function authenticatedContentApi({ cacheUnavailable = false, credentialStatus = 200 } = {}) {
    const accountId = '00000000-0000-4000-8000-000000000001';
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.readyoufife.com';
    await activateQuestionBankContentAccount(accountId);
    const access = { policyVersion: 'content-access-v2', environment: 'production', membershipActive: true, membershipExpiresAt: '2099-01-01T00:00:00.000Z' };
    const response = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => status === 200
      ? { requestId: 'content-integration', data }
      : { requestId: 'content-integration', error: { code: status === 403 ? 'membership_required' : 'content_credentials_unavailable' } } }) as Response;
    if (cacheUnavailable) jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('local_keychain_write_failed'));
    const request = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const bankId = /^\/v1\/question-banks\/([^/]+)/.exec(url.pathname)?.[1];
      if (bankId) {
        const full = (completeQuestionBanks as QuestionBankDataset[]).find((bank) => bank.id === bankId)!;
        const categoryId = /\/categories\/([^/]+)/.exec(url.pathname)?.[1];
        const topicId = /\/topics\/([^/]+)/.exec(url.pathname)?.[1];
        if (categoryId && topicId) {
          const topic = full.categories.find((category) => category.id === categoryId)!.topics.find((topic) => topic.id === topicId)!;
          return response({ bankId, categoryId, version: 12, checksum: 'ab'.repeat(32), access,
            topic: { ...topic, access: { level: 'member', declaredCardCount: topic.cards.length, availableCardCount: topic.cards.length } } });
        }
        // Native catalog is a directory with only free cards, even for members.
        const catalog = await embeddedQuestionBankRepository.getDataset(full.id);
        return response({ bankId, version: 12, checksum: 'ab'.repeat(32), dataset: { ...catalog, access } });
      }
      if (url.pathname === '/v1/content-access/credentials') {
        const scope = JSON.parse(String(init?.body)).scopes[0];
        const credential = testContentCredential(accountId, scope);
        credential.issuedAt = new Date(Date.parse(credential.issuedAt) + 437).toISOString();
        credential.expiresAt = new Date(Date.parse(credential.expiresAt) + 437).toISOString();
        return response(credential, credentialStatus);
      }
      if (url.pathname === '/v1/resources/resolve') {
        const path = url.searchParams.get('path')!;
        return response({ publicPath: path, objectKey: `v1${path}`, checksum: 'ab'.repeat(32), sizeBytes: 10,
          mimeType: 'audio/mpeg', url: `https://cloud.readyoufife.com/storage/v1/object/sign/question-bank-assets${path}?token=fixture`, expiresIn: 300 });
      }
      throw new Error(`unexpected_content_request:${url.pathname}`);
    });
    return { accountId, request };
  }

  it('retries legacy cleanup, removes an orphan device-bound credential, and preserves the later v2 key', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    const legacyCredentialKey = `icao.content.credential.v1.${accountId}.production.opi.opi-category-01.opi-topic-0004`;
    const legacyTopicKey = `icao.content.member-topic.v1.${accountId}.production.opi.opi-category-01.opi-topic-0004`;
    const unrelatedSecureKey = 'unrelated.secure.key';
    mockSecureValues.set('icao.content.device.v1', '00000000-0000-4000-8000-000000000010');
    mockSecureValues.set(`icao.content.key.v1.${accountId}`, 'legacy-account-key');
    mockSecureValues.set(legacyCredentialKey, 'legacy-device-bound-credential');
    mockSecureValues.set(unrelatedSecureKey, 'must-remain');
    // Deliberately omit the credential index to reproduce a crash between
    // SecureStore credential persistence and index registration.
    mockStorageValues.set(legacyTopicKey, 'legacy-topic');
    mockFiles.add(`file:///document/icao-member-content/${accountId}/production/legacy.mp3`);
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('transient-keychain-error'));

    await expect(activateQuestionBankContentAccount(accountId)).rejects.toThrow('transient-keychain-error');
    await expect(readMemberTopicCache(accountId, scope)).resolves.toBeUndefined();

    expect(mockSecureValues.has('icao.content.device.v1')).toBe(false);
    expect(mockSecureValues.has(`icao.content.key.v1.${accountId}`)).toBe(false);
    expect(mockSecureValues.has(legacyCredentialKey)).toBe(false);
    expect(mockSecureValues.get(unrelatedSecureKey)).toBe('must-remain');
    expect(mockStorageValues.has(legacyTopicKey)).toBe(false);
    expect([...mockFiles].some((path) => path.includes(`/icao-member-content/${accountId}/`))).toBe(false);

    mockSecureValues.set(`icao.content.key.v1.${accountId}`, 'v2-account-key');
    await activateQuestionBankContentAccount(accountId);
    expect(mockSecureValues.get(`icao.content.key.v1.${accountId}`)).toBe('v2-account-key');
  });

  afterEach(async () => {
    await activateQuestionBankContentAccount(undefined);
    mockStorageValues.clear();
    mockSecureValues.clear();
    mockFiles.clear();
    jest.restoreAllMocks();
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_ICAO_API_URL;
    else process.env.EXPO_PUBLIC_ICAO_API_URL = originalApiUrl;
    if (originalSupabaseUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalWebContentBaseUrl === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL;
    else process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL = originalWebContentBaseUrl;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('keeps the canonical five-bank registry intact', () => {
    expect(getEmbeddedQuestionBankIds()).toEqual([
      'listening',
      'sentences900',
      'radiotelephony',
      'opi',
      'storytelling',
    ]);
  });

  it('embeds only the fixed free listening set while retaining the complete directory counts', async () => {
    const listening = await embeddedQuestionBankRepository.getDataset('listening');
    const listeningCards = listening?.categories.flatMap((category) =>
      category.topics.flatMap((topic) => topic.cards),
    ) ?? [];

    expect(listening?.declaredTopicCount).toBe(4);
    expect(listening?.declaredCardCount).toBe(1612);
    expect(listening?.categories).toHaveLength(4);
    expect(listeningCards).toHaveLength(40);
    expect(listeningCards.every((card) =>
      card.kind !== 'image'
      && Array.isArray(card.choices)
      && Array.isArray(card.choicesZh)
      && card.choices.length === 4
      && card.choicesZh.length === card.choices.length
      && card.choicesZh.every((choice) => choice.trim().length > 0),
    )).toBe(true);
    expect(listeningCards.reduce((total, card) =>
      total + (card.kind !== 'image' && Array.isArray(card.choicesZh) ? card.choicesZh.length : 0), 0)).toBe(160);
    expect(listening?.categories[0].topics[0].cards[0]).toMatchObject({
      id: 'listening-main-001',
      audio: '/question-bank-assets/audio/listening/fzy/26c34fea0b90a1cc7c64.mp3',
      correctChoiceIndex: 1,
    });
    expect(resourceManifest.files[0]).toMatchObject({
      publicPath: '/question-bank-assets/audio/listening/main/001.mp3',
      sizeBytes: 152876,
    });
  });

  it('keeps only the 1,044 confirmed free cards and their media references in the Native fallback', () => {
    const resources = new Map(resourceManifest.files.map((resource) => [resource.publicPath, resource]));

    const banks = getEmbeddedQuestionBankIds().map((id) => embeddedQuestionBankRepository.getDataset(id));
    return Promise.all(banks).then((datasets) => {
      const cards = datasets.flatMap((dataset) => dataset?.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.map((card) => ({ bankId: dataset.id, card })))) ?? []);
      expect(datasets.map((dataset) => dataset?.declaredCardCount)).toEqual([1612, 900, 5751, 2321, 382]);
      expect(cards).toHaveLength(1044);
      expect(resourceManifest.files).toHaveLength(10371);
      expect(cards.filter(({ card }) => card.audio && !resources.has(card.audio))).toEqual([]);

      const imageCards = cards.filter(({ bankId, card }) => bankId === 'opi' && card.kind === 'image');
      expect(imageCards).toHaveLength(0);
      const imageQuestionAudio = cards.filter(({ bankId, card }) => bankId === 'opi' && Boolean(card.audio));
      expect(imageQuestionAudio).toHaveLength(0);

      const expectedAudio = (bankId: string, cardId: string) => {
        if (bankId === 'listening') return `/question-bank-assets/audio/listening/main/${cardId.slice(-3)}.mp3`;
        if (bankId === 'sentences900') return `/question-bank-assets/audio/sentence900/main/${cardId.slice(-3)}.mp3`;
        if (bankId === 'radiotelephony') return `/question-bank-assets/audio/radiotelephony/main/${cardId.split('-').at(-1)}.mp3`;
        const match = cardId.match(/^story-(koala|kongguan|wing)-(\d{3})$/);
        return match ? `/question-bank-assets/audio/storytelling/${match[1]}/${match[2]}.mp3` : undefined;
      };
      const legacyCards = cards.filter(({ bankId, card }) =>
        bankId !== 'opi' && bankId !== 'sentences900' && card.audio && !card.audio.includes('/web-v5/') && !card.audio.includes('/web-v6/') && !card.audio.includes('/fzy/'));
      expect(legacyCards.filter(({ bankId, card }) => card.audio !== expectedAudio(bankId, card.id))).toEqual([]);

      const sentenceCards = cards.filter(({ bankId }) => bankId === 'sentences900');
      expect(sentenceCards.length).toBeGreaterThan(0);
      expect(sentenceCards.every(({ card }) =>
        card.audio?.startsWith(`/question-bank-assets/audio/sentence900/rev13/${card.id}-`)
        && resources.has(card.audio))).toBe(true);

      const webCards = cards.filter(({ card }) => card.audio?.includes('/web-v5/') || card.audio?.includes('/web-v6/'));
      expect(webCards).toHaveLength(0);
      expect(webCards.every(({ bankId, card }) =>
        new RegExp(`^/question-bank-assets/audio/${bankId}/web-v[56]/pepec-[a-z0-9_-]+\\.mp3$`).test(card.audio ?? ''))).toBe(true);
      expect(cards.filter(({ bankId, card }) => bankId === 'radiotelephony' && card.audio?.includes('/web-v5/'))).toHaveLength(0);
      expect(cards.filter(({ bankId, card }) => bankId === 'radiotelephony' && card.audio?.includes('/web-v6/'))).toHaveLength(0);
      expect(new Set(webCards.map(({ card }) => card.audio)).size).toBe(0);

      expect(resources.get('/question-bank-assets/audio/listening/main/454.mp3')).toMatchObject({ sizeBytes: 128300 });
      expect(resources.get('/question-bank-assets/audio/listening/main/595.mp3')).toMatchObject({ sizeBytes: 404780 });
      expect(cards.some(({ card }) => card.audio === '/question-bank-assets/audio/listening/main/454.mp3')).toBe(false);
      expect(cards.some(({ card }) => card.audio === '/question-bank-assets/audio/listening/main/595.mp3')).toBe(false);
    });
  });

  it('loads and caches a remote release through the unified repository', async () => {
    const dataset = await embeddedQuestionBankRepository.getDataset('listening');
    const accountId = '00000000-0000-4000-8000-000000000001';
    await activateQuestionBankContentAccount(accountId);
    mockStorageValues.set('icao.content.v1.bank.listening', JSON.stringify({ dataset: { id: 'listening', private: true } }));
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ requestId: 'test', data: { bankId: 'listening', version: 1, checksum: 'ab'.repeat(32), dataset } }),
    } as Response);

    const result = await loadQuestionBank('listening');
    expect(result).toMatchObject({ source: 'remote', dataset: { id: 'listening' } });
    expect(mockStorageValues.has('icao.content.v1.bank.listening')).toBe(false);
    expect(mockStorageValues.has(`icao.content.v3.catalog.${accountId}.production.listening`)).toBe(true);
  });

  it('falls back to the embedded release when the remote API fails without cache', async () => {
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const result = await loadQuestionBank('opi');
    expect(result).toMatchObject({ source: 'embedded', warning: 'question_bank_remote_unavailable', dataset: { id: 'opi' } });
  });

  it('obtains a server credential before caching a member topic for the active account', async () => {
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    await activateQuestionBankContentAccount('00000000-0000-4000-8000-000000000001');
    const topic = {
      id: 'listening-topic-01',
      name: '10s航空英语',
      declaredCardCount: 2,
      cards: [
        { id: 'listening-main-001', taskTitle: 'free', audioText: 'free' },
        { id: 'listening-main-999', taskTitle: 'member', audioText: 'member', audio: '/question-bank-assets/audio/listening/main/999.mp3' },
      ],
      access: { level: 'member', availableCardCount: 2, declaredCardCount: 2 },
    };
    const credential = testContentCredential(
      '00000000-0000-4000-8000-000000000001',
      { bankId: 'listening', categoryId: 'listening-category-01', topicId: 'listening-topic-01' },
    );
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ requestId: 'topic', data: {
          bankId: 'listening', categoryId: 'listening-category-01', version: 1, checksum: 'ab'.repeat(32), topic,
          access: { policyVersion: 'content-access-v2', environment: 'production', membershipActive: true, membershipExpiresAt: '2026-09-25T00:00:00.000Z' },
        } }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ requestId: 'credential', data: credential }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ requestId: 'resource', data: {
          publicPath: '/question-bank-assets/audio/listening/main/999.mp3',
          objectKey: 'v1/audio/listening/main/999.mp3',
          checksum: 'ab'.repeat(32),
          sizeBytes: 10,
          mimeType: 'audio/mpeg',
          url: 'https://cloud.readyoufife.com/storage/signed/999.mp3',
          expiresIn: 300,
        } }),
      } as Response);

    await expect(questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01')).resolves.toEqual({
      ...topic, contentRelease: { bankId: 'listening', version: 1, checksum: 'ab'.repeat(32) },
    });
    expect([...mockStorageValues.keys()].some((key) => key.startsWith('icao.content.member-topic.v2.'))).toBe(true);
    expect([...mockSecureValues.keys()].some((key) => key.startsWith('icao.content.credential.v2.'))).toBe(true);
    await expect(resolveRemoteQuestionBankAsset('/question-bank-assets/audio/listening/main/999.mp3', { forceRefresh: true }))
      .resolves.toBe('https://cloud.readyoufife.com/storage/signed/999.mp3');
    await waitFor(() => expect(mockFiles.size).toBe(1));
  });

  it('uses only an unexpired account-scoped cache when the topic service is offline', async () => {
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    const accountId = '00000000-0000-4000-8000-000000000001';
    await activateQuestionBankContentAccount(accountId);
    const cached = { id: 'opi-topic-0004', name: 'member topic', declaredCardCount: 1, cards: [] };
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    await writeMemberTopicCache(accountId, scope, cached, testContentCredential(accountId, scope));
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(questionBankRepository.getTopic('opi', 'opi-category-01', 'opi-topic-0004')).resolves.toEqual(cached);
  });

  it('reports an expired offline authorization without decrypting or returning member content', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    const credential = testContentCredential(accountId, scope);
    await activateQuestionBankContentAccount(accountId);
    await writeMemberTopicCache(
      accountId,
      scope,
      { id: scope.topicId, name: 'member topic', declaredCardCount: 1, cards: [] },
      credential,
    );

    await expect(inspectOfflineMemberTopicAccess(scope)).resolves.toBe('valid');
    await expect(inspectOfflineMemberTopicAccess(
      scope,
      Date.parse(credential.expiresAt) + 1,
    )).resolves.toBe('expired');
  });

  it('does not misclassify an invalid signature with a past expiresAt as expired', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    const validCredential = testContentCredential(accountId, scope);
    await activateQuestionBankContentAccount(accountId);
    await writeMemberTopicCache(
      accountId,
      scope,
      { id: scope.topicId, name: 'member topic', declaredCardCount: 1, cards: [] },
      validCredential,
    );
    const storedCredentialKey = [...mockSecureValues.keys()]
      .find((key) => key.startsWith('icao.content.credential.v2.'))!;
    mockSecureValues.set(storedCredentialKey, JSON.stringify({
      ...validCredential,
      token: 'invalid-signature',
      expiresAt: '2020-01-01T00:00:00.000Z',
    }));
    const decryptCallsBeforeInspection = jest.mocked(aesDecryptAsync).mock.calls.length;

    await expect(inspectOfflineMemberTopicAccess(scope)).resolves.toBe('invalid');
    expect(jest.mocked(aesDecryptAsync).mock.calls).toHaveLength(decryptCallsBeforeInspection);
  });

  it('creates one stable account encryption key when topics are cached concurrently', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    await activateQuestionBankContentAccount(accountId);
    const generate = jest.spyOn(AESEncryptionKey, 'generate');
    const scopes = [
      { bankId: 'listening', categoryId: 'listening-category-01', topicId: 'listening-topic-01' },
      { bankId: 'listening', categoryId: 'listening-category-02', topicId: 'listening-topic-02' },
    ];

    await Promise.all(scopes.map((scope) => writeMemberTopicCache(
      accountId,
      scope,
      { id: scope.topicId, name: scope.topicId, declaredCardCount: 0, cards: [] },
      testContentCredential(accountId, scope),
    )));

    expect(generate).toHaveBeenCalledTimes(1);
    expect([...mockStorageValues.keys()].filter((key) => key.startsWith('icao.content.member-topic.v2.'))).toHaveLength(2);
  });

  it('does not let an old account request write member content back after account switching starts', async () => {
    const oldAccountId = '00000000-0000-4000-8000-000000000001';
    const nextAccountId = '00000000-0000-4000-8000-000000000002';
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    await activateQuestionBankContentAccount(oldAccountId);
    let releaseTopicWrite!: () => void;
    let topicWriteStarted!: () => void;
    const started = new Promise<void>((resolve) => { topicWriteStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseTopicWrite = resolve; });
    jest.spyOn(Storage, 'setItem').mockImplementation(async (key, value) => {
      if (key.startsWith('icao.content.member-topic.v2.')) {
        topicWriteStarted();
        await release;
      }
      if (typeof value !== 'string') throw new Error('unexpected_storage_updater');
      mockStorageValues.set(key, value);
    });
    const writing = writeMemberTopicCache(
      oldAccountId,
      scope,
      { id: scope.topicId, name: 'member', declaredCardCount: 1, cards: [] },
      testContentCredential(oldAccountId, scope),
    );
    await started;
    const switching = activateQuestionBankContentAccount(nextAccountId);
    releaseTopicWrite();

    await expect(writing).rejects.toThrow('content_account_changed');
    await switching;
    expect([...mockStorageValues.keys()].some((key) => key.includes(oldAccountId))).toBe(false);
    expect([...mockSecureValues.keys()].some((key) => key.includes(oldAccountId))).toBe(false);
  });

  it('does not return member plaintext when revocation cleanup wins a concurrent cache read', async () => {
    const accountId = '00000000-0000-4000-8000-000000000001';
    const scope = { bankId: 'opi', categoryId: 'opi-category-01', topicId: 'opi-topic-0004' };
    const topic = { id: scope.topicId, name: 'member', declaredCardCount: 1, cards: [] };
    await activateQuestionBankContentAccount(accountId);
    await writeMemberTopicCache(accountId, scope, topic, testContentCredential(accountId, scope));
    let releaseDecryption!: () => void;
    let decryptionStarted!: () => void;
    const started = new Promise<void>((resolve) => { decryptionStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseDecryption = resolve; });
    jest.mocked(aesDecryptAsync).mockImplementationOnce(async (value) => {
      decryptionStarted();
      await release;
      return new Uint8Array(Array.from(atob(String(value)), (character) => character.charCodeAt(0)));
    });
    const reading = readMemberTopicCache(accountId, scope);
    await started;
    await clearQuestionBankMemberContent(accountId);
    releaseDecryption();

    await expect(reading).resolves.toBeUndefined();
  });

  it('rewrites a cached signed URL to the current tunnel origin', async () => {
    const path = '/question-bank-assets/audio/listening/main/001.mp3';
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://192.168.1.2:3101';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://192.168.1.2:8000';
    await activateQuestionBankContentAccount('00000000-0000-4000-8000-000000000001');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ requestId: 'resource', data: {
        publicPath: path,
        objectKey: 'v1/audio/listening/main/001.mp3',
        checksum: 'ab'.repeat(32),
        sizeBytes: 10,
        mimeType: 'audio/mpeg',
        url: 'http://127.0.0.1:8000/storage/v1/object/sign/question-bank-assets/v1/audio/listening/main/001.mp3?token=signed',
        expiresIn: 900,
      } }),
    } as Response);

    await expect(resolveRemoteQuestionBankAsset(path)).resolves.toBe(
      'http://192.168.1.2:8000/storage/v1/object/sign/question-bank-assets/v1/audio/listening/main/001.mp3?token=signed',
    );
  });

  it('never reuses a cached signed URL after its offline membership credential expires', async () => {
    const path = '/question-bank-assets/audio/listening/main/999.mp3';
    const accountId = '00000000-0000-4000-8000-000000000001';
    const scope = { bankId: 'listening', categoryId: 'listening-category-01', topicId: 'listening-topic-01' };
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    await activateQuestionBankContentAccount(accountId);
    await writeMemberTopicCache(accountId, scope, {
      id: scope.topicId,
      name: 'member topic',
      declaredCardCount: 1,
      cards: [{ id: 'listening-main-999', taskTitle: 'member', audioText: 'member', audio: path }],
    }, testContentCredential(accountId, scope));
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ requestId: 'resource', data: {
        publicPath: path,
        objectKey: 'v1/audio/listening/main/999.mp3',
        checksum: 'ab'.repeat(32),
        sizeBytes: 10,
        mimeType: 'audio/mpeg',
        url: 'https://cloud.readyoufife.com/storage/signed/999.mp3',
        expiresIn: 10_000,
      } }),
    } as Response);
    await expect(resolveRemoteQuestionBankAsset(path)).resolves.toBe('https://cloud.readyoufife.com/storage/signed/999.mp3');
    await waitFor(() => expect([...mockStorageValues.keys()].some(key => key.endsWith('.checksum'))).toBe(true));
    fetch.mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1_000);

    await expect(resolveRemoteQuestionBankAsset(path)).rejects.toThrow('offline');
  });
  it('builds the 20-question Native listening paper from directory, authorized topics and the same signed audio source', async () => {
    const { request } = await authenticatedContentApi();
    const paper = await buildMockExamSession({ examType: 'icao4-first', modules: ['listening'] }, 73);
    expect(paper.sections.map((section) => section.items.length)).toEqual([5, 5, 5, 5]);
    expect(new Set(paper.items.map((item) => item.card.id)).size).toBe(20);
    const resources = new Set(resourceManifest.files.map((resource) => resource.publicPath));
    expect(paper.items.every((item) => item.card.audio && resources.has(item.card.audio))).toBe(true);
    for (const item of paper.items) {
      expect(item.card).toBe(item.topic.cards.find((card) => card.id === item.source.cardId));
      expect(item.source.bankId).toBe('listening');
    }
    const path = paper.items[0].card.audio!;
    await expect(resolveRemoteQuestionBankAsset(path)).resolves.toMatch(/^https:\/\/cloud.readyoufife.com\//);
    expect(request.mock.calls.some(([url]) => String(url).includes(`/v1/resources/resolve?path=${encodeURIComponent(path)}`))).toBe(true);
    expect(request.mock.calls.filter(([url]) => String(url).includes('/topics/'))).toHaveLength(4);
    expect([...mockSecureValues.keys()].filter((key) => key.startsWith('icao.content.credential.v2.'))).toHaveLength(4);
  });

  it('opens the July 10 Native hotspot as all 18 original questions after authorized hydration', async () => {
    const { request } = await authenticatedContentApi();
    const brief = hotspotIndex.briefs.find((brief) => brief.id === 'hotspot-2026-07-10')!;
    jest.spyOn(hotspotRepository, 'loadHotspotBrief').mockResolvedValue(brief);
    const result = await loadHotspotAccess(brief.id);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('hotspot_not_ready');
    expect(result.session.items.map((item) => item.card.id)).toEqual(brief.topics.flatMap((topic) => topic.cardIds));
    expect(result.session.items).toHaveLength(18);
    expect(result.session.progressMode).toBe('persistent');
    expect(request.mock.calls.filter(([url]) => String(url).includes('/topics/'))).toHaveLength(3);
  });

  it('retains the authenticated online question when only offline keychain persistence fails', async () => {
    await authenticatedContentApi({ cacheUnavailable: true });
    const paper = await buildMockExamSession({ examType: 'icao4-first', modules: ['listening'] }, 73);
    expect(paper.items).toHaveLength(20);
  });

  it('does not discard an online paper for a temporary offline-credential service failure, but preserves revoked-access errors', async () => {
    await authenticatedContentApi({ credentialStatus: 503 });
    await expect(buildMockExamSession({ examType: 'icao4-first', modules: ['listening'] }, 73)).resolves.toMatchObject({ items: expect.any(Array) });
    expect([...mockSecureValues.keys()].filter((key) => key.startsWith('icao.content.credential.v2.'))).toHaveLength(0);
    jest.restoreAllMocks();
    await authenticatedContentApi({ credentialStatus: 403 });
    await expect(buildMockExamSession({ examType: 'icao4-first', modules: ['listening'] }, 73)).rejects.toMatchObject({ code: 'membership_required', status: 403 });
  });

  it('rejects a late authorized topic when its account changes during optional credential loading', async () => {
    const { accountId, request } = await authenticatedContentApi();
    const route = request.getMockImplementation()!;
    let release!: (response: Response) => void;
    let started!: () => void;
    const credentialRequested = new Promise<void>((resolve) => { started = resolve; });
    request.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/v1/content-access/credentials')) {
        started();
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return route(input, init);
    });
    const loading = questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    await credentialRequested;
    await activateQuestionBankContentAccount('00000000-0000-4000-8000-000000000002');
    release({ ok: true, status: 200, json: async () => ({ data: testContentCredential(accountId,
      { bankId: 'listening', categoryId: 'listening-category-01', topicId: 'listening-topic-01' }) }) } as Response);
    await expect(loading).rejects.toMatchObject({ code: 'content_account_changed' });
    expect([...mockSecureValues.keys()].filter((key) => key.startsWith('icao.content.credential.v2.'))).toHaveLength(0);
  });

  it('never writes or trusts an invalidly signed offline credential even when the authenticated online topic succeeds', async () => {
    const { request } = await authenticatedContentApi();
    const route = request.getMockImplementation()!;
    request.mockImplementation(async (input, init) => String(input).endsWith('/v1/content-access/credentials')
      ? { ok: true, status: 200, json: async () => ({ data: { token: 'invalid', scopes: [] } }) } as Response
      : route(input, init));
    const topic = await questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    expect(topic?.cards).toHaveLength(631);
    expect([...mockStorageValues.keys()].filter((key) => key.startsWith('icao.content.member-topic.v2.'))).toHaveLength(0);
    expect([...mockSecureValues.keys()].filter((key) => key.startsWith('icao.content.credential.v2.'))).toHaveLength(0);
  });

  it('still opens authorized free questions after expiring the previous member cache', async () => {
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'https://api.readyoufife.com';
    await activateQuestionBankContentAccount('00000000-0000-4000-8000-000000000001');
    const topic = await embeddedQuestionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {
      bankId: 'listening', categoryId: 'listening-category-01', version: 12, checksum: 'ab'.repeat(32), topic,
      access: { policyVersion: 'content-access-v2', environment: 'production', membershipActive: false, membershipExpiresAt: null },
    } }) } as Response);
    await expect(questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01'))
      .resolves.toMatchObject({ cards: expect.arrayContaining([expect.objectContaining({ id: 'listening-main-001' })]) });
  });

  it('returns authorized online audio before optional offline download completes, then retains the verified offline copy', async () => {
    const { request } = await authenticatedContentApi();
    const topic = await questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    const path = topic!.cards[0].audio!;
    const download = File.downloadFileAsync;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const downloading = jest.spyOn(File, 'downloadFileAsync').mockImplementation(async (...args) => {
      await held;
      return download(...args);
    });
    try {
      await expect(resolveRemoteQuestionBankAsset(path)).resolves.toMatch(/^https:\/\/cloud.readyoufife.com\//);
      await waitFor(() => expect(downloading).toHaveBeenCalledTimes(1));
      expect(mockFiles.size).toBe(0);
    } finally { release(); }
    await waitFor(() => expect([...mockStorageValues.keys()].some(key => key.endsWith('.checksum'))).toBe(true));
    request.mockRejectedValue(new Error('offline'));
    await expect(resolveRemoteQuestionBankAsset(path)).resolves.toMatch(/^file:\/\/\/document\/icao-member-content\//);
  });

  it('keeps authorized online audio playable when the optional local URL cache cannot be written', async () => {
    await authenticatedContentApi();
    const topic = await questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('disk_full'));
    await expect(resolveRemoteQuestionBankAsset(topic!.cards[0].audio!)).resolves.toMatch(/^https:\/\/cloud.readyoufife.com\//);
  });

  it('deduplicates the same verified resource while allowing a different track to download concurrently', async () => {
    await authenticatedContentApi();
    const topic = await questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    const paths = topic!.cards.slice(0, 2).map(card => card.audio!);
    const download = File.downloadFileAsync;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const downloading = jest.spyOn(File, 'downloadFileAsync').mockImplementation(async (...args) => {
      await held;
      return download(...args);
    });
    const metadata = { checksum: 'ab'.repeat(32), sizeBytes: 10 };
    const first = cacheMemberResource(paths[0], 'https://example.test/first', metadata);
    const duplicate = cacheMemberResource(paths[0], 'https://example.test/first-refreshed', metadata);
    const second = cacheMemberResource(paths[1], 'https://example.test/second', metadata);
    try {
      await waitFor(() => expect(downloading).toHaveBeenCalledTimes(2));
    } finally { release(); }
    const results = await Promise.all([first, duplicate, second]);
    expect(results[0]).toBe(results[1]);
    expect(results[0]).not.toBe(results[2]);
    expect(mockFiles.size).toBe(2);
    expect([...mockFiles].some(path => path.endsWith('.part'))).toBe(false);
  });

  it('signs out without waiting for a stalled transfer and discards its late downloaded file', async () => {
    await authenticatedContentApi();
    const topic = await questionBankRepository.getTopic('listening', 'listening-category-01', 'listening-topic-01');
    const download = File.downloadFileAsync;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const downloading = jest.spyOn(File, 'downloadFileAsync').mockImplementation(async (...args) => {
      await held;
      return download(...args);
    });
    const pending = cacheMemberResource(topic!.cards[0].audio!, 'https://example.test/slow', {
      checksum: 'ab'.repeat(32), sizeBytes: 10,
    });
    const rejected = expect(pending).rejects.toThrow('content_account_changed');
    try {
      await waitFor(() => expect(downloading).toHaveBeenCalledTimes(1));
      let signedOut = false;
      const signingOut = activateQuestionBankContentAccount(undefined).then(() => { signedOut = true; });
      await waitFor(() => expect(signedOut).toBe(true));
      await signingOut;
    } finally { release(); }
    await rejected;
    expect(mockFiles.size).toBe(0);
    expect([...mockStorageValues.keys()].some(key => key.endsWith('.checksum'))).toBe(false);
  });

  it('bounds temporary authorized public copies, keeps recent hits, and never turns them into offline member access', async () => {
    await activateQuestionBankContentAccount('temporary-account');
    const metadata = { checksum: 'ab'.repeat(32), sizeBytes: 10 };
    const copies: string[] = [];
    for (let index = 0; index < 8; index++) {
      copies.push((await cacheMemberResource(`/public/${index}.mp3`, 'https://example.test/audio', metadata, { temporary: true }))!);
    }
    await cacheMemberResource('/public/0.mp3', 'https://example.test/refreshed', metadata, { temporary: true });
    await cacheMemberResource('/public/8.mp3', 'https://example.test/audio', metadata, { temporary: true });
    expect(mockFiles.size).toBe(8);
    expect(mockFiles.has(copies[0])).toBe(true);
    expect(mockFiles.has(copies[1])).toBe(false);
    await expect(resolveOfflineMemberResource('/public/0.mp3')).resolves.toBeUndefined();
    await activateQuestionBankContentAccount(undefined);
    expect(mockFiles.size).toBe(0);
  });

  it('rejects oversized and corrupted temporary copies without leaving files or granting offline access', async () => {
    await activateQuestionBankContentAccount('temporary-account');
    await expect(cacheMemberResource('/public/large.mp3', 'https://example.test/audio', {
      checksum: 'ab'.repeat(32), sizeBytes: 17 * 1_024 * 1_024,
    }, { temporary: true })).resolves.toBeUndefined();
    await expect(cacheMemberResource('/public/corrupt.mp3', 'https://example.test/audio', {
      checksum: 'cd'.repeat(32), sizeBytes: 10,
    }, { temporary: true })).rejects.toThrow('resource_checksum_mismatch');
    expect(mockFiles.size).toBe(0);
  });

  it('caps native transfer concurrency so rapid track changes can fall back without accumulating download jobs', async () => {
    await activateQuestionBankContentAccount('temporary-account');
    const download = File.downloadFileAsync;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const downloading = jest.spyOn(File, 'downloadFileAsync').mockImplementation(async (...args) => {
      await held;
      return download(...args);
    });
    const metadata = { checksum: 'ab'.repeat(32), sizeBytes: 10 };
    const pending = Array.from({ length: 4 }, (_, index) => cacheMemberResource(
      `/public/${index}.mp3`, 'https://example.test/slow', metadata, { temporary: true },
    ));
    try {
      await waitFor(() => expect(downloading).toHaveBeenCalledTimes(4));
      await expect(cacheMemberResource('/public/overflow.mp3', 'https://example.test/slow', metadata, { temporary: true }))
        .resolves.toBeUndefined();
      expect(downloading).toHaveBeenCalledTimes(4);
    } finally { release(); }
    await Promise.all(pending);
    expect(mockFiles.size).toBe(4);
  });

  it('applies the temporary byte budget even before reaching the file count limit', async () => {
    await activateQuestionBankContentAccount('temporary-account');
    const sizeBytes = 16 * 1_024 * 1_024;
    jest.spyOn(File.prototype, 'size', 'get').mockReturnValue(sizeBytes);
    for (let index = 0; index < 5; index++) {
      await cacheMemberResource(`/public/large-${index}.mp3`, 'https://example.test/audio', {
        checksum: 'ab'.repeat(32), sizeBytes,
      }, { temporary: true });
    }
    expect(mockFiles.size).toBe(4);
    expect([...mockFiles].some(uri => uri.includes('large-0.mp3'))).toBe(false);
  });

  it('prepares authorized radio audio as a temporary local file without granting offline member access', async () => {
    await authenticatedContentApi();
    const path = '/radio/free-audio.mp3';
    await expect(resolveRemoteQuestionBankAsset(path, { preferDownloaded: true }))
      .resolves.toMatch(/^file:\/\/\/cache\/icao-authorized-content\//);
    await expect(resolveOfflineMemberResource(path)).resolves.toBeUndefined();
    expect([...mockStorageValues.keys()].some(key => key.endsWith('.checksum'))).toBe(false);
  });

  it('keeps authorized radio streaming available when temporary caching fails', async () => {
    await authenticatedContentApi();
    jest.spyOn(File, 'downloadFileAsync').mockRejectedValue(new Error('disk_full'));
    await expect(resolveRemoteQuestionBankAsset('/radio/free-audio.mp3', { preferDownloaded: true }))
      .resolves.toMatch(/^https:\/\/cloud.readyoufife.com\//);
    expect(mockFiles.size).toBe(0);
  });

  it('does not reuse a temporary radio copy after the resource API denies access', async () => {
    const { request } = await authenticatedContentApi();
    const path = '/radio/free-audio.mp3';
    await expect(resolveRemoteQuestionBankAsset(path, { preferDownloaded: true }))
      .resolves.toMatch(/^file:\/\/\/cache\//);
    request.mockResolvedValue({ ok: false, status: 403, json: async () => ({
      error: { code: 'membership_required', message: 'Membership required' },
    }) } as Response);
    await expect(resolveRemoteQuestionBankAsset(path, { preferDownloaded: true }))
      .rejects.toMatchObject({ status: 403 });
    expect(mockFiles.size).toBe(0);
  });

  it('discards obsolete radio downloads but preserves a newer subscriber sharing the same bytes', async () => {
    await activateQuestionBankContentAccount('temporary-account');
    const metadata = { checksum: 'ab'.repeat(32), sizeBytes: 10 };
    const download = File.downloadFileAsync;
    for (const hasNewSubscriber of [false, true]) {
      let current = true;
      let release!: () => void;
      let started!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const downloading = new Promise<void>((resolve) => { started = resolve; });
      const spy = jest.spyOn(File, 'downloadFileAsync').mockImplementation(async (...args) => {
        started();
        await held;
        return download(...args);
      });
      const path = `/public/stale-${hasNewSubscriber}.mp3`;
      const old = cacheMemberResource(path, 'https://example.test/old', metadata, {
        temporary: true, isCurrent: () => current,
      });
      await downloading;
      current = false;
      let newer: Promise<string | undefined> | undefined;
      if (hasNewSubscriber) {
        let subscribed!: () => void;
        const subscription = new Promise<void>((resolve) => { subscribed = resolve; });
        newer = cacheMemberResource(path, 'https://example.test/new', metadata, {
          temporary: true, isCurrent: () => { subscribed(); return true; },
        });
        await subscription;
      }
      release();
      await expect(old).resolves.toBeUndefined();
      if (newer) await expect(newer).resolves.toMatch(/^file:\/\/\/cache\/icao-authorized-content\//);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(mockFiles.size).toBe(hasNewSubscriber ? 1 : 0);
      expect([...mockFiles].some(uri => uri.endsWith('.part'))).toBe(false);
      spy.mockRestore();
    }
  });


});
