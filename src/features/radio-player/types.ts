import type { QuestionBankId } from '@/features/question-bank/types';

export type RadioBankId = QuestionBankId;
export type RadioPlaybackMode = 'order' | 'repeatOne' | 'shuffle';
export type RadioSubtitleMode = 'english' | 'bilingual' | 'off';

export type RadioTrack = {
  id: string;
  bankId: RadioBankId;
  bankTitle: string;
  categoryId: string;
  categoryTitle: string;
  topicId: string;
  topicTitle: string;
  title: string;
  audioText: string;
  audioTextZh?: string;
  audioPath: string;
  durationSeconds: number;
  stableIndex: number;
};

export type RadioCatalog = {
  bankId: RadioBankId;
  title: string;
  nameEn: string;
  tracks: RadioTrack[];
};
