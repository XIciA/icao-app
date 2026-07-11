export type QuestionBankId = 'listening' | 'sentences900' | 'radiotelephony' | 'opi' | 'storytelling';

export type QuestionBankIconKey = 'headphones' | 'sentences' | 'radioTower' | 'mic' | 'story';
export type StudyInteraction = 'speaking' | 'choices' | 'retell';
export type StudyConsoleTab = 'mine' | 'reference' | 'notes';
export type StudyToolMode = 'dictionary' | 'highlight' | 'tags';
export type StudyReviewKind = 'none' | 'exact-match' | 'grammar-placeholder' | 'opi-placeholder';

export type StudyToolConfig = {
  recorder: boolean;
  choices: boolean;
  notes: boolean;
  dictionary: boolean;
  highlights: boolean;
  tags: boolean;
};

export type QuestionBankStudyConfig = {
  interaction: StudyInteraction;
  tools: StudyToolConfig;
  copy: { transcriptLabel: string; referenceLabel: string };
  audioTitlePattern: 'card-title' | 'category-topic-index' | 'category-index' | 'sentence-number' | 'callsign-index';
  consoleTabs: StudyConsoleTab[];
  showChoicePrompt?: boolean;
};

export type QuestionBankCard = {
  id: string;
  taskTitle: string;
  audioText: string;
  audioTextZh?: string;
  referenceText?: string;
  referenceTextZh?: string;
  audio?: string;
  choices?: string[];
  correctChoiceIndex?: number;
};

export type QuestionBankTopic = {
  id: string;
  name: string;
  nameEn?: string;
  declaredCardCount: number;
  cards: QuestionBankCard[];
};

export type QuestionBankCategory = {
  id: string;
  name: string;
  nameEn?: string;
  declaredTopicCount: number;
  declaredCardCount: number;
  topics: QuestionBankTopic[];
};

export type QuestionBankDataset = {
  id: QuestionBankId;
  title: string;
  nameEn: string;
  description: string;
  summary: string;
  enabled: boolean;
  statusLabel: string;
  icon: QuestionBankIconKey;
  declaredTopicCount: number;
  declaredCardCount: number;
  categoryUnit: string;
  topicUnit: string;
  cardUnit: string;
  study: QuestionBankStudyConfig;
  categories: QuestionBankCategory[];
};

export type CardLearningState = {
  visited: boolean;
  completed: boolean;
  selectedChoiceIndex?: number;
  recorded?: boolean;
  recordingDurationMillis?: number;
  tagIds?: string[];
  highlights?: {
    blockId: 'question' | 'reference';
    wordIndex: number;
    colorId: string;
    quote: string;
  }[];
  note: string;
  updatedAt: string;
};

export type LearningRecord = {
  schemaVersion?: 1 | 2;
  id: string;
  bankId: QuestionBankId;
  bankTitle: string;
  categoryTitle: string;
  topicTitle: string;
  completedCount: number;
  totalCount: number;
  correctCount: number;
  annotationCount?: number;
  noteCount?: number;
  feedbackCount?: number;
  durationSeconds: number;
  reason: 'abort' | 'complete';
  createdAt: string;
};

export type StudyBehavior = {
  taskKind: 'choices' | 'recording';
  recordingMode?: 'speaking' | 'retell';
  workbenchTabs: StudyConsoleTab[];
  reviewKind: StudyReviewKind;
  generatedAudio: boolean;
  transcriptLabel: string;
  referenceLabel: string;
};
