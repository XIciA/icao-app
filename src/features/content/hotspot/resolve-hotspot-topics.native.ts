import type { QuestionBankDataset } from '@/features/question-bank/types';
import type { OpiHotspotBrief, ResolvedOpiHotspotTopic } from './types';

/** Native packages retain original OPI identities, including existing picture cards. */
export function resolveHotspotTopics(brief: OpiHotspotBrief, dataset: QuestionBankDataset): ResolvedOpiHotspotTopic[] {
  const topics = new Map(dataset.categories.flatMap(category => category.topics.map(topic => [topic.id, topic] as const)));
  const seen = new Set<string>();
  return brief.topics.map(selected => {
    const topic = topics.get(selected.topicId);
    if (!topic) throw new Error(`热点话题不存在：${selected.topicId}`);
    const cards = selected.cardIds.map(id => {
      if (seen.has(id)) throw new Error(`热点题目重复：${id}`);
      const card = topic.cards.find(candidate => candidate.id === id);
      if (!card) throw new Error(`热点题目不属于对应话题：${id}`);
      seen.add(id);
      return card;
    });
    if (!cards.length) throw new Error(`热点话题没有可学习题目：${selected.topicId}`);
    return { ...selected, topicTitle: topic.name, cards };
  });
}
