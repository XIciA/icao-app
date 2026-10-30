import { studyScopeCardIds } from './index.ts';

export type OfflineDownloadScope = 'selected' | 'all' | 'icao4' | 'icao5';
export type OfflineResource = { publicPath: string; checksum: string; sizeBytes: number };
export type OfflineTopic = {
  bankId: string; categoryId: string; topicId: string;
  cardIds: string[]; cardChecksums: Record<string, string>; cardResources: Record<string, string[]>; metadataChecksum: string; checksum: string; sizeBytes: number;
};
export type OfflineManifest = {
  bankId: string; scope: OfflineDownloadScope; version: number; checksum: string;
  fingerprint: string; sizeBytes: number; topics: OfflineTopic[]; resources: OfflineResource[];
};

export function offlineScopeValid(bankId: string, scope: string): scope is OfflineDownloadScope {
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
