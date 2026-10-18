import { loadQuestionBank, questionBankRepository } from '@/features/question-bank/data/repository.native';
import { createCardDirectory } from '@/features/question-bank/data/card-directory';
import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import type { QuestionBankStudyPackage } from '@/features/question-bank/types';
import { SENTENCE_ONE_ID } from './tutorial-model';

export async function loadSentenceTutorial(): Promise<QuestionBankStudyPackage> {
  const result = await loadQuestionBank('sentences900');
  if (!result) throw new Error('tutorial_bank_missing');
  const dataset = result.dataset;
  const location = createCardDirectory([dataset]).get({ bankId: 'sentences900', cardId: SENTENCE_ONE_ID });
  if (!location) throw new Error('tutorial_card_missing');
  const category = dataset.categories.find(group => group.id === location.categoryId);
  const availableTopic = category?.topics.find(topic => topic.id === location.topicId);
  const topic = availableTopic?.cards.some(card => card.id === SENTENCE_ONE_ID && !card.retired)
    ? availableTopic
    : await questionBankRepository.getTopic('sentences900', location.categoryId, location.topicId, contentReleaseOf(dataset));
  const card = topic?.cards.find(entry => entry.id === SENTENCE_ONE_ID && !entry.retired);
  if (!category || !topic || !card) throw new Error('tutorial_content_unavailable');
  return { startedAt: new Date().toISOString(), id: `tutorial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, progressMode: 'persistent', items: [{ id: card.id, dataset, category, topic, card }], record: { bankId: dataset.id, bankTitle: dataset.title, categoryTitle: category.name, topicTitle: card.taskTitle, recordType: 'session', source: 'question-bank' } };
}
