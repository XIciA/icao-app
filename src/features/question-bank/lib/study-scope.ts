import { isFreeQuestionBankCard, studyScopeCardIds, type StudyScope } from '@icao/contracts';
import { examGoal, type ExamGoal } from '@/features/account/profile-model';
import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';

export function scopeTopic(bankId: QuestionBankId, topic: QuestionBankTopic, scope: StudyScope): QuestionBankTopic {
  if (scope === 'all' || bankId === 'sentences900') return topic;
  const index = topic.scopeCardIds ?? studyScopeCardIds(bankId, topic);
  const ids = new Set(index[scope]);
  const cards = topic.cards.filter((card) => ids.has(card.id));
  return {
    ...topic, cards, declaredCardCount: ids.size,
    access: topic.access ? {
      ...topic.access,
      declaredCardCount: ids.size,
      availableCardCount: cards.length,
      level: [...ids].every((id) => isFreeQuestionBankCard(bankId, topic.id, id)) ? 'free' : 'member',
    } : undefined,
  };
}

/** One display projection for home counts, catalog, study and listening queues.
 * Never used by mock-exam builders, which load the complete authoritative bank. */
export function scopeDataset(dataset: QuestionBankDataset, scope: StudyScope, target: ExamGoal): QuestionBankDataset {
  const allowed = (examGoal(target).banks as readonly QuestionBankId[]).includes(dataset.id);
  const categories = allowed ? dataset.categories
    .filter((category) => !(dataset.id === 'sentences900' && target === 'icao4-first' && category.name === '5级'))
    .map((category) => {
      const topics = category.topics.map((topic) => scopeTopic(dataset.id, topic, scope)).filter((topic) => topic.declaredCardCount > 0);
      return { ...category, topics, declaredTopicCount: topics.length, declaredCardCount: topics.reduce((sum, topic) => sum + topic.declaredCardCount, 0) };
    }).filter((category) => category.topics.length > 0) : [];
  const declaredTopicCount = categories.reduce((sum, category) => sum + category.topics.length, 0);
  const declaredCardCount = categories.reduce((sum, category) => sum + category.declaredCardCount, 0);
  const scoringPointGroups = dataset.id === 'radiotelephony'
    ? categories.flatMap((category) => category.topics).filter((topic) => topic.practiceKind === 'scoring-points').length
    : 0;
  const topicSummary = scoringPointGroups
    ? `${declaredTopicCount - scoringPointGroups} 场景＋${scoringPointGroups} 专项`
    : `${declaredTopicCount} ${dataset.topicUnit}`;
  return { ...dataset, categories, declaredTopicCount, declaredCardCount,
    summary: `${topicSummary} / ${declaredCardCount} ${dataset.cardUnit}` };
}
