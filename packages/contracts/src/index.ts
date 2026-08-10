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

export type InviteSessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; displayName: string };
};

export type RevokeAllSessionsResponse = { revoked: true };

export type DeleteAccountRequest = {
  inviteCode: string;
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

export type FeedbackCategory = 'feature_suggestion' | 'content_correction' | 'other';
export type FeedbackStatus = 'received' | 'in_progress' | 'resolved' | 'cannot_reproduce';
export type FeedbackSource = 'profile' | 'study';

export type FeedbackQuestionContext = {
  bankId: string;
  categoryId: string;
  topicId: string;
  cardId: string;
};

export type FeedbackErrorContext = {
  code: string;
  requestId?: string;
};

export type FeedbackSubmissionPayload = {
  clientSubmissionId: string;
  category: FeedbackCategory;
  description: string;
  contact?: string;
  source: FeedbackSource;
  sourceRoute: string;
  appDisplayVersion: string;
  platform: 'web' | 'ios' | 'android';
  osName?: string;
  osVersion?: string;
  question?: FeedbackQuestionContext;
  error?: FeedbackErrorContext;
};

export type FeedbackSubmissionResponse = {
  ticketNumber: string;
  status: 'received';
  createdAt: string;
};

export type EditorialChannel = 'resource' | 'opi_hotspot';

export type EditorialCover = {
  publicPath: string;
  alt: string;
  width: 800;
  height: 500;
  mimeType: 'image/jpeg' | 'image/png';
  checksum: string;
  sizeBytes: number;
};

export type EditorialHeadingBlock = {
  type: 'heading';
  level: 2 | 3;
  text: string;
};

export type EditorialParagraphBlock = {
  type: 'paragraph';
  text: string;
};

export type EditorialListBlock = {
  type: 'list';
  ordered: boolean;
  items: string[];
};

export type EditorialCalloutBlock = {
  type: 'callout';
  tone: 'note' | 'warning';
  title?: string;
  text: string;
};

export type EditorialBlock =
  | EditorialHeadingBlock
  | EditorialParagraphBlock
  | EditorialListBlock
  | EditorialCalloutBlock;

export type EditorialSourceLink = {
  title: string;
  publisher: string;
  url: string;
};

export type EditorialArticleSummary = {
  id: string;
  slug: string;
  version: number;
  channel: EditorialChannel;
  category: string;
  badge: string;
  title: string;
  summary: string;
  tags: string[];
  publishedAt: string | null;
  cover: EditorialCover;
};

export type EditorialArticle = EditorialArticleSummary & {
  blocks: EditorialBlock[];
  sourceLinks: EditorialSourceLink[];
};

export type EditorialListResponse = {
  version: number;
  checksum: string;
  items: EditorialArticleSummary[];
};

export type EditorialDetailResponse = {
  version: number;
  checksum: string;
  article: EditorialArticle;
};

export type EditorialReleaseSnapshot = {
  schemaVersion: 1;
  version: number;
  builtAt: string;
  articles: EditorialArticle[];
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

export const TENCENT_ASR_MODELS = ['16k_zh_en_2.0', '16k_en_large', '16k_en'] as const;
export type TencentAsrModel = typeof TENCENT_ASR_MODELS[number];
export const DEFAULT_TENCENT_ASR_MODEL: TencentAsrModel = '16k_en';

export function isTencentAsrModel(value: unknown): value is TencentAsrModel {
  return typeof value === 'string' && TENCENT_ASR_MODELS.includes(value as TencentAsrModel);
}

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
  correctedText: string;
  issues: string[];
  promptVersion: string;
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
