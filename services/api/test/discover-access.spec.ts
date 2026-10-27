import { describe, expect, it, vi } from 'vitest';
import type { AppContentHotspotBrief } from '@icao/contracts/app-content';
import { ContentAccessService } from '../src/content-access/content-access.service';
import { VocabularyController } from '../src/vocabulary/vocabulary.controller';
import { EditorialController } from '../src/editorial/editorial.controller';

const brief: AppContentHotspotBrief = { id: 'day', date: '2026-10-26', title: '热点', centers: ['北京'],
  topics: [{ topicId: 'topic', topicTitle: 'Weather', cardIds: ['paid'] }] };
function overviewService(retired = false) {
  const payload = { id: 'opi', categories: [{ id: 'category', topics: [{ id: 'topic', cards: [{
    id: 'paid', audioText: 'How do you avoid thunderstorms?', audio: '/private.mp3',
    referenceAnswer: 'protected answer', reportedPrompts: { source: ['What are the risks of thunderstorms?'] }, retired,
  }] }] }] };
  const chain = { from: () => chain, where: () => chain, orderBy: () => chain,
    limit: async () => [{ bankId: 'opi', version: 1, checksum: 'a'.repeat(64), payload }] };
  return new ContentAccessService({} as never, { db: { select: () => chain } } as never);
}
const reply = () => ({ header: vi.fn().mockReturnThis(), status: vi.fn() });

describe('discovery free access', () => {
  it('projects paid hotspot questions publicly without answers, audio or study data', async () => {
    const result = await overviewService().hotspotOverview(brief);
    expect(result.topics[0]!.cards).toEqual([{ id: 'paid', prompt: 'How do you avoid thunderstorms?',
      reportedPrompts: { source: ['What are the risks of thunderstorms?'] } }]);
    expect(JSON.stringify(result)).not.toContain('protected answer');
    expect(JSON.stringify(result)).not.toContain('/private.mp3');
    expect(Object.keys(result)).toEqual(['brief', 'topics']);
  });
  it('rejects missing/retired questions rather than returning an incomplete overview', async () => {
    await expect(overviewService(true).hotspotOverview(brief)).rejects.toThrow('hotspot_question_unavailable');
  });
  it('serves vocabulary without an authenticated account or membership', async () => {
    const release = { checksum: 'a'.repeat(64), dataset: { books: [] } };
    const controller = new VocabularyController({ get: () => release } as never, {} as never);
    expect((await controller.get(undefined, { id: 'guest' } as never, reply() as never))?.data).toBe(release);
  });
  it('serves resource lists and details without an authenticated account or membership', async () => {
    const result = { checksum: 'a'.repeat(64), items: [] };
    const controller = new EditorialController({ list: async () => result, get: async () => result } as never);
    expect((await controller.list('resource', undefined, { id: 'guest' } as never, reply() as never))?.data).toBe(result);
    expect((await controller.get('article', undefined, { id: 'guest' } as never, reply() as never))?.data).toBe(result);
  });
});
