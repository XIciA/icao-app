import { canonicalVocabularyJson } from '@icao/contracts/vocabulary-live';
import type { OfflineManifest, VocabularyBook } from '@icao/contracts';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';
import { loadVocabulary } from './catalog-loader';
import { liveVocabularyCacheKey, validateLiveVocabularyRelease } from './live-catalog';

export async function verifyVocabularyDownload(manifest: OfflineManifest) {
  if (!manifest.vocabulary) throw new Error('invalid_vocabulary_manifest');
  const raw = await Storage.getItem(liveVocabularyCacheKey(getApiBaseUrl() ?? ''));
  if (!raw) throw new Error('本机保存失败，请重试');
  const release = await validateLiveVocabularyRelease(JSON.parse(raw));
  const book = release.dataset.books.find(book => book.id === manifest.vocabulary!.bookId);
  if (!book || (await availableOfflineWords(book, [manifest])).words.length !== Object.keys(manifest.vocabulary.wordChecksums).length) throw new Error('词库已变化，请检查更新');
}
export async function prepareVocabularyDownload(manifest: OfflineManifest) {
  await loadVocabulary();
  await verifyVocabularyDownload(manifest);
}
/** Public text cache remains the sole vocabulary repository. Downloads select verified words from it. */
export async function availableOfflineWords(book: VocabularyBook, manifests: OfflineManifest[], latest: OfflineManifest[] = []) {
  const hashes = new Map(manifests.filter(manifest => manifest.vocabulary?.bookId === book.id)
    .flatMap(manifest => Object.entries(manifest.vocabulary!.wordChecksums)));
  const current = latest.find(manifest => manifest.vocabulary?.bookId === book.id)?.vocabulary?.wordChecksums;
  const matches = await Promise.all(book.words.map(async word => (current === undefined || current[word.id] === hashes.get(word.id)) && hashes.get(word.id) === await digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalVocabularyJson(word))));
  return { ...book, words: book.words.filter((_word, index) => matches[index]) };
}
