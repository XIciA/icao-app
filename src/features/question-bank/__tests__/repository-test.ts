/* eslint-disable import/first */
const mockStorageValues = new Map<string, string>();

jest.mock('expo-sqlite/kv-store', () => ({
  getItem: jest.fn(async (key: string) => mockStorageValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStorageValues.set(key, value); }),
}));

import { embeddedQuestionBankRepository, getEmbeddedQuestionBankIds, loadQuestionBank } from '../data/repository';
import { resolveRemoteQuestionBankAsset } from '../platform/resource-service';
import resourceManifest from '../../../../content/question-banks/resources/manifest.source.json';
import { Platform } from 'react-native';

describe('embeddedQuestionBankRepository', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;
  const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalWebContentBaseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL;
  const originalPlatform = Platform.OS;

  afterEach(() => {
    mockStorageValues.clear();
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

  it('loads the real listening dataset and canonical audio path', async () => {
    const listening = await embeddedQuestionBankRepository.getDataset('listening');
    const listeningCards = listening?.categories.flatMap((category) =>
      category.topics.flatMap((topic) => topic.cards),
    ) ?? [];

    expect(listening?.declaredTopicCount).toBe(4);
    expect(listening?.declaredCardCount).toBe(1223);
    expect(listening?.categories).toHaveLength(4);
    expect(listeningCards).toHaveLength(1223);
    expect(listeningCards.every((card) =>
      card.kind !== 'image'
      && Array.isArray(card.choices)
      && Array.isArray(card.choicesZh)
      && card.choices.length === 4
      && card.choicesZh.length === card.choices.length
      && card.choicesZh.every((choice) => choice.trim().length > 0),
    )).toBe(true);
    expect(listeningCards.reduce((total, card) =>
      total + (card.kind !== 'image' && Array.isArray(card.choicesZh) ? card.choicesZh.length : 0), 0)).toBe(4892);
    expect(listening?.categories[0].topics[0].cards[0]).toMatchObject({
      id: 'listening-main-001',
      audio: '/question-bank-assets/audio/listening/main/001.mp3',
      correctChoiceIndex: 1,
    });
    expect(resourceManifest.files[0]).toMatchObject({
      publicPath: '/question-bank-assets/audio/listening/main/001.mp3',
      sizeBytes: 152876,
    });
  });

  it('keeps all 6,867 cards and canonical media references reconcilable', () => {
    const resources = new Map(resourceManifest.files.map((resource) => [resource.publicPath, resource]));

    const banks = getEmbeddedQuestionBankIds().map((id) => embeddedQuestionBankRepository.getDataset(id));
    return Promise.all(banks).then((datasets) => {
      const cards = datasets.flatMap((dataset) => dataset?.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.map((card) => ({ bankId: dataset.id, card })))) ?? []);
      expect(datasets.map((dataset) => dataset?.declaredCardCount)).toEqual([1223, 900, 3218, 1090, 436]);
      expect(cards).toHaveLength(6867);
      expect(resourceManifest.files).toHaveLength(6081);
      expect(cards.filter(({ card }) => card.audio && !resources.has(card.audio))).toEqual([]);

      const imageCards = cards.filter(({ bankId, card }) => bankId === 'opi' && card.kind === 'image');
      expect(imageCards).toHaveLength(23);
      expect(imageCards.every(({ card }) => card.kind === 'image' && /^\/question-bank-assets\/images\/opi\/image-questions\/image-topic-\d{3}\.jpg$/.test(card.image) && Boolean(card.imageAlt))).toBe(true);
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
        bankId !== 'opi' && card.audio && !card.audio.includes('/web-v5/') && !card.audio.includes('/web-v6/'));
      expect(legacyCards.filter(({ bankId, card }) => card.audio !== expectedAudio(bankId, card.id))).toEqual([]);

      const webCards = cards.filter(({ card }) => card.audio?.includes('/web-v5/') || card.audio?.includes('/web-v6/'));
      expect(webCards).toHaveLength(2099);
      expect(webCards.every(({ bankId, card }) =>
        new RegExp(`^/question-bank-assets/audio/${bankId}/web-v[56]/pepec-[a-z0-9_-]+\\.mp3$`).test(card.audio ?? ''))).toBe(true);
      expect(cards.filter(({ bankId, card }) => bankId === 'radiotelephony' && card.audio?.includes('/web-v5/'))).toHaveLength(0);
      expect(cards.filter(({ bankId, card }) => bankId === 'radiotelephony' && card.audio?.includes('/web-v6/'))).toHaveLength(1367);
      expect(new Set(webCards.map(({ card }) => card.audio)).size).toBe(2099);

      expect(resources.get('/question-bank-assets/audio/listening/main/454.mp3')).toMatchObject({ sizeBytes: 128300 });
      expect(resources.get('/question-bank-assets/audio/listening/main/595.mp3')).toMatchObject({ sizeBytes: 404780 });
      expect(cards.some(({ card }) => card.audio === '/question-bank-assets/audio/listening/main/454.mp3')).toBe(true);
      expect(cards.some(({ card }) => card.audio === '/question-bank-assets/audio/listening/main/595.mp3')).toBe(false);
    });
  });

  it('loads and caches a remote release through the unified repository', async () => {
    const dataset = await embeddedQuestionBankRepository.getDataset('listening');
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ requestId: 'test', data: { bankId: 'listening', version: 1, checksum: 'abc', dataset } }),
    } as Response);

    const result = await loadQuestionBank('listening');
    expect(result).toMatchObject({ source: 'remote', dataset: { id: 'listening' } });
    expect(mockStorageValues.has('icao.content.v1.bank.listening')).toBe(true);
  });

  it('falls back to the embedded release when the remote API fails without cache', async () => {
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://127.0.0.1:3101';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const result = await loadQuestionBank('opi');
    expect(result).toMatchObject({ source: 'embedded', warning: 'question_bank_remote_unavailable', dataset: { id: 'opi' } });
  });

  it('loads the immutable Vercel mirror on web without calling the App API', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL = 'https://content.example/releases/app-qb-v8-test';
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const dataset = await embeddedQuestionBankRepository.getDataset('opi');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dataset,
    } as Response);

    await expect(loadQuestionBank('opi')).resolves.toMatchObject({ source: 'remote', dataset: { id: 'opi' } });
    await expect(loadQuestionBank('opi')).resolves.toMatchObject({ source: 'remote', dataset: { id: 'opi' } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://content.example/releases/app-qb-v8-test/question-bank/banks/opi.json',
      expect.any(Object),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rewrites a cached signed URL to the current tunnel origin', async () => {
    const path = '/question-bank-assets/audio/listening/main/001.mp3';
    process.env.EXPO_PUBLIC_ICAO_API_URL = 'http://192.168.1.2:3101';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://192.168.1.2:8000';
    mockStorageValues.set(`icao.content.v1.resource.${encodeURIComponent(path)}`, JSON.stringify({
      publicPath: path,
      objectKey: 'v1/audio/listening/main/001.mp3',
      checksum: 'test',
      sizeBytes: 1,
      mimeType: 'audio/mpeg',
      url: 'http://127.0.0.1:8000/storage/v1/object/sign/question-bank-assets/v1/audio/listening/main/001.mp3?token=signed',
      expiresIn: 900,
      expiresAt: Date.now() + 600_000,
    }));

    await expect(resolveRemoteQuestionBankAsset(path)).resolves.toBe(
      'http://192.168.1.2:8000/storage/v1/object/sign/question-bank-assets/v1/audio/listening/main/001.mp3?token=signed',
    );
  });
});
