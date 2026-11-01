import { VersionedReadCache } from '../content/versioned-read-cache';
import { timed, timedSync } from '../performance/request-performance';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { canonicalAppContentJson, isAppContentSnapshot, compatibleHotspotBriefs, dailyHotspotTitle, type AppContentRelease } from '@icao/contracts/app-content';
import { and, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { appContentReleases } from '../database/schema';

@Injectable()
export class AppContentService {
  private readonly releases = new VersionedReadCache<AppContentRelease>();
  private readonly formats = new VersionedReadCache<AppContentRelease>();
  constructor(private readonly database: DatabaseService) {}

  async publicRelease(format: string | undefined): Promise<AppContentRelease> {
    const release = await this.get();
    const supported = format === '3' ? '3' : format === '2' ? '2' : 'legacy';
    if (supported === '3') return release;
    return this.formats.get(JSON.stringify([release.version, release.checksum, supported]), async () =>
      timedSync('app_content.project', () => supported === '2' ? compatibleHotspotRelease(release) : legacyHotspotRelease(release)));
  }

  async get(reader: Pick<DatabaseService['db'], 'select'> = this.database.db): Promise<AppContentRelease> {
    // Transactional callers (including legal acceptance) must see their transaction's
    // version and must never publish uncommitted content to the process cache.
    if (reader !== this.database.db) {
      const [row] = await reader.select().from(appContentReleases)
        .where(eq(appContentReleases.active, true)).orderBy(desc(appContentReleases.version)).limit(1);
      return this.validate(row);
    }
    const [metadata] = await timed('app_content.metadata', () => reader.select({
      version: appContentReleases.version, checksum: appContentReleases.checksum,
    }).from(appContentReleases).where(eq(appContentReleases.active, true))
      .orderBy(desc(appContentReleases.version)).limit(1));
    if (!metadata) throw new NotFoundException('app_content_release_not_found');
    return this.releases.get(JSON.stringify([metadata.version, metadata.checksum]), async () => {
      const [row] = await timed('app_content.payload', () => reader.select().from(appContentReleases)
        .where(and(eq(appContentReleases.version, metadata.version), eq(appContentReleases.checksum, metadata.checksum)))
        .orderBy(desc(appContentReleases.version)).limit(1));
      return timedSync('app_content.validate', () => this.validate(row));
    });
  }

  private validate(row: typeof appContentReleases.$inferSelect | undefined): AppContentRelease {
    if (!row) throw new NotFoundException('app_content_release_not_found');
    if (!isAppContentSnapshot(row.payload) || row.payload.version !== row.version) {
      throw new ServiceUnavailableException('app_content_release_invalid');
    }
    // JSONB normalizes object key order; use canonical JSON on both publisher and reader.
    if (appContentChecksum(row.payload) !== row.checksum) throw new ServiceUnavailableException('app_content_checksum_mismatch');
    return { version: row.version, checksum: row.checksum, payload: row.payload };
  }
}

export function appContentChecksum(value: unknown) {
  return createHash('sha256').update(canonicalAppContentJson(value)).digest('hex');
}

/** Older clients require one brief per date; preserve their readable directory. */
export function legacyHotspotRelease(release: AppContentRelease): AppContentRelease {
  const byDate = new Map<string, AppContentRelease['payload']['hotspots']['briefs'][number]>();
  for (const source of compatibleHotspotBriefs(release.payload.hotspots.briefs)) {
    const prior = byDate.get(source.date);
    if (!prior) {
      byDate.set(source.date, { ...source, centers: [...source.centers], topics: source.topics.map(topic => ({ ...topic, cardIds: [...topic.cardIds] })) });
      continue;
    }
    prior.centers = [...new Set([...prior.centers, ...source.centers])];
    prior.title = dailyHotspotTitle(source.date);
    for (const topic of source.topics) {
      const existing = prior.topics.find(candidate => candidate.topicId === topic.topicId);
      if (existing) existing.cardIds = [...new Set([...existing.cardIds, ...topic.cardIds])];
      else prior.topics.push({ ...topic, cardIds: [...topic.cardIds] });
    }
  }
  const payload = { ...release.payload, hotspots: { ...release.payload.hotspots, briefs: [...byDate.values()] } };
  return { ...release, payload, checksum: appContentChecksum(payload) };
}

export function compatibleHotspotRelease(release: AppContentRelease): AppContentRelease {
  const payload={...release.payload,hotspots:{...release.payload.hotspots,briefs:compatibleHotspotBriefs(release.payload.hotspots.briefs)}};
  return {...release,payload,checksum:appContentChecksum(payload)};
}
