import type { QuestionBankDataset, QuestionBankStudyPackage } from '@/features/question-bank/types';
import { resolveHotspotTopics } from './resolve-hotspot-topics.native';
import type { OpiHotspotBrief } from './types';

export function buildHotspotStudyPackage(brief: OpiHotspotBrief, dataset: QuestionBankDataset): QuestionBankStudyPackage {
  const topics = resolveHotspotTopics(brief, dataset);
  const id = `hotspot-${brief.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    startedAt: new Date().toISOString(),
    progressMode: 'persistent',
    items: topics.flatMap((selected) => {
      const category = dataset.categories.find((group) => group.topics.some((topic) => topic.id === selected.topicId));
      const topic = category?.topics.find((entry) => entry.id === selected.topicId);
      if (!category || !topic) throw new Error('hotspot_source_missing');
      return selected.cards.map((card) => ({ id: card.id, dataset, category, topic, card, sectionId: topic.id, sectionTitle: topic.name }));
    }),
    record: {
      id: `session-${id}`,
      bankId: 'opi', bankTitle: 'OPI 热点', categoryTitle: brief.title, topicTitle: brief.centers.join(' · '),
      recordType: 'session', source: 'hotspot', hotspot: { id: brief.id, title: brief.title, date: brief.date },
    },
  };
}
