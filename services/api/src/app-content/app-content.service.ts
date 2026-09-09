import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { canonicalAppContentJson, isAppContentSnapshot, type AppContentRelease } from '@icao/contracts/app-content';
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
