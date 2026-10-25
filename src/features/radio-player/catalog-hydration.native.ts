import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
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
    const hydrated = await questionBankRepository.getTopic(dataset.id, category.id, topic.id, contentReleaseOf(dataset));
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

/** Build one complete authorized directory before exposing queue counts. Audio
 * files stay lazy; only the existing topic repository supplies protected text. */
export async function hydrateRadioCatalogDatasets(datasets: QuestionBankDataset[], assertCurrent: () => void = () => undefined, onProgress?: (datasets: QuestionBankDataset[]) => void, priorityBankId?: QuestionBankDataset['id'] | (() => QuestionBankDataset['id'])) {
  const hydrated = datasets.map(dataset => ({ ...dataset, categories: dataset.categories.map(category => ({ ...category, topics: [...category.topics] })) }));
  const work = hydrated.flatMap(dataset => dataset.access?.membershipActive === true
    ? dataset.categories.flatMap(category => category.topics.flatMap((topic, index) =>
      topic.access?.level === 'member' && topic.cards.length < topic.access.declaredCardCount
        ? [{ dataset, category, topic, index }] : [])) : []);
  // Interleave banks: hundreds of small ATC topics must not starve OPI.
  const queues = hydrated.map(bank => work.filter(item => item.dataset.id === bank.id));
  const pending = [] as typeof work;
  while (queues.some(queue => queue.length)) {
    for (const queue of queues) {
      const item = queue.shift();
      if (item) pending.push(item);
    }
  }
  const started = new Set<QuestionBankDataset['id']>();
  const failures: unknown[] = [];
  const retry = [] as typeof work;
  const take = () => {
    const priority = typeof priorityBankId === 'function' ? priorityBankId() : priorityBankId;
    // Give every bank a first topic, then follow the live selection without
    // cancelling in-flight requests or discarding already loaded topics.
    const unseen = pending.findIndex(item => !started.has(item.dataset.id));
    const preferred = pending.findIndex(item => item.dataset.id === priority);
    const index = unseen >= 0 ? unseen : preferred >= 0 ? preferred : 0;
    const item = pending.splice(index, 1)[0];
    if (item) started.add(item.dataset.id);
    return item;
  };
  const load = async (item: typeof work[number]) => {
    assertCurrent();
    const topic = await questionBankRepository.getTopic(item.dataset.id, item.category.id, item.topic.id, contentReleaseOf(item.dataset));
    assertCurrent();
    if (!topic || topic.id !== item.topic.id || topic.cards.length < item.topic.access!.declaredCardCount) throw new Error('radio_topic_unavailable');
    item.category.topics[item.index] = topic;
    onProgress?.(hydrated.map(bank => ({ ...bank, categories: bank.categories.map(category => ({ ...category, topics: [...category.topics] })) })));
  };
  const worker = async () => {
    while (pending.length) {
      const item = take();
      try { await load(item); }
      catch {
        assertCurrent(); // Cancellation/owner changes must stop all work.
        retry.push(item);
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.min(3, work.length) }, worker));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
  // A failed topic must not kill a worker and strand the remaining banks.
  await Promise.all(Array.from({ length: Math.min(3, retry.length) }, async () => {
    while (retry.length) {
      const item = retry.shift()!;
      try { await load(item); }
      catch (error) { assertCurrent(); failures.push(error); }
    }
  }));
  assertCurrent();
  if (failures.length) throw failures[0];
  return hydrated;
}
