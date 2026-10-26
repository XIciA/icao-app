import { migrateVocabularyDocument, vocabularyRetiredIds } from '@icao/contracts';
import { z } from 'zod';
import type { VocabularyMigrationPolicy } from '@icao/contracts/vocabulary-live';

const progressSchema = z.object({
  status: z.enum(['new', 'known', 'vague', 'forgot', 'wrong']),
  favorite: z.boolean(),
  updatedAt: z.string().datetime(),
});

const testResultSchema = z.object({
  schemaVersion: z.literal(1),
  completedAt: z.string().datetime(),
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  answers: z.array(z.unknown()),
}).passthrough();

const rawVocabularyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  words: z.record(z.string(), progressSchema),
  lastTest: testResultSchema.optional(),
  studySession: z.object({wordIds:z.array(z.string().max(160)).max(10000),nextWordId:z.string().max(160).nullable(),order:z.enum(['frequency','random']),startedAt:z.string().datetime(),updatedAt:z.string().datetime()}).optional(),
  updatedAt: z.string().datetime(),
});
export const vocabularyDocumentSchema = rawVocabularyDocumentSchema.transform(value => migrateVocabularyDocument(value));
export function vocabularyDocumentForPolicy(value: unknown, policy?: VocabularyMigrationPolicy) {
  return migrateVocabularyDocument(rawVocabularyDocumentSchema.parse(value), policy);
}

export type VocabularyDocument = z.infer<typeof vocabularyDocumentSchema>;

function newer<T extends { updatedAt: string }>(left: T | undefined, right: T | undefined) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right : left;
}

export function mergeVocabularyDocuments(currentValue: unknown, incomingValue: unknown, policy?: VocabularyMigrationPolicy): VocabularyDocument {
  const current = vocabularyDocumentForPolicy(currentValue, policy);
  const incoming = vocabularyDocumentForPolicy(incomingValue, policy);
  const words = { ...current.words };
  const rawWords = incomingValue && typeof incomingValue === 'object' && 'words' in incomingValue
    ? incomingValue.words as Record<string, {status?:string}> : {};
  const unlearnedAliasTargets = new Set(Object.entries(rawWords).flatMap(([id,p]) => {
    const target=policy ? policy.retiredIds[id] ?? policy.retiredFavoriteKeys[id] : vocabularyRetiredIds[id];
    return target && p?.status==='new' && !rawWords[target] ? [target] : [];
  }));
  for (const [wordId, incomingProgress] of Object.entries(incoming.words)) {
    const previous=words[wordId];
    // A newly favorited but unlearned alias must not erase an existing learning fact.
    // An explicit newer reset on the canonical ID retains the normal LWW behavior.
    const progress = previous && previous.status!=='new' && incomingProgress.status==='new' && unlearnedAliasTargets.has(wordId)
      ? {...incomingProgress,status:previous.status} : incomingProgress;
    words[wordId] = newer(previous, progress)!;
  }
  const currentTest = current.lastTest;
  const incomingTest = incoming.lastTest;
  const lastTest = !currentTest
    ? incomingTest
    : !incomingTest
      ? currentTest
      : Date.parse(incomingTest.completedAt) > Date.parse(currentTest.completedAt)
        ? incomingTest
        : currentTest;
  const updatedAt = Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt) ? incoming.updatedAt : current.updatedAt;
  const studySession=newer(current.studySession,incoming.studySession);
  return { schemaVersion: 1, words, ...(lastTest ? { lastTest } : {}), ...(studySession ? {studySession} : {}), updatedAt };
}
