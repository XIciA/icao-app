import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
  sourcePath: text('source_path').notNull(),
  checksum: text('checksum').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  mimeType: text('mime_type').notNull(),
  status: text('status').default('ready').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userCardStates = pgTable('user_card_states', {
  userId: uuid('user_id').notNull(),
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
  userId: uuid('user_id').notNull(),
  clientRecordId: text('client_record_id').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('learning_record_user_client').on(table.userId, table.clientRecordId),
]);

export const syncMutations = pgTable('sync_mutations', {
  userId: uuid('user_id').notNull(),
  mutationId: text('mutation_id').notNull(),
  kind: text('kind').notNull(),
  payloadHash: text('payload_hash').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mutationId] }),
]);

export const userDocuments = pgTable('user_documents', {
  userId: uuid('user_id').notNull(),
  documentKey: text('document_key').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.documentKey] }),
]);

export const syncChanges = pgTable('sync_changes', {
  sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  entityKey: text('entity_key').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sync_changes_user_sequence').on(table.userId, table.sequence),
]);

export const aiConsents = pgTable('ai_consents', {
  userId: uuid('user_id').primaryKey(),
  policyVersion: text('policy_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  requestId: text('request_id').notNull(),
  capability: text('capability').notNull(),
  status: text('status').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  latencyMs: integer('latency_ms').notNull(),
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
  userId: uuid('user_id').notNull(),
  bucketDate: text('bucket_date').notNull(),
  usedUnits: integer('used_units').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bucketDate] }),
]);

export const aiWordCache = pgTable('ai_word_cache', {
  userId: uuid('user_id').notNull(),
  queryHash: text('query_hash').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.queryHash] }),
  index('ai_word_cache_expiry').on(table.expiresAt),
]);
