import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { canonicalVocabularyJson, validateVocabularyLiveContent, type VocabularyLiveContent, type VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { vocabularyReleases } from '../database/schema';

export const VOCABULARY_PUBLICATION_LOCK = 1863401;
export const vocabularyContentChecksum = (content: VocabularyLiveContent) => createHash('sha256').update(canonicalVocabularyJson(content)).digest('hex');
type Reader = Pick<DatabaseService['db'], 'select'>;

@Injectable()
export class VocabularyLiveService {
  private cached?: VocabularyLiveRelease;
  private bundled?: VocabularyLiveRelease;
  constructor(private readonly database: DatabaseService) {}

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
