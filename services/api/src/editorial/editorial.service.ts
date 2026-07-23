import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type {
  EditorialArticle,
  EditorialArticleSummary,
  EditorialChannel,
  EditorialDetailResponse,
  EditorialListResponse,
  EditorialReleaseSnapshot,
} from '@icao/contracts';

import { DatabaseService } from '../database/database.service';
import { editorialReleases } from '../database/schema';

type ActiveRelease = {
  version: number;
  checksum: string;
  payload: EditorialReleaseSnapshot;
};

type StoredEditorialArticle = EditorialArticle & { editorial?: unknown };

@Injectable()
export class EditorialService {
  constructor(private readonly database: DatabaseService) {}

  async list(channel: EditorialChannel): Promise<EditorialListResponse> {
    const release = await this.getActiveRelease();
    const items = release.payload.articles
      .filter((article) => article.channel === channel)
      .map((article) => {
        const value = this.publicArticle(article);
        return {
          id: value.id,
          slug: value.slug,
          version: value.version,
          channel: value.channel,
          category: value.category,
          badge: value.badge,
          title: value.title,
          summary: value.summary,
          tags: value.tags,
          publishedAt: value.publishedAt,
          cover: value.cover,
        } satisfies EditorialArticleSummary;
      });
    return { version: release.version, checksum: release.checksum, items };
  }

  async get(slug: string): Promise<EditorialDetailResponse> {
    const release = await this.getActiveRelease();
    const storedArticle = release.payload.articles.find((candidate) => candidate.slug === slug);
    if (!storedArticle) throw new NotFoundException('editorial_not_found');
    return { version: release.version, checksum: release.checksum, article: this.publicArticle(storedArticle) };
  }

  private async getActiveRelease(): Promise<ActiveRelease> {
    const [row] = await this.database.db.select().from(editorialReleases)
      .where(eq(editorialReleases.active, true))
      .orderBy(desc(editorialReleases.version))
      .limit(1);
    if (!row) throw new NotFoundException('editorial_release_not_found');
    const payload = row.payload as Partial<EditorialReleaseSnapshot>;
    if (payload.schemaVersion !== 1 || payload.version !== row.version || !Array.isArray(payload.articles)) {
      throw new ServiceUnavailableException('editorial_release_invalid');
    }
    return {
      version: row.version,
      checksum: row.checksum,
      payload: payload as EditorialReleaseSnapshot,
    };
  }

  private publicArticle(stored: EditorialArticle): EditorialArticle {
    const article = { ...stored } as StoredEditorialArticle;
    delete article.editorial;
    return article;
  }
}
