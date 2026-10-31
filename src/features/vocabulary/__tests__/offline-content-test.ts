import { renderHook, waitFor } from '@testing-library/react-native';
import { availableOfflineWords, verifyVocabularyDownload } from '../offline-content.native';
import { useOfflineBooks } from '../use-offline-books.native';
import { releaseFixture } from '../test-support/live-fixture';
import { canonicalVocabularyJson } from '@icao/contracts/vocabulary-live';
import type { OfflineManifest } from '@icao/contracts';
const { createHash } = jest.requireActual('node:crypto');
let mockPackages: Record<string, { saved?: OfflineManifest; latest?: OfflineManifest }> = {};
let mockOffline = true;
let mockOwner = 'one';
let mockStored: string | null = null;
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_a: string, value: string) => jest.requireActual('node:crypto').createHash('sha256').update(value).digest('hex') }));
jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => 'https://words.test' }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: async () => mockStored } }));
jest.mock('@/features/question-bank/platform/use-connectivity', () => ({ useConnectivity: () => mockOffline ? 'offline' : 'online' }));
jest.mock('@/features/native-commercial-testflight/commerce-environment', () => ({ nativeCommerceEnvironmentSnapshot: () => mockOwner, subscribeNativeCommerceEnvironment: () => () => {} }));
jest.mock('@/features/question-bank/downloads/download-manager.native', () => ({ prepareDownloads: async () => undefined, downloadSnapshot: () => mockPackages }));
const release = releaseFixture();
const book = release.dataset.books[0]!;
const manifest: OfflineManifest = { bankId: 'vocabulary', scope: 'preview', version: release.version, checksum: release.checksum, fingerprint: 'one', sizeBytes: 100, topics: [], resources: [], vocabulary: { bookId: 'preview', wordChecksums: Object.fromEntries(book.words.map(word => [word.id, createHash('sha256').update(canonicalVocabularyJson(word)).digest('hex')])) } };
beforeEach(() => { mockPackages = {}; mockOffline = true; mockOwner = 'one'; mockStored = null; });
it('offline cold start only exposes the book explicitly downloaded for this owner', async () => {
  mockPackages = { 'vocabulary:preview': { saved: manifest } };
  const hook = await renderHook(() => useOfflineBooks(release.dataset.books));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.books.map(book => book.id)).toEqual([book.id]);
  mockPackages = {}; mockOwner = 'two'; await hook.rerender({});
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.books).toEqual([]);
});
it('known changed and deleted words become unavailable offline while unchanged words remain usable', async () => {
  const latest = { ...manifest, vocabulary: { ...manifest.vocabulary!, wordChecksums: { ...manifest.vocabulary!.wordChecksums } } };
  delete latest.vocabulary.wordChecksums[book.words[0]!.id];
  latest.vocabulary.wordChecksums[book.words[1]!.id] = 'changed';
  expect((await availableOfflineWords(book, [manifest], [latest])).words.map(word => word.id)).toEqual([book.words[2]!.id]);
});
it('does not claim a completed download when the verified public text was not persisted', async () => {
  await expect(verifyVocabularyDownload(manifest)).rejects.toThrow('本机保存失败');
  mockStored = JSON.stringify(release);
  await expect(verifyVocabularyDownload(manifest)).resolves.toBeUndefined();
});
it('online mode preserves all three books without requiring downloads', async () => {
  mockOffline = false;
  const hook = await renderHook(() => useOfflineBooks(release.dataset.books));
  expect(hook.result.current.books).toBe(release.dataset.books);
});
