import { embeddedQuestionBankRepository } from '@/features/question-bank/data/repository';

import { buildHotspotSession } from '../build-hotspot-session';
import { loadHotspotBriefs } from '../repository';

describe('Hotspot Feature Integration Tests', () => {
  it('loads embedded hotspot briefs sorted by date descending', () => {
    const briefs = loadHotspotBriefs();
    expect(briefs.length).toBeGreaterThan(0);

    for (let i = 0; i < briefs.length - 1; i++) {
      expect(briefs[i].date.localeCompare(briefs[i + 1].date)).toBeGreaterThanOrEqual(0);
    }
  });

  it('builds a valid synthetic study session inheriting OPI config and excluding image cards', async () => {
    const opiDataset = await embeddedQuestionBankRepository.getDataset('opi');
    expect(opiDataset).toBeDefined();
    if (!opiDataset) return;

    const briefs = loadHotspotBriefs();
    const brief = briefs[0];

    const session = buildHotspotSession(brief, opiDataset);

    // Verify dataset inheritance
    expect(session.dataset.id).toBe('opi');
    expect(session.dataset.study).toEqual(opiDataset.study);
    expect(session.dataset.capabilities).toEqual(opiDataset.capabilities);

    // Verify synthetic category & topic
    expect(session.category.name).toContain('[热点]');
    expect(session.category.name).toContain(brief.title);
    expect(session.topic.id).toBe(brief.id);
    expect(session.topic.cards.length).toBeGreaterThan(0);

    // Verify no image cards were included
    for (const card of session.topic.cards) {
      expect(card.kind).not.toBe('image');
      expect(card.id.startsWith('opi-image-')).toBe(false);
    }
  });

  it('ensures all card references in all briefs exist in the OPI question bank', async () => {
    const opiDataset = await embeddedQuestionBankRepository.getDataset('opi');
    expect(opiDataset).toBeDefined();
    if (!opiDataset) return;

    const allCardIds = new Set<string>();
    for (const category of opiDataset.categories) {
      for (const topic of category.topics) {
        for (const card of topic.cards) {
          allCardIds.add(card.id);
        }
      }
    }

    const briefs = loadHotspotBriefs();
    for (const brief of briefs) {
      for (const topic of brief.topics) {
        for (const cardId of topic.cardIds) {
          expect(allCardIds.has(cardId)).toBe(true);
        }
      }
    }
  });
});
