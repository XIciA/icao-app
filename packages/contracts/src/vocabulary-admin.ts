import type { VocabularyBookId } from './index.ts';
import type { VocabularyLiveRelease } from './vocabulary-live.ts';

/** Admin-only contract. The App's vocabulary transport is unchanged. */
export type VocabularyLevelMove = { id: string; bookId: VocabularyBookId };
export type VocabularyLevelChange = { id: string; word: string; from: VocabularyBookId; to: VocabularyBookId };
export type VocabularyLevelPlan = {
  baseVersion: number;
  checksum: string;
  changes: VocabularyLevelChange[];
  counts: { id: VocabularyBookId; name: string; before: number; after: number }[];
  missingAudio: string[];
};
export type VocabularyLevelPublication = { release: VocabularyLiveRelease; publishedVersion: number; alreadyPublished: boolean };
export type VocabularyHistoryChange = {
  id: string;
  word: string;
  before?: { bookId: VocabularyBookId; word: string; meaning: string };
  after?: { bookId: VocabularyBookId; word: string; meaning: string };
  kind: 'level' | 'content' | 'added' | 'deleted';
  fields?: { label: string; before: string; after: string }[];
};
export type VocabularyHistoryItem = {
  version: number;
  previousVersion: number | null;
  createdAt: string;
  actor: string;
  type: 'levels' | 'edit' | 'import' | 'baseline';
  note: string;
  changeCount: number;
  levelChanges: VocabularyLevelChange[];
};
export type VocabularyHistoryPage = { items: VocabularyHistoryItem[]; nextCursor: number | null };
export type VocabularyHistoryDetail = VocabularyHistoryItem & { changes: VocabularyHistoryChange[] };
