import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { canonicalVocabularyJson, vocabularyLivePayload, validateVocabularyLiveContent, type VocabularyLiveContent, type VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { contentPublicationTime } from '../content-access/publication-time';
import { normalizeVocabularyPronunciation } from '@icao/contracts/vocabulary-live';
import type { OfflineManifest } from '@icao/contracts';
import { vocabularyReleases, resourceObjects } from '../database/schema';

export const VOCABULARY_PUBLICATION_LOCK = 1863401;
export const vocabularyContentChecksum = (content: VocabularyLiveContent) => createHash('sha256').update(canonicalVocabularyJson(vocabularyLivePayload(content))).digest('hex');
type Reader = Pick<DatabaseService['db'], 'select'>;

@Injectable()
export class VocabularyLiveService {
  private cached?: VocabularyLiveRelease;
  private bundled?: VocabularyLiveRelease;
  constructor(private readonly database: DatabaseService) {}

  async offlineManifest(bookId: string): Promise<OfflineManifest> {
    if (!['preview', 'icao4', 'icao5'].includes(bookId)) throw new BadRequestException('invalid_download_scope');
    const release = await this.get();
    const book = release.dataset.books.find(item => item.id === bookId);
    if (!book) throw new ServiceUnavailableException('vocabulary_book_unavailable');
    const paths = [...new Set(book.words.flatMap(word => [word.pronunciationText || word.word, word.example].filter(Boolean).map(text =>
      `/pronunciation-assets/${createHash('sha256').update(normalizeVocabularyPronunciation(text)).digest('hex')}.mp3`)))].sort();
    const rows = await this.database.db.select().from(resourceObjects).where(and(eq(resourceObjects.status, 'ready'), inArray(resourceObjects.sourcePath, paths))).orderBy(desc(resourceObjects.createdAt));
    const byPath = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!byPath.has(row.sourcePath)) byPath.set(row.sourcePath, row);
    const resources = paths.map(publicPath => {
      const row = byPath.get(publicPath);
      if (!row) throw new ServiceUnavailableException('download_resource_unavailable');
      return { publicPath, checksum: row.checksum, sizeBytes: row.sizeBytes };
    });
    const vocabulary = { bookId: bookId as 'preview' | 'icao4' | 'icao5', wordChecksums: Object.fromEntries(book.words.map(word => [word.id, createHash('sha256').update(canonicalVocabularyJson(word)).digest('hex')])) };
    const [published] = await this.database.db.select({ createdAt: vocabularyReleases.createdAt }).from(vocabularyReleases).where(eq(vocabularyReleases.version, release.version)).limit(1);
    return { bankId: 'vocabulary', scope: vocabulary.bookId, vocabulary, version: release.version, checksum: release.checksum,
      publishedAt: contentPublicationTime(published?.createdAt, [...byPath.values()]), topics: [], resources,
      sizeBytes: Buffer.byteLength(JSON.stringify(book)) + resources.reduce((sum, resource) => sum + resource.sizeBytes, 0),
      fingerprint: createHash('sha256').update(canonicalVocabularyJson({ vocabulary, resources })).digest('hex') };
  }

  baseline(): VocabularyLiveRelease {
    if (this.bundled) return this.bundled;
    const path = [join(__dirname, 'live.json'), resolve(process.cwd(), '../../content/vocabulary/live/release.json'), resolve(process.cwd(), 'content/vocabulary/live/release.json')].find(candidate => existsSync(candidate));
    if (!path) throw new ServiceUnavailableException('vocabulary_live_baseline_missing');
    const content = validateVocabularyLiveContent(JSON.parse(readFileSync(path, 'utf8')));
    return this.bundled = { ...content, checksum: vocabularyContentChecksum(content) };
  }

  async get(reader: Reader = this.database.db): Promise<VocabularyLiveRelease> {
    const [metadata] = await reader.select({version:vocabularyReleases.version,checksum:vocabularyReleases.checksum}).from(vocabularyReleases)
      .where(eq(vocabularyReleases.active, true)).orderBy(desc(vocabularyReleases.version)).limit(1);
    if (!metadata) {
      const [history] = await reader.select({version:vocabularyReleases.version}).from(vocabularyReleases).limit(1);
      if (history) throw new ServiceUnavailableException('vocabulary_live_active_release_missing');
      return this.baseline();
    }
    if (this.cached?.version === metadata.version && this.cached.checksum === metadata.checksum) return this.cached;
    // Read by immutable version: publication may switch active while this request is running.
    const [row] = await reader.select().from(vocabularyReleases).where(eq(vocabularyReleases.version, metadata.version)).limit(1);
    if (!row) throw new ServiceUnavailableException('vocabulary_live_release_missing');
    try {
      const content = validateVocabularyLiveContent(row.payload);
      if (content.version !== row.version || vocabularyContentChecksum(content) !== row.checksum) throw new Error('checksum');
      const release = { ...content, checksum: row.checksum };
      if (!this.cached || release.version >= this.cached.version) this.cached = release;
      return release;
    } catch { throw new ServiceUnavailableException('vocabulary_live_release_invalid'); }
  }
}
