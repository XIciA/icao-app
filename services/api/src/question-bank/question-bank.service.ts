import { directoryVersionForClient } from '../content-access/directory-client-context';
import type { OfflineDownloadScope } from '@icao/contracts';
import { VersionedReadCache } from '../content/versioned-read-cache';
import { timed } from '../performance/request-performance';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
  private readonly releasePaths = new VersionedReadCache<string[]>({ maxBytes: 8 * 1024 * 1024 });
  constructor(
    private readonly database: DatabaseService,
    private readonly contentAccess: ContentAccessService,
  ) {}

  async offlineManifest(bankId: string, scope: OfflineDownloadScope,
    accountId: string | undefined, sessionId: string | undefined, environment: CommerceEnvironment) {
    return this.contentAccess.offlineManifest(bankId, scope, accountId, sessionId, environment);
  }

  async list(): Promise<QuestionBankReleaseSummary[]> {
    const selection = {
      bankId: questionBankReleases.bankId, version: questionBankReleases.version, checksum: questionBankReleases.checksum,
      createdAt: questionBankReleases.createdAt,
      compatibility: sql<{capability:string;fallbackVersion:number}|null>`${questionBankReleases.payload}->'directoryCompatibility'`,
      title: sql<unknown>`${questionBankReleases.payload}->'title'`,
      declaredTopicCount: sql<unknown>`${questionBankReleases.payload}->'declaredTopicCount'`,
      declaredCardCount: sql<unknown>`${questionBankReleases.payload}->'declaredCardCount'`,
    };
    const activeRows = await timed('content.summary.metadata', () => this.database.db.select(selection).from(questionBankReleases).where(eq(questionBankReleases.active, true)).orderBy(questionBankReleases.bankId));
    const rows = await Promise.all(activeRows.map(async row => {
      const version = directoryVersionForClient(row.bankId,row,false);
      if (!version || version === row.version) return row;
      const [compatible] = await this.database.db.select(selection).from(questionBankReleases).where(and(eq(questionBankReleases.bankId,row.bankId),eq(questionBankReleases.version,version))).limit(1);
      if (!compatible) throw new NotFoundException('question_bank_not_found');
      return compatible;
    }));
    const pathsByBank = await Promise.all(rows.map(row => this.releasePaths.get(JSON.stringify([row.bankId, row.version, row.checksum]), async () => {
      const [release] = await timed('content.summary.paths', () => this.database.db.select({ payload: questionBankReleases.payload })
        .from(questionBankReleases).where(and(eq(questionBankReleases.bankId, row.bankId), eq(questionBankReleases.version, row.version), eq(questionBankReleases.checksum, row.checksum))).limit(1));
      if (!release) throw new NotFoundException('question_bank_not_found');
      const metadata = release.payload as DatasetMetadata;
      return [...new Set(metadata.categories?.flatMap(category => category.topics.flatMap(topic => topic.cards.flatMap(card => card.retired ? [] : [card.audio, card.image].filter((path): path is string => Boolean(path))))) ?? [])];
    })));
    const allPaths = [...new Set(pathsByBank.flat())];
    const resources = allPaths.length ? await timed('content.summary.resources', () => this.database.db.select({ sourcePath: resourceObjects.sourcePath, createdAt: resourceObjects.createdAt })
      .from(resourceObjects).where(and(eq(resourceObjects.status, 'ready'), inArray(resourceObjects.sourcePath, allPaths)))) : [];
    const dates = new Map<string, Date>();
    for (const resource of resources) {
      const previous = dates.get(resource.sourcePath);
      if (!previous || resource.createdAt > previous) dates.set(resource.sourcePath, resource.createdAt);
    }
    return rows.map((row, index) => {

      return {
        bankId: row.bankId,
        publishedAt: contentPublicationTime(row.createdAt, pathsByBank[index]!.map(path => ({ createdAt: dates.get(path) }))),
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
