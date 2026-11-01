import { studyScopeCardIds } from './index.ts';

export type OfflineDownloadScope = 'selected' | 'all' | 'icao4' | 'icao5' | 'preview';
export type OfflineResource = { publicPath: string; checksum: string; sizeBytes: number };
export type OfflineTopic = {
  bankId: string; categoryId: string; topicId: string;
  cardIds: string[]; cardChecksums: Record<string, string>; cardResources: Record<string, string[]>; metadataChecksum: string; checksum: string; sizeBytes: number;
};
export type OfflineManifest = {
  bankId: string; scope: OfflineDownloadScope; version: number; checksum: string;
  publishedAt?: string;
  vocabulary?: { bookId: 'preview' | 'icao4' | 'icao5'; wordChecksums: Record<string, string> };
  fingerprint: string; sizeBytes: number; topics: OfflineTopic[]; resources: OfflineResource[];
};

export function offlineScopeValid(bankId: string, scope: string): scope is OfflineDownloadScope {
  if (bankId === 'vocabulary') return scope === 'preview' || scope === 'icao4' || scope === 'icao5';
  return bankId === 'sentences900' ? scope === 'icao4' || scope === 'icao5' : scope === 'selected' || scope === 'all';
}

/** The same selection used by learning; download scope never changes the study goal. */
export function offlineTopicCards<T extends { id: string; retired?: boolean; studyTier?: unknown }>(
  bankId: string, categoryTitle: string, topic: { cards: T[]; studyTier?: unknown }, scope: OfflineDownloadScope,
): T[] {
  if (bankId === 'sentences900' && scope === 'icao4' && categoryTitle === '5级') return [];
  const ids = new Set(studyScopeCardIds(bankId, topic)[scope === 'selected' ? 'selected' : 'all']);
  return topic.cards.filter(card => card.retired !== true && ids.has(card.id));
}

export function offlineScopeIncludes(saved: OfflineDownloadScope, wanted: OfflineDownloadScope) {
  return saved === wanted || saved === 'all' && wanted === 'selected' || saved === 'icao5' && wanted === 'icao4';
}

/** Opaque content IDs: Unicode letters/numbers are valid; path/control syntax is not. */
export function validContentScopeId(value: unknown): value is string {
  return typeof value === 'string' && /^[\p{L}\p{N}_-]{1,128}$/u.test(value);
}
