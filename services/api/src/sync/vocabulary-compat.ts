import { vocabularyDocumentForLegacyClient, type VocabularyDataset } from '@icao/contracts';
import { LIVE_VOCABULARY_CATALOG, vocabularyFavoriteKey, type VocabularyMigrationPolicy } from '@icao/contracts/vocabulary-live';
import { vocabularyDocumentSchema, vocabularyDocumentForPolicy } from './vocabulary-document';

export type VocabularyClientProjection = { policy: VocabularyMigrationPolicy; baseline: VocabularyDataset };

export function vocabularyPayloadForClient<T>(payload: T, catalog: unknown, projection?: VocabularyClientProjection): T {
  if (catalog === LIVE_VOCABULARY_CATALOG || !payload || typeof payload !== 'object') return payload;
  const value = payload as Record<string, unknown>;
  if (value.documentKey !== 'vocabulary') return payload;
  if (projection) {
    const document = vocabularyDocumentForPolicy(value.document, projection.policy);
    const words: typeof document.words = {};
    const legacyIds = new Map<string, string[]>();
    for (const word of projection.baseline.books.flatMap(book => book.words)) {
      const target = Object.hasOwn(projection.policy.retiredIds, word.id) ? projection.policy.retiredIds[word.id] : word.id;
      if (!target) continue;
      legacyIds.set(target, [...(legacyIds.get(target) ?? []), word.id]);
      const progress = document.words[target];
      if (progress) {
        words[word.id] = progress;
        words[vocabularyFavoriteKey(word.word)] = { ...progress, status: 'new' };
      }
    }
    // Keep independent lookup favorites; no unknown catalog IDs reach an old client.
    for (const [key, progress] of Object.entries(document.words)) if (key.startsWith('__word_favorite__:v1:')) words[key] = progress;
    const supported = document.lastTest?.answers.every(answer => answer && typeof answer === 'object' && 'wordId' in answer && legacyIds.has(String(answer.wordId)));
    const lastTest = supported && document.lastTest ? { ...document.lastTest, answers: document.lastTest.answers.map(answer => {
      const item = answer as Record<string, unknown>, id = String(item.wordId), aliases = legacyIds.get(id)!;
      return { ...item, wordId: aliases.includes(id) ? id : aliases[0] };
    }) } : undefined;
    return { ...value, document: { ...document, words, ...(lastTest ? { lastTest } : { lastTest: undefined }) } } as T;
  }
  if (catalog === 'three-books-v3') return payload;
  const parsed = vocabularyDocumentSchema.safeParse(value.document);
  return parsed.success ? { ...value, document:vocabularyDocumentForLegacyClient(parsed.data) } as T : payload;
}
