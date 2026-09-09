import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import type {
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

function canUseMemberContent(dataset: QuestionBankDataset, topic: QuestionBankTopic) {
  return dataset.access?.membershipActive === true && topic.access?.level === 'member';
}

export function mockExamTopicCardCount(
  dataset: QuestionBankDataset,
  topic: QuestionBankTopic,
) {
  return canUseMemberContent(dataset, topic) ? topic.declaredCardCount : topic.cards.length;
}

export async function hydrateMockExamTopic(
  dataset: QuestionBankDataset,
  category: QuestionBankCategory,
  topic: QuestionBankTopic,
) {
  if (!canUseMemberContent(dataset, topic)) return topic;
  const hydrated = await questionBankRepository.getTopic(dataset.id, category.id, topic.id, contentReleaseOf(dataset));
  if (!hydrated || hydrated.id !== topic.id) {
    throw new Error(`${dataset.title}题组加载失败：${topic.name}`);
  }
  return hydrated;
}
