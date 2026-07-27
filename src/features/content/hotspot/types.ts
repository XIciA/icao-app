import type { QuestionBankCard } from '@/features/question-bank/types';

export type OpiHotspotTopic = {
  topicId: string;
  topicTitle: string;
  cardIds: string[];
};

export type OpiHotspotBrief = {
  id: string;
  date: string;
  title: string;
  centers: string[];
  topics: OpiHotspotTopic[];
};

export type OpiHotspotIndex = {
  generatedAt: string;
  briefs: OpiHotspotBrief[];
};

export type ResolvedOpiHotspotTopic = OpiHotspotTopic & {
  cards: QuestionBankCard[];
};
