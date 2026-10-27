import { validateVocabularyCatalog } from './index.ts';
import type { VocabularyDataset, VocabularyWord } from './index.ts';

export const LIVE_VOCABULARY_CATALOG = 'vocabulary-live-v1';

/** Cumulative, terminal mappings. A null target retires a deleted/split source. */
export type VocabularyMigrationPolicy = {
  schemaVersion: 1;
  version: number;
  retiredIds: Record<string, string | null>;
  retiredFavoriteKeys: Record<string, string | null>;
  testWords: Record<string, { word: string; meaning: string }>;
};

export type VocabularyLiveContent = {
  schemaVersion: 1;
  catalogId: typeof LIVE_VOCABULARY_CATALOG;
  version: number;
  dataset: VocabularyDataset;
  policy: VocabularyMigrationPolicy;
};

export type VocabularyLiveRelease = VocabularyLiveContent & { checksum: string };

export function vocabularyFavoriteKey(word: string) {
  const normalized = word.normalize('NFKC').replace(/[‘’‛ʻʼ]/g, "'").replace(/[‐‑‒–—―−]/g, '-').trim().replace(/\s+/g, ' ').toLowerCase();
  return `__word_favorite__:v1:${encodeURIComponent(normalized)}`;
}

export function vocabularyTerms(word: VocabularyWord) {
  return word.word.split(/\s*\/\s*/u).map(term => term.trim()).filter(Boolean);
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function balancedVocabularyText(text: string) {
  const pairs:Record<string,string>={')':'(',']':'[','}':'{','）':'（','】':'【','》':'《'};
  const opening=new Set(Object.values(pairs)),stack:string[]=[];
  for(const character of text){if(opening.has(character))stack.push(character);else if(pairs[character]&&stack.pop()!==pairs[character])return false;}
  return stack.length===0;
}

/** Validate the whole release before installing either its data or migration rules. */
export function validateVocabularyLiveContent(value: unknown): VocabularyLiveContent {
  check(object(value), 'invalid_live_vocabulary');
  const content = value as unknown as VocabularyLiveContent;
  check(content.schemaVersion === 1 && content.catalogId === LIVE_VOCABULARY_CATALOG && Number.isSafeInteger(content.version) && content.version > 0, 'invalid_live_vocabulary_version');
  validateVocabularyCatalog(content.dataset);
  check(content.dataset.catalogId === 'three-books-v3' && content.dataset.version === content.version, 'live_vocabulary_dataset_mismatch');
  const words = content.dataset.books.flatMap(book => book.words), ids = new Set(words.map(word => word.id));
  const terms = new Set<string>();
  const policy = content.policy;
  check(object(policy) && policy.schemaVersion === 1 && policy.version === content.version, 'invalid_vocabulary_policy');
  check(object(policy.retiredIds) && object(policy.retiredFavoriteKeys) && object(policy.testWords), 'invalid_vocabulary_policy');
  for (const word of words) {
    check(word.id.length <= 160 && /^[A-Za-z0-9_-]+$/u.test(word.id), 'invalid_vocabulary_id');
    for (const field of [word.word, word.meaning, word.example, word.exampleTranslation, word.pronunciationText]) {
      check(typeof field === 'string' && field.length <= 3000 && field === field.trim() && !/[\r\n\t\u200b-\u200f\ufeff<>]/u.test(field), `invalid_vocabulary_text:${word.id}`);
      check(balancedVocabularyText(field), `unbalanced_vocabulary_punctuation:${word.id}`);
    }
    check(/[\u4e00-\u9fff]/u.test(word.meaning) && /[\u4e00-\u9fff]/u.test(word.exampleTranslation) && !/[\u4e00-\u9fff]/u.test(word.word+word.example), `invalid_vocabulary_language:${word.id}`);
    check(!/^[；;，,、：:]/u.test(word.meaning) && !/^短语\s/u.test(word.meaning), `invalid_vocabulary_meaning:${word.id}`);
    check(!word.relatedExpressions || Array.isArray(word.relatedExpressions) && word.relatedExpressions.length <= 30 && word.relatedExpressions.every(expression => typeof expression === 'string' && expression.trim() === expression && expression.length > 0 && expression.length < 300 && !/[\r\n\t<>]/u.test(expression)), `invalid_vocabulary_related:${word.id}`);
    for (const term of vocabularyTerms(word)) {
      const key = vocabularyFavoriteKey(term);
      check(!terms.has(key), `duplicate_vocabulary_term:${term}`);
      terms.add(key);
    }
    const update = policy.testWords[word.id];
    check(update?.word === word.word && update.meaning === word.meaning, `vocabulary_test_text_mismatch:${word.id}`);
  }
  check(Object.keys(policy.testWords).length === words.length, 'vocabulary_test_word_inventory_mismatch');
  for (const [key, target] of Object.entries(policy.retiredIds)) {
    check(key && !ids.has(key), 'active_vocabulary_id_retired');
    check(target === null || typeof target === 'string' && ids.has(target) && !Object.hasOwn(policy.retiredIds, target), 'vocabulary_retirement_target_invalid');
  }
  for (const [key, target] of Object.entries(policy.retiredFavoriteKeys)) {
    check(key.startsWith('__word_favorite__:v1:'), 'invalid_vocabulary_favorite_alias');
    // Catalog favorites now share the stable word ID, not a mutable English spelling.
    check(target === null || typeof target === 'string' && ids.has(target), 'vocabulary_favorite_target_invalid');
  }
  return content;
}

/** Transport metadata (notably checksum itself) is never part of content. */
export function vocabularyLivePayload(content:VocabularyLiveContent):VocabularyLiveContent {
  return {schemaVersion:content.schemaVersion,catalogId:content.catalogId,version:content.version,dataset:content.dataset,policy:content.policy};
}

/** Deterministic JSON for release hashes; independent of object insertion order. */
export function canonicalVocabularyJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalVocabularyJson).join(',')}]`;
  return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalVocabularyJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export function validateVocabularyPolicyTransition(previous: VocabularyLiveContent, next: VocabularyLiveContent) {
  validateVocabularyLiveContent(next);
  check(next.version > previous.version, 'vocabulary_version_must_increase');
  const nextIds = new Set(next.dataset.books.flatMap(book => book.words.map(word => word.id)));
  for (const word of previous.dataset.books.flatMap(book => book.words)) {
    check(nextIds.has(word.id) || Object.hasOwn(next.policy.retiredIds, word.id), `vocabulary_retirement_missing:${word.id}`);
  }
  for (const [id, oldTarget] of Object.entries(previous.policy.retiredIds)) {
    check(Object.hasOwn(next.policy.retiredIds, id) && !nextIds.has(id), 'vocabulary_retirement_history_lost');
    const target = oldTarget === null ? null : nextIds.has(oldTarget) ? oldTarget : next.policy.retiredIds[oldTarget];
    check(next.policy.retiredIds[id] === target, 'vocabulary_retirement_history_rewritten');
  }
  for (const [key, oldTarget] of Object.entries(previous.policy.retiredFavoriteKeys)) {
    const target = oldTarget === null ? null : nextIds.has(oldTarget) ? oldTarget : next.policy.retiredIds[oldTarget];
    check(Object.hasOwn(next.policy.retiredFavoriteKeys, key) && next.policy.retiredFavoriteKeys[key] === target, 'vocabulary_favorite_history_lost');
  }
  return next;
}
