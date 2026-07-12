import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { QuestionBankRelease, QuestionBankReleaseSummary } from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { questionBankReleases } from '../database/schema';

type DatasetMetadata = {
  title?: unknown;
  declaredTopicCount?: unknown;
  declaredCardCount?: unknown;
};

@Injectable()
export class QuestionBankService {
  constructor(private readonly database: DatabaseService) {}

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

  async get(bankId: string): Promise<QuestionBankRelease> {
    const [row] = await this.database.db.select().from(questionBankReleases)
      .where(eq(questionBankReleases.bankId, bankId))
      .orderBy(desc(questionBankReleases.version))
      .limit(1);
    if (!row || !row.active) throw new NotFoundException('question_bank_not_found');
    return { bankId: row.bankId, version: row.version, checksum: row.checksum, dataset: row.payload };
  }
}
