import type { OfflineDownloadScope } from '@icao/contracts';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { CommerceEnvironment, QuestionBankRelease, QuestionBankReleaseSummary } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { questionBankReleases } from '../database/schema';
import { ContentAccessService } from '../content-access/content-access.service';

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly database: DatabaseService,
    private readonly contentAccess: ContentAccessService,
  ) {}

  async offlineManifest(bankId: string, scope: OfflineDownloadScope,
    accountId: string | undefined, sessionId: string | undefined, environment: CommerceEnvironment) {
    return this.contentAccess.offlineManifest(bankId, scope, accountId, sessionId, environment);
  }

  async list(): Promise<QuestionBankReleaseSummary[]> {
    const rows = await this.database.db.select({
      bankId: questionBankReleases.bankId, version: questionBankReleases.version, checksum: questionBankReleases.checksum,
      title: sql<unknown>`${questionBankReleases.payload}->'title'`,
      declaredTopicCount: sql<unknown>`${questionBankReleases.payload}->'declaredTopicCount'`,
      declaredCardCount: sql<unknown>`${questionBankReleases.payload}->'declaredCardCount'`,
    }).from(questionBankReleases).where(eq(questionBankReleases.active, true)).orderBy(questionBankReleases.bankId);
    return rows.map((row) => {
      return {
        bankId: row.bankId,
        version: row.version,
        checksum: row.checksum,
        title: typeof row.title === 'string' ? row.title : row.bankId,
        declaredTopicCount: typeof row.declaredTopicCount === 'number' ? row.declaredTopicCount : 0,
        declaredCardCount: typeof row.declaredCardCount === 'number' ? row.declaredCardCount : 0,
      };
    });
  }

  async get(
    bankId: string,
    accountId: string | undefined,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
  ): Promise<QuestionBankRelease> {
    return this.contentAccess.getCatalog(bankId, accountId, sessionId, environment);
  }

  async getTopic(
    bankId: string,
    categoryId: string,
    topicId: string,
    accountId: string | undefined,
    sessionId: string | undefined,
    environment: CommerceEnvironment,
    expected?: { version: number; checksum?: string },
  ) {
    return this.contentAccess.getTopic(bankId, categoryId, topicId, accountId, sessionId, environment, new Date(), expected);
  }
}
