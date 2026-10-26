import type {
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import type { OpiHotspotBrief, ResolvedOpiHotspotTopic } from './types';

export type HotspotSessionResult = {
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
};

export function resolveHotspotTopics(
  brief: OpiHotspotBrief,
  opiDataset: QuestionBankDataset,
): ResolvedOpiHotspotTopic[] {
  const topicMap = new Map<string, QuestionBankTopic>();
  for (const category of opiDataset.categories) {
    for (const topic of category.topics) topicMap.set(topic.id, topic);
  }

  const seenCardIds = new Set<string>();
  return brief.topics.map((hotspotTopic) => {
    const sourceTopic = topicMap.get(hotspotTopic.topicId);
    if (!sourceTopic) {
      throw new Error(`热点话题不存在：${hotspotTopic.topicId}`);
    }

    const cardsById = new Map(sourceTopic.cards.map((card) => [card.id, card]));
    const cards = hotspotTopic.cardIds.map((cardId) => {
      if (seenCardIds.has(cardId)) throw new Error(`热点题目重复：${cardId}`);
      const card = cardsById.get(cardId);
      if (!card) throw new Error(`热点题目不属于对应话题：${cardId}`);
      if (card.kind === 'image' || card.id.startsWith('opi-image-')) {
        throw new Error(`热点题目暂不支持图片题：${cardId}`);
      }
      seenCardIds.add(cardId);
      return card;
    });

    if (cards.length === 0) throw new Error(`热点话题没有可学习题目：${hotspotTopic.topicId}`);
    return { ...hotspotTopic, topicTitle: sourceTopic.name, cards };
  });
}

export function buildHotspotSession(
  brief: OpiHotspotBrief,
  opiDataset: QuestionBankDataset,
): HotspotSessionResult {
  const resolvedTopics = resolveHotspotTopics(brief, opiDataset);
  const allCards = resolvedTopics.flatMap((topic) => topic.cards);
  if (allCards.length === 0) throw new Error(`热点资讯「${brief.title}」没有匹配到任何 OPI 题目。`);

  const syntheticTopic: QuestionBankTopic = {
    id: brief.id,
    name: brief.title,
    nameEn: `Hotspot ${brief.date}`,
    declaredCardCount: allCards.length,
    cards: allCards,
  };
  const syntheticCategory: QuestionBankCategory = {
    id: `hotspot-category-${brief.date}`,
    name: `[热点] ${brief.title}`,
    nameEn: `Hotspot ${brief.date}`,
    declaredTopicCount: 1,
    declaredCardCount: allCards.length,
    topics: [syntheticTopic],
  };

  return {
    dataset: { ...opiDataset, categories: [syntheticCategory] },
    category: syntheticCategory,
    topic: syntheticTopic,
  };
}
