import { loadQuestionBank } from '@/features/question-bank/data/repository.native';

import { STUDY_GUIDE_CARD } from './tutorial-model';
export { STUDY_GUIDE_CARD } from './tutorial-model';
/** Explicit teaching selects Sentence1 from the authoritative, unfiltered catalog. */
export async function studyGuideEntry() {
  const result = await loadQuestionBank('sentences900');
  const category = result?.dataset.categories.find(value => value.topics.some(topic => topic.cards.some(card => card.id === STUDY_GUIDE_CARD) || topic.scopeCardIds?.all.includes(STUDY_GUIDE_CARD)));
  const topic = category?.topics.find(value => value.cards.some(card => card.id === STUDY_GUIDE_CARD) || value.scopeCardIds?.all.includes(STUDY_GUIDE_CARD));
  if (!category || !topic) throw new Error('guide_entry_unavailable');
  return { pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]' as const,
    params: { bankId: 'sentences900', categoryId: category.id, topicId: topic.id, cardId: STUDY_GUIDE_CARD, guide: 'study' } };
}
