import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';

export type RadioTopicIdentity = {
  bankId: QuestionBankDataset['id'];
  categoryId: string;
  topicId: string;
};

export function nextRadioCatalogTopic(
  datasets: QuestionBankDataset[],
  current: RadioTopicIdentity,
): RadioTopicIdentity | undefined {
  const dataset = datasets.find((candidate) => candidate.id === current.bankId);
  if (!dataset) return undefined;
  const topics = dataset.categories.flatMap((category) => category.topics.map((topic) => ({
    bankId: dataset.id,
    categoryId: category.id,
    topicId: topic.id,
  })));
  const currentIndex = topics.findIndex((topic) => (
    topic.categoryId === current.categoryId && topic.topicId === current.topicId
  ));
  if (currentIndex < 0 || topics.length < 2) return undefined;
  return topics[(currentIndex + 1) % topics.length];
}

export async function hydrateRadioCatalogTopic(
  datasets: QuestionBankDataset[],
  bankId: QuestionBankDataset['id'],
  categoryId: string,
  topicId: string,
) {
  const dataset = datasets.find((candidate) => candidate.id === bankId);
  const category = dataset?.categories.find((candidate) => candidate.id === categoryId);
  const topic = category?.topics.find((candidate) => candidate.id === topicId);
  if (
    !dataset
    || !category
    || !topic
    || dataset.access?.membershipActive !== true
    || topic.access?.level !== 'member'
    || topic.cards.length >= topic.access.declaredCardCount
  ) return datasets;
  try {
    const hydrated = await questionBankRepository.getTopic(dataset.id, category.id, topic.id);
    if (!hydrated || hydrated.id !== topic.id) return datasets;
    return datasets.map((candidate) => candidate.id !== dataset.id ? candidate : {
      ...candidate,
      categories: candidate.categories.map((candidateCategory) => candidateCategory.id !== category.id
        ? candidateCategory
        : {
          ...candidateCategory,
          topics: candidateCategory.topics.map((candidateTopic) => candidateTopic.id === topic.id
            ? hydrated
            : candidateTopic),
        }),
    });
  } catch {
    // Preserve the public catalog when entitlement refresh or the network fails.
    return datasets;
  }
}
