import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { canonicalAppContentJson, isAppContentSnapshot, compatibleHotspotBriefs, dailyHotspotTitle, type AppContentRelease } from '@icao/contracts/app-content';
import { desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { appContentReleases } from '../database/schema';

@Injectable()
export class AppContentService {
  constructor(private readonly database: DatabaseService) {}

  async get(reader: Pick<DatabaseService['db'], 'select'> = this.database.db): Promise<AppContentRelease> {
    const [row] = await reader.select().from(appContentReleases)
      .where(eq(appContentReleases.active, true)).orderBy(desc(appContentReleases.version)).limit(1);
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
