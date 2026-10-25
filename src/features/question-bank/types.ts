import type {
  StudyTier,
  QuestionBankRadioEntry,
  StudyScopeCardIds,
  GrammarCorrectionIssue,
  QuestionBankAccessSummary,
  QuestionBankContentAccess,
} from '@icao/contracts';
import type { VercelStudyReview } from './lib/study-review';
import type { VercelListeningReview } from '@/features/mock-exam/listening-review';

export type QuestionBankId = 'listening' | 'sentences900' | 'radiotelephony' | 'opi' | 'storytelling';

export type QuestionBankIconKey = 'headphones' | 'sentences' | 'radioTower' | 'mic' | 'story';
export type StudyInteraction = 'speaking' | 'choices' | 'retell';
export type StudyConsoleTab = 'mine' | 'reference' | 'notes';
export type StudyToolMode = 'dictionary' | 'highlight' | 'tags';
export type StudyReviewKind = 'none' | 'exact-match' | 'grammar' | 'opi-analysis';

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

export type QuestionBankCapabilities = {
  audioMode: 'file' | 'generated';
  reviewMode: 'none' | 'exact-match' | 'grammar' | 'expression-analysis';
  radioEligible: boolean;
  mockExamEligible: boolean;
};

type QuestionBankCardBase = {
  /** Retained for existing history; excluded from new practice. */
  retired?: boolean;
  examReported?: boolean;
  id: string;
  taskTitle: string;
  studyTier?: StudyTier;
};

export type QuestionBankTextCard = QuestionBankCardBase & {
  kind?: 'text';
  /** Exam feedback wording, keyed by hotspot ID; delivered with authorized question content. */
  reportedPrompts?: Record<string, string[]>;
  audioText: string;
  audioTextZh?: string;
  referenceText?: string;
  referenceTextZh?: string;
  audio?: string;
  audioDurationSeconds?: number;
  choices?: string[];
  choicesZh?: string[];
  correctChoiceIndex?: number;
};

export type QuestionBankImageCard = QuestionBankCardBase & {
  kind: 'image';
  image: string;
  imageAlt: string;
  audioText?: never;
  audioTextZh?: never;
  audio?: never;
  choices?: never;
  choicesZh?: never;
  correctChoiceIndex?: never;
  referenceText?: never;
  referenceTextZh?: never;
};

export type QuestionBankCard = QuestionBankTextCard | QuestionBankImageCard;

export type QuestionBankTopic = {
  id: string;
  name: string;
  nameEn?: string;
  declaredCardCount: number;
  cards: QuestionBankCard[];
  studyTier?: StudyTier;
  scopeCardIds?: StudyScopeCardIds;
  radioEntries?: QuestionBankRadioEntry[];
  practiceKind?: 'scenario' | 'scoring-points';
  access?: QuestionBankContentAccess;
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
  capabilities?: QuestionBankCapabilities;
  categories: QuestionBankCategory[];
  access?: QuestionBankAccessSummary;
};

export type QuestionBankStudyItem = {
  id: string;
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
  card: QuestionBankCard;
  materials?: QuestionBankImageCard[];
  sectionId?: string;
  sectionTitle?: string;
};

export type CardLearningState = {
  visited: boolean;
  lastVisitedAt?: string;
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

export type MockExamRecordMeta = {
  examType: 'icao4-recert' | 'icao4-first' | 'icao5-first' | 'icao5-recert';
  listeningResult?: { answeredCount: number; correctCount: number; score: number; level: 2 | 3 | 4 | 5 | 6; totalCount: 20 };
  mode: 'complete' | 'custom';
  moduleIds: QuestionBankId[];
  sectionCounts: { id: string; title: string; total: number }[];
};

export type QuestionBankStudyRecordDescriptor = {
  id?: string;
  bankId: QuestionBankId | 'mock_exam';
  bankTitle: string;
  categoryTitle: string;
  topicTitle: string;
  recordType?: 'session' | 'ai_result' | 'mock_exam';
  mockExam?: MockExamRecordMeta;
  source?: 'question-bank' | 'hotspot' | 'mock-exam';
  hotspot?: { id: string; title: string; date: string };
};

// Each attempt stores only its ordered questions and starting answers for reuse
// in the standard study screen. Annotations belong to the shared question store;
// personal recording files are not included.
export type StudyReviewSnapshot = {
  schemaVersion: 1;
  items: QuestionBankStudyItem[];
  states: Record<string, CardLearningState>;
  answers: Record<string, string>;
};

export type QuestionBankStudyPackage = {
  initialItemId?: string;
  id: string;
  startedAt: string;
  items: QuestionBankStudyItem[];
  progressMode: 'persistent' | 'session-only';
  record: QuestionBankStudyRecordDescriptor;
  listeningReviewRecord?: LearningRecord;
  studyReviewRecord?: LearningRecord;
};

export type LearningRecord = {
  schemaVersion?: 1 | 2 | 3 | 4 | 5;
  id: string;
  sessionId?: string;
  cardId?: string;
  bankId: QuestionBankId | 'mock_exam';
  bankTitle: string;
  categoryTitle: string;
  topicTitle: string;
  completedCount: number;
  totalCount: number;
  correctCount: number;
  sessionRecap?: import('./lib/session-recap').SessionRecap;
  annotationCount?: number;
  noteCount?: number;
  feedbackCount?: number;
  durationSeconds: number;
  reason: 'abort' | 'complete';
  createdAt: string;
  updatedAt?: string;
  recordType?: 'session' | 'ai_result' | 'mock_exam';
  mockExam?: MockExamRecordMeta;
  source?: 'question-bank' | 'hotspot' | 'mock-exam';
  hotspot?: { id: string; title: string; date: string };
  studyReview?: StudyReviewSnapshot;
  studyReviewSaved?: boolean;
  aiResultSaved?: boolean;
  aiOperation?: { operationId: string; environment: 'sandbox' | 'production'; status: 'pending' | 'complete'; inputTranscript?: string };
  answeredCount?: number;
  studiedCount?: number;
  // Populated on demand from the same session's AI records, never persisted in
  // the paper snapshot so deleting AI results cannot leave a second copy behind.
  studyFeedback?: Record<string, NonNullable<LearningRecord['aiResult']>>;
  vercelListeningReview?: VercelListeningReview;
  vercelStudyReview?: VercelStudyReview;
  vercelStudyReviewSaved?: boolean;
  aiResult?: {
    analysis?: import('@icao/contracts/learning-ai').LearningAnalysis;
    resumeOperationId?: string;
    questionId: string;
    itemId?: string;
    analyzedTranscript?: string;
    rawTranscript?: string;
    transcript: string;
    grammar?: { correctedText: string; issues: (string | GrammarCorrectionIssue)[] };
    polishedText?: string;
  };
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
