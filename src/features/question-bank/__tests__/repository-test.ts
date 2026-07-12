/* eslint-disable import/first */
const mockStorageValues = new Map<string, string>();

jest.mock('expo-sqlite/kv-store', () => ({
  getItem: jest.fn(async (key: string) => mockStorageValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStorageValues.set(key, value); }),
}));

import { embeddedQuestionBankRepository, getEmbeddedQuestionBankIds, loadQuestionBank } from '../data/repository';
import { resolveRemoteQuestionBankAsset } from '../platform/resource-service';
import audioIndex from '../data/audio-index.json';

describe('embeddedQuestionBankRepository', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_ICAO_API_URL;
  const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    mockStorageValues.clear();
    jest.restoreAllMocks();
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_ICAO_API_URL;
    else process.env.EXPO_PUBLIC_ICAO_API_URL = originalApiUrl;
    if (originalSupabaseUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
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

    expect(listening?.declaredTopicCount).toBe(4);
    expect(listening?.declaredCardCount).toBe(631);
    expect(listening?.categories).toHaveLength(4);
    expect(listening?.categories[0].topics[0].cards[0]).toMatchObject({
      id: 'listening-main-001',
      audio: '/question-bank-assets/audio/listening/main/001.mp3',
      correctChoiceIndex: 1,
    });
    expect(audioIndex.modules.listening.main[0]).toMatchObject({
      file: '/question-bank-assets/audio/listening/main/001.mp3',
      sizeBytes: 152876,
    });
  });

  it('keeps all 4,947 cards and canonical audio references reconcilable', () => {
    const files = new Set<string>();
    const collectFiles = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectFiles);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (typeof object.file === 'string') files.add(object.file);
      Object.values(object).forEach(collectFiles);
    };
    collectFiles(audioIndex.modules);

    const banks = getEmbeddedQuestionBankIds().map((id) => embeddedQuestionBankRepository.getDataset(id));
    return Promise.all(banks).then((datasets) => {
      const cards = datasets.flatMap((dataset) => dataset?.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards)) ?? []);
      expect(datasets.map((dataset) => dataset?.declaredCardCount)).toEqual([631, 900, 1851, 1269, 296]);
      expect(cards).toHaveLength(4947);
      expect(cards.filter((card) => card.audio && !files.has(card.audio))).toEqual([]);
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
