import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalVocabularyJson, normalizeVocabularyPronunciation } from '@icao/contracts/vocabulary-live';
import { VocabularyLiveService } from '../src/vocabulary/vocabulary-live.service';
import { vocabularyReleases } from '../src/database/schema';
import type { DatabaseService } from '../src/database/database.service';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  let resources: { sourcePath: string; checksum: string; sizeBytes: number; createdAt: Date }[] = [];
  const db = { select: () => ({ from: (table: unknown) => ({ where: () => ({ orderBy: async () => resources, limit: async () => table === vocabularyReleases ? [{ createdAt: new Date('2026-10-01T00:00:00Z') }] : [] }) }) }) };
  const service = new VocabularyLiveService({ db } as unknown as DatabaseService);
  const release = structuredClone(service.baseline());
  release.dataset.books.forEach(book => { book.words = book.words.slice(0, 3); });
  const paths = new Set(release.dataset.books.flatMap(book => book.words.flatMap(word => [word.pronunciationText || word.word, word.example].filter(Boolean).map(text => `/pronunciation-assets/${hash(normalizeVocabularyPronunciation(text))}.mp3`))));
  resources = [...paths].map(sourcePath => ({ sourcePath, checksum: 'a'.repeat(64), sizeBytes: 100, createdAt: new Date('2026-09-01T00:00:00Z') }));
  vi.spyOn(service, 'get').mockResolvedValue(release);
  return { service, release, resources };
}
describe('vocabulary downloads use published words and recorded audio', () => {
  it.each(['preview', 'icao4', 'icao5'])('builds the independent %s book package with exact playable pronunciation paths', async id => {
    const { service, release } = fixture();
    const manifest = await service.offlineManifest(id);
    const book = release.dataset.books.find(book => book.id === id)!;
    expect(manifest.vocabulary?.wordChecksums).toEqual(Object.fromEntries(book.words.map(word => [word.id, hash(canonicalVocabularyJson(word))])));
    expect(manifest.resources.length).toBeGreaterThanOrEqual(3);
    expect(manifest.resources.every(resource => /^\/pronunciation-assets\/[a-f0-9]{64}\.mp3$/.test(resource.publicPath))).toBe(true);
    expect(manifest.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(manifest.sizeBytes).toBe(Buffer.byteLength(JSON.stringify(book)) + manifest.resources.length * 100);
    expect(manifest.topics).toEqual([]);
  });
  it('detects a text edit and same-path audio replacement, but not another book edit', async () => {
    const { service, release, resources } = fixture();
    const before = await service.offlineManifest('preview');
    release.dataset.books[1]!.words[0]!.meaning = '另一本的修改';
    expect((await service.offlineManifest('preview')).fingerprint).toBe(before.fingerprint);
    release.dataset.books[0]!.words[0]!.meaning = '本书的修改';
    const edited = await service.offlineManifest('preview');
    expect(edited.fingerprint).not.toBe(before.fingerprint);
    resources.find(row => row.sourcePath === edited.resources[0]!.publicPath)!.checksum = 'b'.repeat(64);
    expect((await service.offlineManifest('preview')).fingerprint).not.toBe(edited.fingerprint);
  });
  it('never advertises a complete package when a required example audio is missing', async () => {
    const { service, resources } = fixture();
    resources.length = 0;
    await expect(service.offlineManifest('preview')).rejects.toThrow('download_resource_unavailable');
    await expect(service.offlineManifest('all')).rejects.toThrow('invalid_download_scope');
  });
});
