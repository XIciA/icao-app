import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').default('active').notNull(),
  mergedIntoAccountId: uuid('merged_into_account_id'),
  sessionsRevokedAt: timestamp('sessions_revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accountIdentities = pgTable('account_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  authUserId: uuid('auth_user_id').notNull(),
  provider: text('provider').notNull(),
  subjectHash: text('subject_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_identities_provider_subject').on(table.provider, table.subjectHash),
  uniqueIndex('account_identities_auth_provider').on(table.authUserId, table.provider),
  index('account_identities_account').on(table.accountId),
  index('account_identities_auth_user').on(table.authUserId),
]);

export const accountMerges = pgTable('account_merges', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceAccountId: uuid('source_account_id').notNull(),
  targetAccountId: uuid('target_account_id').notNull(),
  initiatedByAuthUserId: uuid('initiated_by_auth_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_merges_source').on(table.sourceAccountId),
  index('account_merges_target').on(table.targetAccountId),
]);

export const accountSessionRevocations = pgTable('account_session_revocations', {
  sessionId: uuid('session_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('account_session_revocations_user').on(table.userId),
]);

export const questionBankReleases = pgTable('question_bank_releases', {
  id: uuid('id').defaultRandom().primaryKey(),
  bankId: text('bank_id').notNull(),
  version: integer('version').notNull(),
  checksum: text('checksum').notNull(),
  payload: jsonb('payload').notNull(),
  active: boolean('active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('question_bank_release_bank_version').on(table.bankId, table.version),
  uniqueIndex('question_bank_release_checksum').on(table.bankId, table.checksum),
]);

export const resourceObjects = pgTable('resource_objects', {
  objectKey: text('object_key').primaryKey(),
  module: text('module').notNull(),
  storageBucket: text('storage_bucket').default('question-bank-assets').notNull(),
  sourcePath: text('source_path').notNull(),
  checksum: text('checksum').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  mimeType: text('mime_type').notNull(),
  status: text('status').default('ready').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const editorialReleases = pgTable('editorial_releases', {
  id: uuid('id').defaultRandom().primaryKey(),
  version: integer('version').notNull(),
  checksum: text('checksum').notNull(),
  payload: jsonb('payload').notNull(),
  active: boolean('active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('editorial_release_version').on(table.version),
  uniqueIndex('editorial_release_checksum').on(table.checksum),
]);

export const inviteAccounts = pgTable('invite_accounts', {
  codeLookup: text('code_lookup').primaryKey(),
  codeHash: text('code_hash').notNull(),
  displayName: text('display_name').notNull(),
  userId: uuid('user_id'),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('invite_accounts_user').on(table.userId),
]);

export const inviteLoginAttempts = pgTable('invite_login_attempts', {
  sourceHash: text('source_hash').primaryKey(),
  failureCount: integer('failure_count').default(0).notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).defaultNow().notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const feedbackTickets = pgTable('feedback_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketNumber: text('ticket_number').notNull(),
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  clientSubmissionId: uuid('client_submission_id').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  contact: text('contact'),
  status: text('status').default('received').notNull(),
  source: text('source').notNull(),
  sourceRoute: text('source_route').notNull(),
  appDisplayVersion: text('app_display_version').notNull(),
  platform: text('platform').notNull(),
  browserName: text('browser_name'),
  browserVersion: text('browser_version'),
  osName: text('os_name'),
  osVersion: text('os_version'),
  errorCode: text('error_code'),
  errorRequestId: text('error_request_id'),
  diagnostics: jsonb('diagnostics'),
  diagnosticsExpiresAt: timestamp('diagnostics_expires_at', { withTimezone: true }),
  retentionAt: timestamp('retention_at', { withTimezone: true }).notNull(),
  bankId: text('bank_id'),
  bankVersion: integer('bank_version'),
  bankChecksum: text('bank_checksum'),
  categoryId: text('category_id'),
  topicId: text('topic_id'),
  cardId: text('card_id'),
  questionVerified: boolean('question_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('feedback_tickets_ticket_number').on(table.ticketNumber),
  uniqueIndex('feedback_tickets_user_submission').on(table.userId, table.clientSubmissionId),
  index('feedback_tickets_user_created').on(table.userId, table.createdAt),
  index('feedback_tickets_status_created').on(table.status, table.createdAt),
  index('feedback_tickets_category_created').on(table.category, table.createdAt),
  index('feedback_tickets_app_version').on(table.appDisplayVersion),
  index('feedback_tickets_question').on(table.bankId, table.cardId),
  index('feedback_tickets_diagnostics_expires').on(table.diagnosticsExpiresAt),
  index('feedback_tickets_retention').on(table.retentionAt),
]);

export const feedbackAttachments = pgTable('feedback_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull()
    .references(() => feedbackTickets.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksum: text('checksum').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('feedback_attachments_object_key').on(table.objectKey),
  index('feedback_attachments_ticket').on(table.ticketId),
  index('feedback_attachments_expiry').on(table.expiresAt),
]);

export const userCardStates = pgTable('user_card_states', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bankId: text('bank_id').notNull(),
  topicId: text('topic_id').notNull(),
  cardId: text('card_id').notNull(),
  state: jsonb('state').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bankId, table.topicId, table.cardId] }),
]);

export const learningRecords = pgTable('learning_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  clientRecordId: text('client_record_id').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('learning_record_user_client').on(table.userId, table.clientRecordId),
]);

export const syncMutations = pgTable('sync_mutations', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  mutationId: text('mutation_id').notNull(),
  kind: text('kind').notNull(),
  payloadHash: text('payload_hash').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mutationId] }),
]);

export const userDocuments = pgTable('user_documents', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  documentKey: text('document_key').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.documentKey] }),
]);

export const syncChanges = pgTable('sync_changes', {
  sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  entityKey: text('entity_key').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sync_changes_user_sequence').on(table.userId, table.sequence),
]);

export const aiConsents = pgTable('ai_consents', {
  userId: uuid('user_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  requestId: text('request_id').notNull(),
  capability: text('capability').notNull(),
  status: text('status').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  failureCode: text('failure_code'),
  upstreamStatus: text('upstream_status'),
  attemptCount: integer('attempt_count').default(1).notNull(),
  quotaUnits: integer('quota_units').default(0).notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costMicrounits: bigint('cost_microunits', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ai_usage_user_created').on(table.userId, table.createdAt),
  uniqueIndex('ai_usage_request_capability').on(table.requestId, table.capability),
]);

export const aiQuotaBuckets = pgTable('ai_quota_buckets', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bucketDate: text('bucket_date').notNull(),
  usedUnits: integer('used_units').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bucketDate] }),
]);

export const aiWordCache = pgTable('ai_word_cache', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  queryHash: text('query_hash').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.queryHash] }),
  index('ai_word_cache_expiry').on(table.expiresAt),
]);
