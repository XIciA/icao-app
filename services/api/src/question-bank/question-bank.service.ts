import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { CommerceEnvironment, QuestionBankRelease, QuestionBankReleaseSummary } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { questionBankReleases } from '../database/schema';
import { ContentAccessService } from '../content-access/content-access.service';

type DatasetMetadata = {
  title?: unknown;
  declaredTopicCount?: unknown;
  declaredCardCount?: unknown;
};

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly database: DatabaseService,
    private readonly contentAccess: ContentAccessService,
  ) {}

  async list(): Promise<QuestionBankReleaseSummary[]> {
    const rows = await this.database.db.select().from(questionBankReleases).where(eq(questionBankReleases.active, true)).orderBy(questionBankReleases.bankId);
    return rows.map((row) => {
      const metadata = row.payload as DatasetMetadata;
      return {
        bankId: row.bankId,
        version: row.version,
        checksum: row.checksum,
        title: typeof metadata.title === 'string' ? metadata.title : row.bankId,
        declaredTopicCount: typeof metadata.declaredTopicCount === 'number' ? metadata.declaredTopicCount : 0,
        declaredCardCount: typeof metadata.declaredCardCount === 'number' ? metadata.declaredCardCount : 0,
      };
    });
  }

  async get(
    bankId: string,
    accountId: string,
    sessionId: string,
    environment: CommerceEnvironment,
  ): Promise<QuestionBankRelease> {
    return this.contentAccess.getCatalog(bankId, accountId, sessionId, environment);
  }

  async getTopic(
    bankId: string,
    categoryId: string,
    topicId: string,
    accountId: string,
    sessionId: string,
    environment: CommerceEnvironment,
  ) {
    return this.contentAccess.getTopic(bankId, categoryId, topicId, accountId, sessionId, environment);
  }
}
