import type { OfflineDownloadScope } from '@icao/contracts';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { CommerceEnvironment, QuestionBankRelease, QuestionBankReleaseSummary } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { contentPublicationTime } from '../content-access/publication-time';
import { questionBankReleases, resourceObjects } from '../database/schema';
import { ContentAccessService } from '../content-access/content-access.service';

type DatasetMetadata = {
  categories?: { topics: { cards: { retired?: boolean; audio?: string; image?: string }[] }[] }[];
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

  async offlineManifest(bankId: string, scope: OfflineDownloadScope,
    accountId: string | undefined, sessionId: string | undefined, environment: CommerceEnvironment) {
    return this.contentAccess.offlineManifest(bankId, scope, accountId, sessionId, environment);
  }

  async list(): Promise<QuestionBankReleaseSummary[]> {
    const rows = await this.database.db.select().from(questionBankReleases).where(eq(questionBankReleases.active, true)).orderBy(questionBankReleases.bankId);
    const resources = await this.database.db.select({ sourcePath: resourceObjects.sourcePath, createdAt: resourceObjects.createdAt }).from(resourceObjects).where(eq(resourceObjects.status, 'ready'));
    return rows.map((row) => {
      const metadata = row.payload as DatasetMetadata;
      const paths = new Set(metadata.categories?.flatMap(category => category.topics.flatMap(topic => topic.cards.flatMap(card => card.retired ? [] : [card.audio, card.image].filter(Boolean)))) ?? []);
      return {
        bankId: row.bankId,
        publishedAt: contentPublicationTime(row.createdAt, resources.filter(resource => paths.has(resource.sourcePath))),
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
