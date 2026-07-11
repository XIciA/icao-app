import embeddedData from './question-bank.json';

import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';

const datasets = embeddedData as QuestionBankDataset[];

export type QuestionBankRepository = {
  getDataset(id: QuestionBankId): Promise<QuestionBankDataset | undefined>;
  getTopic(bankId: QuestionBankId, categoryId: string, topicId: string): Promise<QuestionBankTopic | undefined>;
};

export const embeddedQuestionBankRepository: QuestionBankRepository = {
  async getDataset(id) {
    return datasets.find((dataset) => dataset.id === id);
  },
  async getTopic(bankId, categoryId, topicId) {
    const dataset = datasets.find((item) => item.id === bankId);
    return dataset?.categories.find((category) => category.id === categoryId)?.topics.find((topic) => topic.id === topicId);
  },
};

export function getEmbeddedQuestionBankIds() {
  return datasets.map((dataset) => dataset.id);
}
