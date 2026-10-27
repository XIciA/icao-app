import type { VocabularyBook, VocabularyBookId, VocabularyDataset, VocabularyRelease, VocabularyWord } from '@icao/contracts';

export type { VocabularyBook, VocabularyBookId, VocabularyDataset, VocabularyRelease, VocabularyWord };

export type VocabularyWordStatus = 'new' | 'known' | 'vague' | 'forgot' | 'wrong';
export type VocabularyTestLevel = 3 | 4 | 5;
export type VocabularyTestMode = 'weak' | 'normal' | 'strong';
export type VocabularyTestPhase = 'calibration' | 'adaptive' | 'verification';
export type VocabularyTestVerdict = '2级风险' | '3级基础达标' | '4级冲刺' | '5级潜力';

export type VocabularyWordProgress = {
  status: VocabularyWordStatus;
  favorite: boolean;
  updatedAt: string;
};

export type VocabularyTestAnswer = {
  wordId: string;
  word: string;
  meaning: string;
  bookId: VocabularyBookId;
  bookName: string;
  level: VocabularyTestLevel;
  questionNo: number;
  mode: VocabularyTestMode;
  phase: VocabularyTestPhase;
  correct: boolean;
};

export type VocabularyLevelStats = {
  level: VocabularyTestLevel;
  correct: number;
  total: number;
  rate: number | null;
};

export type VocabularyTestResult = {
  schemaVersion: 1;
  completedAt: string;
  total: number;
  correct: number;
  totalRate: number;
  verdict: VocabularyTestVerdict;
  judgment: string;
  suggestion: string;
  levelStats: Record<VocabularyTestLevel, VocabularyLevelStats>;
  answers: VocabularyTestAnswer[];
};

export type VocabularyStudySession = {
  answers?: Record<string, Exclude<VocabularyWordStatus, 'new'>>;
  wordIds: string[];
  nextWordId: string | null;
  order: 'frequency' | 'random';
  startedAt: string;
  updatedAt: string;
};

export type VocabularyState = {
  schemaVersion: 1;
  words: Record<string, VocabularyWordProgress>;
  lastTest?: VocabularyTestResult;
  studySession?: VocabularyStudySession;
  updatedAt: string;
};

export type VocabularyBookStats = {
  total: number;
  learned: number;
  known: number;
  vague: number;
  forgot: number;
  wrong: number;
  favorite: number;
};
