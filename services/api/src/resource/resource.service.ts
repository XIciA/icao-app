import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, desc, eq, inArray } from 'drizzle-orm';
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
    if (publicPath.startsWith('/editorial-assets/')) {
      if (!accountId || !sessionId) throw new ForbiddenException('membership_required');
      await this.contentAccess.assertMembership(accountId, sessionId, environment);
    }
    const [resource] = await this.database.db.select().from(resourceObjects)
      .where(and(eq(resourceObjects.sourcePath, publicPath), checksum
        ? and(eq(resourceObjects.checksum, checksum), inArray(resourceObjects.status, ['ready', 'superseded']))
        : eq(resourceObjects.status, 'ready')))
      .orderBy(desc(resourceObjects.createdAt))
      .limit(1);
    if (!resource) throw new NotFoundException('resource_not_found');
    if (publicPath.startsWith('/question-bank-assets/')) {
      await this.contentAccess.assertResourceAccess(
        accountId,
        resource.module,
        publicPath,
        sessionId,
        environment,
      );
    }
    const { data, error } = await this.storage.storage.from(resource.storageBucket).createSignedUrl(resource.objectKey, EXPIRES_IN_SECONDS);
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
