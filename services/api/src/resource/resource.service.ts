import { timed } from '../performance/request-performance';
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { CommerceEnvironment, ResolvedResource } from '@icao/contracts';

import { API_CONFIG, type ApiConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { resourceObjects } from '../database/schema';
import { ContentAccessService } from '../content-access/content-access.service';

const EXPIRES_IN_SECONDS = 5 * 60;

@Injectable()
export class ResourceService {
  private readonly storage: SupabaseClient;
  private readonly internalUrl: string;
  private readonly publicUrl: string;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly contentAccess: ContentAccessService,
  ) {
    this.internalUrl = config.supabaseUrl.replace(/\/$/, '');
    this.publicUrl = config.supabasePublicUrl.replace(/\/$/, '');
    this.storage = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async resolve(
    accountId: string | undefined,
    publicPath: string,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    checksum?: string,
  ): Promise<ResolvedResource> {
    const [resource] = await timed('resource.lookup', () => this.database.db.select().from(resourceObjects)
      .where(and(eq(resourceObjects.sourcePath, publicPath), checksum
        ? and(eq(resourceObjects.checksum, checksum), inArray(resourceObjects.status, ['ready', 'superseded']))
        : eq(resourceObjects.status, 'ready')))
      .orderBy(desc(resourceObjects.createdAt))
      .limit(1));
    return this.authorizeAndSign(resource, accountId, publicPath, sessionId, environment);
  }

  async resolveBatch(accountId: string | undefined, resources: { publicPath: string; checksum: string }[],
    sessionId: string | undefined, environment: CommerceEnvironment): Promise<ResolvedResource[]> {
    // The controller validates the 24-item bound. Match exact path/checksum pairs,
    // selecting the same newest ready/superseded object as individual resolution.
    const rows = await timed('resource.batchLookup', () => this.database.db
      .selectDistinctOn([resourceObjects.sourcePath, resourceObjects.checksum]).from(resourceObjects)
      .where(and(inArray(resourceObjects.status, ['ready', 'superseded']), or(...resources.map(resource =>
        and(eq(resourceObjects.sourcePath, resource.publicPath), eq(resourceObjects.checksum, resource.checksum))))))
      .orderBy(resourceObjects.sourcePath, resourceObjects.checksum, desc(resourceObjects.createdAt)));
    const byPair = new Map(rows.map(row => [JSON.stringify([row.sourcePath, row.checksum]), row]));
    const results: ResolvedResource[] = [];
    // Retain per-resource permission checks and the existing four-at-a-time signing
    // bound. Do not cache authorizations or signed URLs across consumers/requests.
    for (let offset = 0; offset < resources.length; offset += 4) {
      results.push(...await Promise.all(resources.slice(offset, offset + 4).map(resource =>
        this.authorizeAndSign(byPair.get(JSON.stringify([resource.publicPath, resource.checksum])),
          accountId, resource.publicPath, sessionId, environment))));
    }
    return results;
  }

  private async authorizeAndSign(resource: typeof resourceObjects.$inferSelect | undefined,
    accountId: string | undefined, publicPath: string, sessionId: string | undefined, environment: CommerceEnvironment): Promise<ResolvedResource> {
    if (!resource) throw new NotFoundException('resource_not_found');
    if (publicPath.startsWith('/question-bank-assets/')) {
      await timed('resource.access', () => this.contentAccess.assertResourceAccess(
        accountId,
        resource.module,
        publicPath,
        sessionId,
        environment,
      ));
    }
    const { data, error } = await timed('resource.sign', () => this.storage.storage.from(resource.storageBucket).createSignedUrl(resource.objectKey, EXPIRES_IN_SECONDS));
    if (error || !data.signedUrl) throw new ServiceUnavailableException('resource_signing_failed');
    return {
      publicPath,
      objectKey: resource.objectKey,
      checksum: resource.checksum,
      sizeBytes: resource.sizeBytes,
      mimeType: resource.mimeType,
      url: data.signedUrl.replace(this.internalUrl, this.publicUrl),
      expiresIn: EXPIRES_IN_SECONDS,
    };
  }
}
