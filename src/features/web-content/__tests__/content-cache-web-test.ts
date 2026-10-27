import { releaseFixture } from '@/features/vocabulary/test-support/live-fixture';
import { apiFetch } from '@/platform/api-client';
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_type:string,text:string)=>jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex')}));
const vocabularyRelease=releaseFixture(),vocabularyDataset=vocabularyRelease.dataset;

jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => 'https://test.invalid', apiFetch: jest.fn() }));

const mockStorage = new Map<string, string>();
const mockRelease = {
  baseUrl: '/web-content/releases/app-qb-v10-test',
  releaseChecksum: 'a'.repeat(64),
  releaseId: 'app-qb-v10-test',
};

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
  },
}));

jest.mock('@/features/web-content/release', () => ({
  loadWebContentRelease: jest.fn(async () => mockRelease),
  resolveWebContentUrl: jest.fn(async (path: string) => `${mockRelease.baseUrl}${path}`),
}));

// Imports must follow the mocks so Jest installs the repository dependencies first.
// eslint-disable-next-line import/first
import { loadResourceEditorial } from '@/features/editorial/repository.web';
// eslint-disable-next-line import/first
import { loadVocabulary } from '@/features/vocabulary/repository.web';

// Exercise the historical implementation explicitly, independently of the formal Web default.
jest.mock('@/config/web-runtime', () => {
  const previous = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
  process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'vercel-legacy';
  try {
    return jest.requireActual('@/config/web-runtime');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = previous;
  }
});


const editorialRelease = {
  version: 2,
  articles: [{
    id: 'article-1',
    slug: 'article-1',
    version: 1,
    channel: 'resource',
    category: 'guide',
    badge: '指南',
    title: '文章',
    summary: '摘要',
    tags: [],
    publishedAt: '2026-07-28T00:00:00.000Z',
    cover: {
      publicPath: '/editorial-assets/article-1/cover.jpg',
      alt: '封面',
      width: 800,
      height: 500,
      mimeType: 'image/jpeg',
      checksum: 'b'.repeat(64),
      sizeBytes: 10,
    },
    blocks: [],
    sourceLinks: [],
  }],
};

describe('current API vocabulary and historical editorial Web caches', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.restoreAllMocks();
    jest.mocked(apiFetch).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the current Web vocabulary catalog and retains it when its API is unavailable', async () => {
    jest.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: vocabularyRelease,
    }), { status: 200 }));
    await expect(loadVocabulary()).resolves.toMatchObject({ source: 'remote', dataset: vocabularyDataset });
    expect(apiFetch).toHaveBeenCalledWith('/v1/vocabulary?catalog=vocabulary-live-v1', expect.anything());

    jest.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
    await expect(loadVocabulary()).resolves.toMatchObject({
      dataset: vocabularyDataset,
      source: 'cache',
      warning: 'vocabulary_remote_unavailable',
    });
  });

  it('shows a release-matched editorial cache without waiting for refresh', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(editorialRelease), { status: 200 }),
    );
    await expect(loadResourceEditorial()).resolves.toMatchObject({ source: 'remote' });

    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    await expect(loadResourceEditorial()).resolves.toMatchObject({
      source: 'cache',
      data: { items: [{ slug: 'article-1' }] },
    });
  });
});
