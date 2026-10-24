import { loadQuestionBank } from '@/features/question-bank/data/repository.native';

/** LT (陆空通话): enter the real catalog, never manufacture a sample question. */
export async function studyGuideEntry() {
  const result = await loadQuestionBank('radiotelephony');
  const category = result?.dataset.categories.find(value => value.topics.some(topic => topic.cards.some(card => !card.retired)));
  const topic = category?.topics.find(value => value.cards.some(card => !card.retired));
  const card = topic?.cards.find(value => !value.retired);
  if (!category || !topic || !card) throw new Error('guide_entry_unavailable');
  return { pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]' as const,
    params: { bankId: 'radiotelephony', categoryId: category.id, topicId: topic.id, cardId: card.id } };
}
