import completeQuestionBanks from '@/features/question-bank/data/question-bank.json';
import type { QuestionBankDataset } from '@/features/question-bank/types';

import { buildHotspotSession, resolveHotspotTopics } from '../build-hotspot-session';
import { getHotspotBrief, loadHotspotBriefs } from '../repository';

describe('OPI hotspot data and study session', () => {
  const dataset = (completeQuestionBanks as QuestionBankDataset[]).find((bank) => bank.id === 'opi');

  it('loads unique briefs in descending date order', () => {
    const briefs = loadHotspotBriefs();
    expect(briefs).toHaveLength(16);
    expect(new Set(briefs.map((brief) => brief.id)).size).toBe(briefs.length);
    for (let index = 0; index < briefs.length - 1; index += 1) {
      expect(briefs[index].date.localeCompare(briefs[index + 1].date)).toBeGreaterThan(0);
    }
    expect(getHotspotBrief(briefs[0].id)).toBe(briefs[0]);
  });

  it('resolves every card from its declared OPI topic and excludes image questions', async () => {
    expect(dataset).toBeDefined();
    if (!dataset) return;

    for (const brief of loadHotspotBriefs()) {
      const resolved = resolveHotspotTopics(brief, dataset);
      expect(resolved).toHaveLength(brief.topics.length);
      const cards = resolved.flatMap((topic) => topic.cards);
      expect(cards).toHaveLength(brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0));
      expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
      expect(cards.every((card) => card.kind !== 'image' && !card.id.startsWith('opi-image-'))).toBe(true);
    }
  });

  it('builds a hotspot session with the shared OPI study behavior and record marker', async () => {
    expect(dataset).toBeDefined();
    if (!dataset) return;

    const brief = loadHotspotBriefs()[0];
    const session = buildHotspotSession(brief, dataset);
    expect(session.dataset.id).toBe('opi');
    expect(session.dataset.study).toEqual(dataset.study);
    expect(session.dataset.capabilities).toEqual(dataset.capabilities);
    expect(session.category.name).toBe(`[热点] ${brief.title}`);
    expect(session.topic.id).toBe(brief.id);
  });

  it('fails closed when a card is assigned to the wrong topic', async () => {
    expect(dataset).toBeDefined();
    if (!dataset) return;

    const brief = loadHotspotBriefs()[0];
    const corrupted = {
      ...brief,
      topics: brief.topics.map((topic, index) => index === 0
        ? { ...topic, cardIds: [brief.topics[1].cardIds[0]] }
        : topic),
    };
    expect(() => resolveHotspotTopics(corrupted, dataset)).toThrow('热点题目不属于对应话题');
  });
});
