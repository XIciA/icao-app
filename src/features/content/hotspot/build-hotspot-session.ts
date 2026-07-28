/**
 * Builds a synthetic QuestionBankDataset / Category / Topic
 * from an OPI hotspot briefing, suitable for passing directly
 * to QuestionBankStudyScreen.
 *
 * The synthetic dataset inherits the real OPI dataset's study
 * config and capabilities so that audio mode, recorder, review
 * mode and all learning behaviours work identically.
 */

import type {
  QuestionBankCard,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import type { OpiHotspotBrief } from './types';

export type HotspotSessionResult = {
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
};

/**
 * Build a study session from a hotspot briefing.
 *
 * @param brief  The hotspot briefing containing topic → cardId mappings.
 * @param opiDataset  The full OPI QuestionBankDataset (loaded via loadQuestionBank('opi')).
 * @returns A synthetic dataset/category/topic triple ready for QuestionBankStudyScreen.
 * @throws If no matching cards are found.
 */
export function buildHotspotSession(
  brief: OpiHotspotBrief,
  opiDataset: QuestionBankDataset,
): HotspotSessionResult {
  // Build a lookup map of all OPI cards by ID (across all categories and topics)
  const cardMap = new Map<string, QuestionBankCard>();
  for (const category of opiDataset.categories) {
    for (const topic of category.topics) {
      for (const card of topic.cards) {
        cardMap.set(card.id, card);
      }
    }
  }

  // Collect all cards referenced by the briefing, preserving topic order
  const allCards: QuestionBankCard[] = [];
  for (const hotspotTopic of brief.topics) {
    for (const cardId of hotspotTopic.cardIds) {
      const card = cardMap.get(cardId);
      if (card && card.kind !== 'image') {
        allCards.push(card);
      }
    }
  }

  if (allCards.length === 0) {
    throw new Error(`热点资讯「${brief.title}」没有匹配到任何 OPI 题目。`);
  }

  // Build synthetic topic containing all cards from the briefing
  const syntheticTopic: QuestionBankTopic = {
    id: brief.id,
    name: brief.title,
    nameEn: `Hotspot ${brief.date}`,
    declaredCardCount: allCards.length,
    cards: allCards,
  };

  // Build synthetic category wrapping the topic
  const syntheticCategory: QuestionBankCategory = {
    id: `hotspot-category-${brief.date}`,
    name: `[热点] ${brief.title}`,
    nameEn: `Hotspot ${brief.date}`,
    declaredTopicCount: 1,
    declaredCardCount: allCards.length,
    topics: [syntheticTopic],
  };

  // Build synthetic dataset inheriting the real OPI config
  const syntheticDataset: QuestionBankDataset = {
    ...opiDataset,
    // Keep id as 'opi' so audio resolution, TTS, and study behaviour all work
    categories: [syntheticCategory],
  };

  return {
    dataset: syntheticDataset,
    category: syntheticCategory,
    topic: syntheticTopic,
  };
}
