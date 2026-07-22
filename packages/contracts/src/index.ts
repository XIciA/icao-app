export type ApiErrorBody = {
  code: string;
  message: string;
  status: number;
};

export type ApiErrorEnvelope = {
  requestId: string;
  error: ApiErrorBody;
};

export type ApiSuccessEnvelope<T> = {
  requestId: string;
  data: T;
};

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

export type RevokeAllSessionsResponse = { revoked: true };

export type DeleteAccountRequest = {
  currentPassword: string;
  confirmation: '注销账号';
};

export type HealthStatus = {
  service: 'icao-api';
  status: 'ok';
  database?: 'ok';
};

export type QuestionBankReleaseSummary = {
  bankId: string;
  version: number;
  checksum: string;
  title: string;
  declaredTopicCount: number;
  declaredCardCount: number;
};

export type QuestionBankRelease<T = unknown> = {
  bankId: string;
  version: number;
  checksum: string;
  dataset: T;
};

export type ResolvedResource = {
  publicPath: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  expiresIn: number;
};

export type VocabularyBookId = 'preview' | 'icao4' | 'icao5';

export type VocabularyWord = {
  id: string;
  bookId: VocabularyBookId;
  level: 1 | 2 | 3;
  word: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
  source: {
    name: string;
    rowIndex: number;
    sourceNo: string | number;
  };
};

export type VocabularyBook = {
  id: VocabularyBookId;
  level: 1 | 2 | 3;
  name: string;
  description: string;
  words: VocabularyWord[];
};

export type VocabularyDataset = {
  schemaVersion: 1;
  version: number;
  source: {
    name: string;
    generatedAt: string;
    sourceRows: number;
    validRows: number;
    ignoredRows: number;
    invalidRows: number;
  };
  books: VocabularyBook[];
};

export type VocabularyRelease = {
  version: number;
  checksum: string;
  dataset: VocabularyDataset;
};

export type SyncCardState = {
  visited: boolean;
  completed: boolean;
  selectedChoiceIndex?: number;
  recorded?: boolean;
  recordingDurationMillis?: number;
  tagIds?: string[];
  highlights?: Array<{
    blockId: 'question' | 'reference';
    wordIndex: number;
    colorId: string;
    quote: string;
  }>;
  note: string;
  updatedAt: string;
};

export type CardStateMutation = {
  mutationId: string;
  kind: 'card_state';
  payload: {
    bankId: string;
    topicId: string;
    cardId: string;
    state: SyncCardState;
    version: number;
    updatedAt: string;
  };
};

export type LearningRecordMutation = {
  mutationId: string;
  kind: 'learning_record';
  payload: {
    recordId: string;
    record: Record<string, unknown>;
    occurredAt: string;
    version?: number;
    updatedAt?: string;
  };
};

export type DocumentMutation = {
  mutationId: string;
  kind: 'document';
  payload: {
    documentKey: string;
    document: Record<string, unknown>;
    version: number;
    updatedAt: string;
  };
};

export type SyncMutation = CardStateMutation | LearningRecordMutation | DocumentMutation;

export type SyncPushRequest = { ownerUserId?: string; mutations: SyncMutation[] };

export type SyncPushResult = {
  mutationId: string;
  status: 'accepted' | 'duplicate' | 'conflict';
  authoritative?: {
    bankId?: string;
    topicId?: string;
    cardId?: string;
    state?: SyncCardState;
    documentKey?: string;
    document?: Record<string, unknown>;
    recordId?: string;
    record?: Record<string, unknown>;
    occurredAt?: string;
    version: number;
    updatedAt: string;
  };
};

export type SyncPushResponse = { results: SyncPushResult[]; cursor: number };

export type SyncChange = {
  cursor: number;
  kind: 'card_state' | 'learning_record' | 'document';
  entityKey: string;
  payload: Record<string, unknown>;
  version: number;
  changedAt: string;
};

export type SyncPullResponse = {
  changes: SyncChange[];
  cursor: number;
  hasMore: boolean;
};

export type AiModule = 'listening' | 'sentence900' | 'atc' | 'opi' | 'story';
export type AiCapability = 'word_lookup' | 'transcribe' | 'grammar_review' | 'polish';

export type AiConsentRequest = {
  policyVersion: string;
  accepted: boolean;
};

export type AiConsent = {
  policyVersion: string;
  acceptedAt: string;
};

export type WordLookupRequest = {
  module: AiModule;
  questionId: string;
  word: string;
  sentence: string;
};

export type WordLookupResult = {
  word: string;
  definition: string;
  sentenceMeaning: string;
  promptVersion: string;
  cached: boolean;
};

export type TranscribeResult = {
  transcript: string;
};

export type ExactMatchOperation = 'equal' | 'missing' | 'extra' | 'replace' | 'order';
export type ExactMatchToken = {
  operation: ExactMatchOperation;
  expected?: string;
  actual?: string;
  expectedIndex?: number;
  actualIndex?: number;
};
export type ExactMatchResult = {
  exact: boolean;
  differences: ExactMatchToken[];
  summary: { missing: number; extra: number; replace: number; order: number };
};

export type GrammarReviewRequest = {
  module: 'atc' | 'story' | 'opi';
  questionId: string;
  questionText: string;
  transcript: string;
};

export type GrammarReviewResult = {
  overallFeedbackZh: string;
  correctedText: string;
  issues: string[];
  promptVersion: string;
};

export type OpiAnalysisResult = {
  grammar: GrammarReviewResult;
  polishedText: string;
  polishPromptVersion: string;
};

export type PolishRequest = {
  module: 'opi';
  questionId: string;
  questionText: string;
  transcript: string;
  correctedText?: string;
};

export type PolishResult = {
  polishedText: string;
  promptVersion: string;
};
