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
  authUserId?: string;
  email?: string;
  phone?: string;
  providers?: AuthIdentityProvider[];
};

export type AuthIdentityProvider = 'phone' | 'apple';

export type AccountSummary = {
  accountId: string;
  phone?: string;
  providers: AuthIdentityProvider[];
  phoneBound: boolean;
};

export type BindPhoneRequest = {
  phone: string;
  token: string;
};

export type StartPhoneBindingRequest = {
  phone: string;
  recentAuthGrantId?: string;
};

export type StartPhoneBindingResponse = {
  sent: true;
};

export type StartPhoneOtpRequest = {
  phone: string;
};

export type StartPhoneOtpResponse = {
  accepted: true;
  expiresAt: number;
  issuedAt: number;
  resendAllowedAt: number;
};

export type AuthorizePasswordRecoveryResponse = {
  authorized: true;
  expiresAt: number;
  grantId: string;
};

export type AuthorizePasswordRecoveryRequest = {
  challengeId: string;
};

export type UpdatePhonePasswordRequest = {
  password: string;
  currentPassword?: string;
  recoveryGrantId?: string;
};

export type UpdatePhonePasswordResponse = {
  session: SocialAuthSessionResponse;
  updated: true;
};

export type SocialAuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type BindPhoneResponse = {
  account: AccountSummary;
  session: SocialAuthSessionResponse;
};

const CHINA_MOBILE_LOCAL_PATTERN = /^1[3-9]\d{9}$/u;

export function normalizeChinaMobile(input: string): string | undefined {
  const compact = input.trim().replace(/[\s-]/gu, '');
  const local = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('86') && compact.length === 13
      ? compact.slice(2)
      : compact;
  return CHINA_MOBILE_LOCAL_PATTERN.test(local) ? `+86${local}` : undefined;
}

export function isChinaMobileE164(input: string | undefined): input is string {
  return Boolean(input && /^\+861[3-9]\d{9}$/u.test(input));
}

export function maskChinaMobile(input: string | undefined): string {
  if (!isChinaMobileE164(input)) return '未绑定';
  const local = input.slice(3);
  return `+86 ${local.slice(0, 3)}****${local.slice(-4)}`;
}

export type InviteSessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; displayName: string };
};

export type RevokeAllSessionsResponse = { revoked: true };

export type CommerceEnvironment = 'sandbox' | 'production';

export type CommerceProductOffering = {
  productKey:
    | 'membership_7d_v1'
    | 'membership_15d_v1'
    | 'membership_31d_v1'
    | 'membership_62d_v1'
    | 'membership_93d_v1';
  storeProductId: string;
  displayName: string;
  durationDays: 7 | 15 | 31 | 62 | 93;
  autoRenews: false;
  recommended: boolean;
};

export type CommerceProductCatalogResponse = {
  priceSource: 'storekit';
  products: CommerceProductOffering[];
};

export type VerifyAppleTransactionRequest = {
  signedTransaction: string;
};

export type CommerceEntitlementSummary = {
  environment: CommerceEnvironment;
  serverTime: string;
  membership: {
    active: boolean;
    expiresAt: string | null;
  };
  aiPoints: {
    available: number;
    nextGrantAt: string | null;
  };
};

export type CommerceEntitlementsResponse = {
  production: CommerceEntitlementSummary;
  sandbox: CommerceEntitlementSummary;
};

export type VerifyAppleTransactionResponse = {
  created: boolean;
  transactionId: string;
  entitlement: CommerceEntitlementSummary;
};

export type RecentAuthPurpose = 'account_delete' | 'password_recovery' | 'phone_binding' | 'session_revoke_all';
export type RecentAuthMethod = 'password' | 'phone_otp' | 'apple';

export type PasswordRecentAuthRequest = {
  password: string;
  purpose: 'account_delete' | 'session_revoke_all';
};

export type PhoneRecentAuthRequest = {
  purpose: 'account_delete' | 'session_revoke_all';
};

export type StartPhoneRecentAuthRequest = PhoneRecentAuthRequest;

export type RecentAuthGrantResponse = {
  expiresAt: number;
  grantId: string;
  method: RecentAuthMethod;
  purpose: RecentAuthPurpose;
};

export type AppleCredentialRequest = {
  authorizationCode: string;
  rawNonce: string;
};

export type AppleRecentAuthRequest = AppleCredentialRequest & {
  purpose: 'account_delete' | 'session_revoke_all';
};

export type RevokeAllSessionsRequest = {
  grantId: string;
};

export type RegisterAppleCredentialResponse = {
  registered: true;
};

export type DeleteAccountRequest = {
  confirmation: '注销账号';
  grantId: string;
  idempotencyKey: string;
};

export type DeleteAccountResponse = {
  identityProviderOutcome: 'pending' | 'revoked' | 'manual_action_required' | 'not_applicable';
  jobId: string;
  status: 'pending' | 'processing' | 'retryable' | 'completed';
};

export type AccountDeletionStatusRequest = {
  idempotencyKey: string;
};

export type PrivacyDeletionResponse = {
  aiResultGeneration: number;
  dataGeneration: number;
  deletedCount: number;
};

export type DeleteAllAiResultsRequest = {
  confirmation: '删除全部AI结果';
  idempotencyKey: string;
};

export type ClearLearningDataRequest = {
  confirmation: '清除学习数据';
  idempotencyKey: string;
};

export type AccountDataExportResponse = {
  schemaVersion: 1;
  exportedAt: string;
  account: {
    accountId: string;
    createdAt: string;
    phone?: string;
    providers: Array<'phone' | 'apple'>;
  };
  learning: {
    aiResultGeneration: number;
    cardStates: Array<{
      bankId: string;
      topicId: string;
      cardId: string;
      state: SyncCardState;
      updatedAt: string;
    }>;
    dataGeneration: number;
    documents: Array<{
      documentKey: string;
      document: Record<string, unknown>;
      updatedAt: string;
    }>;
    records: Array<Record<string, unknown>>;
  };
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

export const CONTENT_ACCESS_POLICY_VERSION = 'content-access-v2' as const;
export const CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64 = 'BQlsdWBZzpqVcLcfGjShw1FB9ivfULrySNBj25xar/g=' as const;
export const COMMERCE_ENVIRONMENT_HEADER = 'x-icao-commerce-environment' as const;

export type ContentAccessLevel = 'free' | 'member';

export type QuestionBankContentAccess = {
  level: ContentAccessLevel;
  availableCardCount: number;
  declaredCardCount: number;
};

export type QuestionBankAccessSummary = {
  policyVersion: typeof CONTENT_ACCESS_POLICY_VERSION;
  environment: CommerceEnvironment | null;
  membershipActive: boolean;
  membershipExpiresAt: string | null;
};

export type QuestionBankTopicRelease<T = unknown> = {
  bankId: string;
  version: number;
  checksum: string;
  categoryId: string;
  topic: T;
  access: QuestionBankAccessSummary;
};

export type ContentAccessScope = {
  bankId: string;
  categoryId: string;
  topicId: string;
};

export type IssueContentCredentialRequest = {
  scopes: ContentAccessScope[];
};

export type ContentAccessCredential = {
  token: string;
  issuedAt: string;
  expiresAt: string;
  policyVersion: typeof CONTENT_ACCESS_POLICY_VERSION;
  environment: CommerceEnvironment;
  scopes: ContentAccessScope[];
};

const FREE_LISTENING_CARD_IDS = new Set([
  'listening-main-001', 'listening-main-002', 'listening-main-005', 'listening-main-021',
  'listening-main-022', 'listening-main-024', 'listening-main-025', 'listening-main-029',
  'listening-main-041', 'listening-main-042',
  'listening-main-003', 'listening-main-008', 'listening-main-009', 'listening-main-011',
  'listening-main-012', 'listening-main-013', 'listening-main-018', 'listening-main-031',
  'listening-main-032', 'listening-main-033',
  'listening-main-004', 'listening-main-053', 'listening-main-074', 'listening-main-093',
  'listening-main-095', 'listening-main-111', 'listening-main-112', 'listening-main-126',
  'listening-main-127', 'listening-main-128',
  'listening-main-006', 'listening-main-007', 'listening-main-010', 'listening-main-014',
  'listening-main-015', 'listening-main-016', 'listening-main-017', 'listening-main-019',
  'listening-main-020', 'listening-main-023',
]);

const FREE_RADIOTELEPHONY_TOPIC_IDS = new Set([
  'atc-scenario-0001',
  'atc-scenario-0002',
  'atc-scenario-0003',
]);

const FREE_OPI_TOPIC_IDS = new Set([
  'opi-topic-0001',
  'opi-topic-0002',
  'opi-topic-0003',
]);

const FREE_STORYTELLING_CARD_IDS = new Set([
  'story-wing-001',
  'story-wing-002',
  'story-wing-003',
]);

export function isFreeQuestionBankCard(bankId: string, topicId: string, cardId: string) {
  if (bankId === 'sentences900') return true;
  if (bankId === 'listening') return FREE_LISTENING_CARD_IDS.has(cardId);
  if (bankId === 'radiotelephony') return FREE_RADIOTELEPHONY_TOPIC_IDS.has(topicId);
  if (bankId === 'opi') return FREE_OPI_TOPIC_IDS.has(topicId);
  if (bankId === 'storytelling') return FREE_STORYTELLING_CARD_IDS.has(cardId);
  return false;
}

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

export type FeedbackDiagnosticFeature = 'recording' | 'ai';

export type FeedbackDiagnosticEvent = {
  offsetMs: number;
  stage: string;
  code: string;
  level: 'info' | 'warning' | 'error';
  durationMs?: number;
  byteSize?: number;
  format?: 'm4a' | 'wav' | 'unknown';
  owner?: 'radio' | 'study' | 'recording' | 'recordingPlayback';
  recorderState?: 'idle' | 'prepared' | 'preparing' | 'recording' | 'stopping' | 'unknown';
  meteringDetected?: boolean;
  mediaServicesDidReset?: boolean;
  canRecord?: boolean;
  isRecording?: boolean;
  capability?: 'transcribe' | 'grammar' | 'polish';
  requestId?: string;
  retryable?: boolean;
  httpStatus?: number;
  attempt?: number;
};

export type FeedbackDiagnosticBundle = {
  schemaVersion: 1;
  feature: FeedbackDiagnosticFeature;
  correlationId: string;
  appVersion: string;
  build: string;
  platform: 'web' | 'ios' | 'android';
  osVersion: string;
  events: FeedbackDiagnosticEvent[];
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
  diagnostics?: FeedbackDiagnosticBundle;
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
  lastVisitedAt?: string;
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
    record?: Record<string, unknown>;
    deleted?: boolean;
    aiResultGeneration?: number;
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

export type SyncPushRequest = {
  ownerUserId?: string;
  cursor?: number;
  dataGeneration?: number;
  aiResultGeneration?: number;
  mutations: SyncMutation[];
};

export type SyncPushResult = {
  mutationId: string;
  status: 'accepted' | 'duplicate' | 'conflict' | 'discarded';
  authoritative?: {
    bankId?: string;
    topicId?: string;
    cardId?: string;
    state?: SyncCardState;
    documentKey?: string;
    document?: Record<string, unknown>;
    recordId?: string;
    record?: Record<string, unknown>;
    deleted?: boolean;
    aiResultGeneration?: number;
    occurredAt?: string;
    version: number;
    updatedAt: string;
  };
};

export type SyncPushResponse = {
  results: SyncPushResult[];
  cursor: number;
  dataGeneration: number;
  aiResultGeneration: number;
  resetLearningData?: boolean;
  resetAiResults?: boolean;
};

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
  dataGeneration: number;
  aiResultGeneration: number;
};

export type AiModule = 'listening' | 'sentence900' | 'atc' | 'opi' | 'story';
export type AiCapability = 'word_lookup' | 'transcribe' | 'grammar_review' | 'polish' | 'review';

export const AI_GENERATED_CONTENT_LABEL = 'AI 辅助生成' as const;
export const AI_GENERATED_CONTENT_EXPORT_LABEL = 'AI辅助生成' as const;
export const DEEPSEEK_RUNTIME_MODEL_ID = 'deepseek-v4-flash' as const;
export const DEEPSEEK_PUBLIC_MODEL_NAME = 'DeepSeek-V4-Flash-0731' as const;
export const DEEPSEEK_GENERATIVE_AI_SERVICE_NAME = 'Deepseek Chat' as const;
export const DEEPSEEK_GENERATIVE_AI_FILING_NUMBER = 'Beijing-DeepseekChat-202404280016' as const;
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com' as const;
export const DEEPSEEK_MODEL_FILING_DISCLOSURE = `${DEEPSEEK_PUBLIC_MODEL_NAME}（${DEEPSEEK_GENERATIVE_AI_SERVICE_NAME}，备案号 ${DEEPSEEK_GENERATIVE_AI_FILING_NUMBER}）` as const;

export const AI_GENERATED_CONTENT_EXPORT_DISCLOSURE = Object.freeze({
  contentLabel: AI_GENERATED_CONTENT_EXPORT_LABEL,
  model: DEEPSEEK_PUBLIC_MODEL_NAME,
  service: DEEPSEEK_GENERATIVE_AI_SERVICE_NAME,
  filingNumber: DEEPSEEK_GENERATIVE_AI_FILING_NUMBER,
});

export function discloseAiGeneratedExportRecord(record: Record<string, unknown>) {
  return record.recordType === 'ai_result'
    ? { ...record, ...AI_GENERATED_CONTENT_EXPORT_DISCLOSURE }
    : record;
}

export const TENCENT_ASR_MODELS = ['16k_zh_en_2.0', '16k_en_large', '16k_en'] as const;
export type TencentAsrModel = typeof TENCENT_ASR_MODELS[number];
export const DEFAULT_TENCENT_ASR_MODEL: TencentAsrModel = '16k_en';

export function isTencentAsrModel(value: unknown): value is TencentAsrModel {
  return typeof value === 'string' && TENCENT_ASR_MODELS.includes(value as TencentAsrModel);
}

export const CURRENT_AI_CONSENT_POLICY_VERSION = 'ai-learning-privacy-v4' as const;
export const CURRENT_AI_CONSENT_FLOW_REVISION = 'native-explicit-consent-v1' as const;

export type AiConsentRequest = {
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  accepted: true;
  flowRevision?: typeof CURRENT_AI_CONSENT_FLOW_REVISION;
  challenge?: string;
};

export type AiConsentChallengeRequest = {
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  flowRevision: typeof CURRENT_AI_CONSENT_FLOW_REVISION;
};

export type AiConsentChallenge = {
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  flowRevision: typeof CURRENT_AI_CONSENT_FLOW_REVISION;
  challenge: string;
  expiresAt: string;
};

export type AiConsent = {
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  acceptedAt: string;
};

export type AiConsentStatus = {
  accepted: true;
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
  acceptedAt: string;
} | {
  accepted: false;
  policyVersion: typeof CURRENT_AI_CONSENT_POLICY_VERSION;
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

export type AiPointOperationSummary = {
  operationId: string;
  ruleVersion: 'ai-points-v1';
  estimated: number;
  charged: number;
  remaining: number;
};

export type TranscribeResult = {
  transcript: string;
  rawTranscript?: string;
  aiPoints?: AiPointOperationSummary;
};

export type ExactMatchOperation = 'equal' | 'missing' | 'extra' | 'replace' | 'order';
export type ExactMatchToken = {
  operation: ExactMatchOperation;
  expected?: string;
  actual?: string;
  expectedIndex?: number;
  actualIndex?: number;
  expectedSource?: { start: number; end: number; text: string };
  actualSource?: { start: number; end: number; text: string };
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
  aiPoints?: AiPointOperationSummary;
};

export type GrammarCorrectionIssue = {
  before: string;
  after: string;
  reasonZh: string;
};

export type AiReviewRequest = {
  mode: 'grammar' | 'opi';
  module: 'atc' | 'story' | 'opi';
  questionId: string;
  transcript: string;
  analysisVersion?: 2;
  source?: import('./learning-ai').LearningReviewSource;
  /** Retry the text recovered from an uncharged, failed combined operation. */
  resumeOperationId?: string;
};

export type AiReviewResult = {
  grammar: {
    issues: GrammarCorrectionIssue[];
    correctedText: string;
  };
  polishedText?: string;
  promptVersion: 'deepseek-review:v1' | 'deepseek-review:v2';
  analysis?: import('./learning-ai').LearningAnalysis;
  aiPoints?: AiPointOperationSummary;
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
  aiPoints?: AiPointOperationSummary;
};

export type OpsStaffRole = 'admin' | 'support';

export type OpsLoginRequest = {
  email: string;
  password: string;
  totpCode: string;
  deviceName?: string;
};

export type OpsStaffSession = {
  accessToken: string;
  expiresAt: string;
  staff: {
    id: string;
    email: string;
    role: OpsStaffRole;
  };
};

export type OpsStaffListItem = {
  id: string;
  email: string;
  role: OpsStaffRole;
  status: 'active' | 'disabled';
  activeSessionCount: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpsStaffActionRequest = { reason: string };

export type OpsStaffDisableResult = {
  disabled: true;
  disabledAt: string;
};

export type OpsStaffSessionRevokeResult = {
  revoked: true;
  revokedSessionCount: number;
};

export type OpsHealthSummary = {
  service: 'icao-ops-api';
  status: 'ok';
  database: 'ok';
  releaseId: string;
  counts: {
    accounts: number;
    productionOrders: number;
    pendingFeedback: number;
    pendingPrivacyRequests: number;
  };
};

export type OpsUserSummary = {
  accountId: string;
  status: string;
  providers: Array<'phone' | 'apple'>;
  phone: string;
  lastIdentityUsedAt: string | null;
  sessionsRevokedAt: string | null;
  createdAt: string;
};

export type OpsOrderSummary = {
  id: string;
  environment: CommerceEnvironment;
  channel: string;
  externalOrderReference: string;
  productKey: string;
  status: string;
  purchasedAt: string;
};

export type OpsAccountCommerceSummary = {
  accountId: string;
  entitlements: CommerceEntitlementsResponse;
  orders: OpsOrderSummary[];
  pointLedger: Array<{
    sequence: number;
    environment: CommerceEnvironment;
    entryType: string;
    direction: string;
    points: number;
    createdAt: string;
  }>;
};

export type OpsFeedbackQueueItem = {
  ticketNumber: string;
  accountId: string;
  category: string;
  status: string;
  summary: string;
  source: string;
  createdAt: string;
};

export type OpsPrivacyRequestQueueItem = {
  id: string;
  accountId: string;
  requestType: 'account_deletion';
  status: string;
  identityProviderOutcome: string;
  requestedAt: string;
  updatedAt: string;
};

export type OpsEntitlementGrantRequest = {
  accountId: string;
  environment: CommerceEnvironment;
  membershipDays: number;
  aiPoints: number;
  reason: string;
};

export type OpsEntitlementGrantPreview = {
  previewId: string;
  confirmationToken: string;
  expiresAt: string;
  before: CommerceEntitlementSummary;
  after: CommerceEntitlementSummary;
  change: Omit<OpsEntitlementGrantRequest, 'reason'>;
};

export type OpsEntitlementGrantExecuteRequest = {
  confirmation: '确认发放';
  confirmationToken: string;
};

export type OpsEntitlementGrantResult = {
  adjustmentId: string;
  appliedAt: string;
  entitlement: CommerceEntitlementSummary;
};
/** Existing rank 2 remains selected; independently reported exam questions need not be selected. */
export type StudyScope = 'all' | 'selected' | 'crash';
export type StudyTier = 0 | 1 | 2;
export type StudyScopeCardIds = { all: string[]; selected: string[]; crash: string[] };
export function normalizeStudyScope(value: unknown): StudyScope {
  return value === 'all' || value === 'crash' ? value : 'selected';
}

/** Derived catalog projection only; the authoritative rank stays on the card
 * (or complete scenario). IDs carry no protected question/answer text. */
export function studyScopeCardIds(bankId: string, topic: { studyTier?: unknown; cards: readonly { id: string; studyTier?: unknown; retired?: boolean; examReported?: boolean }[] }): StudyScopeCardIds {
  const selected: string[] = [], crash: string[] = [];
  for (const card of topic.cards) {
    if (card.retired) continue;
    const tier = bankId === 'sentences900' ? 2 : topic.studyTier ?? card.studyTier ?? 0;
    if (tier === 1 || tier === 2) selected.push(card.id);
    if (tier === 2 || card.examReported === true) crash.push(card.id);
  }
  return { all: topic.cards.filter((card) => !card.retired).map((card) => card.id), selected, crash };
}
export type { StabilityRoute, StabilityPoint, StabilityMonitor, StabilityAiBucket, StabilityDashboard } from './ops-stability';
