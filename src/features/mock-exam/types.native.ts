import type { QuestionBankCard, QuestionBankCategory, QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '@/features/question-bank/types';

export type MockExamType = 'icao4-recert' | 'icao4-first' | 'icao5-first' | 'icao5-recert';
export type MockExamModuleId = QuestionBankId;

export type MockExamConfig = { examType: MockExamType; modules: MockExamModuleId[] };

export type MockExamItem = {
  id: string;
  number: number;
  moduleId: MockExamModuleId;
  sectionId: string;
  source: { bankId: QuestionBankId; categoryId: string; topicId: string; cardId: string };
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
  card: QuestionBankCard;
};

export type MockExamSection = { id: string; moduleId: MockExamModuleId; title: string; items: MockExamItem[] };

export type MockExamSession = {
  id: string;
  seed: number;
  startedAt: string;
  config: MockExamConfig;
  mode: 'complete' | 'custom';
  sections: MockExamSection[];
  items: MockExamItem[];
};
