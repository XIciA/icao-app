import type { VocabularyBook, VocabularyDataset } from '@/features/vocabulary/types';

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


function createBook(id: VocabularyBook['id'], count: number): VocabularyBook {
  const level = id === 'preview' ? 1 : id === 'icao4' ? 2 : 3;
  return {
    id,
    level,
    name: id,
    description: id,
    words: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      bookId: id,
      level,
      word: `word ${index}`,
      meaning: `meaning ${index}`,
      example: `Example ${index}.`,
      exampleTranslation: `例句 ${index}`,
      source: { name: 'test', rowIndex: index, sourceNo: index },
    })),
  };
}

const vocabularyDataset: VocabularyDataset = {
  schemaVersion: 1,
  version: 1,
  source: {
    name: 'test',
    generatedAt: '2026-07-28T00:00:00.000Z',
    sourceRows: 838,
    validRows: 838,
    ignoredRows: 0,
    invalidRows: 0,
  },
  books: [
    createBook('preview', 360),
    createBook('icao4', 372),
    createBook('icao5', 106),
  ],
};

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

describe('same-origin Web content caches', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a release-matched vocabulary cache without waiting for refresh', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(vocabularyDataset), { status: 200 }),
    );
    await expect(loadVocabulary()).resolves.toMatchObject({ source: 'remote' });

    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    await expect(loadVocabulary()).resolves.toMatchObject({
      dataset: vocabularyDataset,
      source: 'cache',
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
