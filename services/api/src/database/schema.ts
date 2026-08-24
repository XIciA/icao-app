import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

export const commerceProducts = pgTable('commerce_products', {
  productKey: text('product_key').primaryKey(),
  displayName: text('display_name').notNull(),
  durationDays: integer('duration_days').notNull(),
  basePriceCnyFen: integer('base_price_cny_fen').notNull(),
  aiPointRuleVersion: text('ai_point_rule_version').notNull(),
  aiPointBatchCount: integer('ai_point_batch_count').notNull(),
  aiPointBatchIntervalDays: integer('ai_point_batch_interval_days').notNull(),
  aiPointsPerBatch: integer('ai_points_per_batch').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('commerce_products_duration_positive', sql`${table.durationDays} > 0`),
  check('commerce_products_price_positive', sql`${table.basePriceCnyFen} > 0`),
  check('commerce_products_ai_batches_positive', sql`${table.aiPointBatchCount} > 0`),
  check('commerce_products_ai_batch_interval_positive', sql`${table.aiPointBatchIntervalDays} > 0`),
  check('commerce_products_ai_points_positive', sql`${table.aiPointsPerBatch} > 0`),
]);

export const commerceChannelProducts = pgTable('commerce_channel_products', {
  id: uuid('id').defaultRandom().primaryKey(),
  channel: text('channel').notNull(),
  externalProductId: text('external_product_id').notNull(),
  productKey: text('product_key').notNull()
    .references(() => commerceProducts.productKey, { onDelete: 'restrict' }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('commerce_channel_products_external').on(table.channel, table.externalProductId),
  uniqueIndex('commerce_channel_products_internal').on(table.channel, table.productKey),
  check('commerce_channel_products_channel_check', sql`${table.channel} IN ('apple_app_store', 'alipay', 'wechat_pay')`),
]);

export const commerceOrders = pgTable('commerce_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  channel: text('channel').notNull(),
  externalOrderId: text('external_order_id').notNull(),
  accountId: uuid('account_id').notNull(),
  originalAccountId: uuid('original_account_id').notNull(),
  productKey: text('product_key').notNull()
    .references(() => commerceProducts.productKey, { onDelete: 'restrict' }),
  externalProductId: text('external_product_id').notNull(),
  durationDays: integer('duration_days').notNull(),
  aiPointRuleVersion: text('ai_point_rule_version').notNull(),
  status: text('status').default('verified').notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('commerce_orders_external').on(table.environment, table.channel, table.externalOrderId),
  uniqueIndex('commerce_orders_identity').on(table.id, table.environment, table.accountId),
  index('commerce_orders_account_purchased').on(table.environment, table.accountId, table.purchasedAt),
  index('commerce_orders_product').on(table.productKey),
  check('commerce_orders_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('commerce_orders_channel_check', sql`${table.channel} IN ('apple_app_store', 'alipay', 'wechat_pay')`),
  check('commerce_orders_status_check', sql`${table.status} IN ('verified', 'refunded', 'revoked')`),
  check('commerce_orders_duration_positive', sql`${table.durationDays} > 0`),
]);

export const appleTransactions = pgTable('apple_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  transactionId: text('transaction_id').notNull(),
  originalTransactionId: text('original_transaction_id').notNull(),
  orderId: uuid('order_id').notNull(),
  accountId: uuid('account_id').notNull(),
  appAccountToken: uuid('app_account_token'),
  productId: text('product_id').notNull(),
  bundleId: text('bundle_id').notNull(),
  storefront: text('storefront'),
  currency: text('currency'),
  priceMilliunits: bigint('price_milliunits', { mode: 'number' }),
  purchaseDate: timestamp('purchase_date', { withTimezone: true }).notNull(),
  signedDate: timestamp('signed_date', { withTimezone: true }).notNull(),
  revocationDate: timestamp('revocation_date', { withTimezone: true }),
  revocationReason: integer('revocation_reason'),
  signedPayloadHash: text('signed_payload_hash').notNull(),
  decodedPayload: jsonb('decoded_payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('apple_transactions_environment_transaction').on(table.environment, table.transactionId),
  index('apple_transactions_original').on(table.environment, table.originalTransactionId),
  index('apple_transactions_account_purchase').on(table.environment, table.accountId, table.purchaseDate),
  index('apple_transactions_order').on(table.orderId),
  foreignKey({
    columns: [table.orderId, table.environment, table.accountId],
    foreignColumns: [commerceOrders.id, commerceOrders.environment, commerceOrders.accountId],
    name: 'apple_transactions_order_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('apple_transactions_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
]);

export const appleNotificationEvents = pgTable('apple_notification_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  notificationUuid: uuid('notification_uuid').notNull(),
  notificationType: text('notification_type').notNull(),
  subtype: text('subtype'),
  status: text('status').default('received').notNull(),
  signedPayloadHash: text('signed_payload_hash').notNull(),
  decodedPayload: jsonb('decoded_payload').notNull(),
  errorCode: text('error_code'),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('apple_notification_events_environment_uuid').on(table.environment, table.notificationUuid),
  index('apple_notification_events_status_received').on(table.status, table.receivedAt),
  check('apple_notification_events_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('apple_notification_events_status_check', sql`${table.status} IN ('received', 'processed', 'failed')`),
]);

export const membershipEntitlementSegments = pgTable('membership_entitlement_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  orderId: uuid('order_id').notNull(),
  revision: integer('revision').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').default('active').notNull(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('membership_segments_order_revision').on(table.environment, table.orderId, table.revision),
  uniqueIndex('membership_segments_identity').on(table.id, table.environment, table.accountId),
  index('membership_segments_account_window').on(table.environment, table.accountId, table.startsAt, table.endsAt),
  index('membership_segments_active').on(table.environment, table.accountId, table.status),
  foreignKey({
    columns: [table.orderId, table.environment, table.accountId],
    foreignColumns: [commerceOrders.id, commerceOrders.environment, commerceOrders.accountId],
    name: 'membership_segments_order_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('membership_segments_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('membership_segments_status_check', sql`${table.status} IN ('active', 'superseded', 'revoked')`),
  check('membership_segments_window_check', sql`${table.endsAt} > ${table.startsAt}`),
]);

export const aiPointBatches = pgTable('ai_point_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  originalAccountId: uuid('original_account_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceReference: text('source_reference').notNull(),
  sourceOrderId: uuid('source_order_id'),
  entitlementSegmentId: uuid('entitlement_segment_id'),
  ruleVersion: text('rule_version').notNull(),
  ordinal: integer('ordinal').notNull(),
  grantedPoints: integer('granted_points').notNull(),
  consumedPoints: integer('consumed_points').default(0).notNull(),
  reservedPoints: integer('reserved_points').default(0).notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status').default('scheduled').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ai_point_batches_source_ordinal').on(table.environment, table.sourceType, table.sourceReference, table.ordinal),
  uniqueIndex('ai_point_batches_identity').on(table.id, table.environment, table.accountId),
  index('ai_point_batches_account_expiry').on(table.environment, table.accountId, table.expiresAt),
  index('ai_point_batches_order').on(table.sourceOrderId),
  foreignKey({
    columns: [table.sourceOrderId, table.environment, table.accountId],
    foreignColumns: [commerceOrders.id, commerceOrders.environment, commerceOrders.accountId],
    name: 'ai_point_batches_order_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  foreignKey({
    columns: [table.entitlementSegmentId, table.environment, table.accountId],
    foreignColumns: [
      membershipEntitlementSegments.id,
      membershipEntitlementSegments.environment,
      membershipEntitlementSegments.accountId,
    ],
    name: 'ai_point_batches_segment_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('ai_point_batches_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ai_point_batches_source_check', sql`${table.sourceType} IN ('trial', 'membership', 'compensation')`),
  check('ai_point_batches_status_check', sql`${table.status} IN ('scheduled', 'available', 'expired', 'revoked', 'merged')`),
  check('ai_point_batches_grant_positive', sql`${table.grantedPoints} >= 0`),
  check('ai_point_batches_consumed_nonnegative', sql`${table.consumedPoints} >= 0`),
  check('ai_point_batches_reserved_nonnegative', sql`${table.reservedPoints} >= 0`),
  check('ai_point_batches_total_within_grant', sql`${table.consumedPoints} + ${table.reservedPoints} <= ${table.grantedPoints}`),
]);

export const aiPointReservations = pgTable('ai_point_reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  operationId: text('operation_id').notNull(),
  capability: text('capability').notNull(),
  ruleVersion: text('rule_version').notNull(),
  points: integer('points').notNull(),
  status: text('status').default('reserved').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('ai_point_reservations_operation').on(table.environment, table.accountId, table.operationId),
  uniqueIndex('ai_point_reservations_identity').on(table.id, table.environment, table.accountId),
  index('ai_point_reservations_account_status').on(table.environment, table.accountId, table.status),
  check('ai_point_reservations_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ai_point_reservations_status_check', sql`${table.status} IN ('reserved', 'settled', 'released')`),
  check('ai_point_reservations_points_positive', sql`${table.points} > 0`),
]);

export const aiPointReservationAllocations = pgTable('ai_point_reservation_allocations', {
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  reservationId: uuid('reservation_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  points: integer('points').notNull(),
}, (table) => [
  primaryKey({ columns: [table.reservationId, table.batchId] }),
  index('ai_point_reservation_allocations_batch').on(table.batchId),
  foreignKey({
    columns: [table.reservationId, table.environment, table.accountId],
    foreignColumns: [aiPointReservations.id, aiPointReservations.environment, aiPointReservations.accountId],
    name: 'ai_point_allocations_reservation_environment_account_fk',
  }).onDelete('cascade').onUpdate('cascade'),
  foreignKey({
    columns: [table.batchId, table.environment, table.accountId],
    foreignColumns: [aiPointBatches.id, aiPointBatches.environment, aiPointBatches.accountId],
    name: 'ai_point_allocations_batch_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('ai_point_reservation_allocations_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ai_point_reservation_allocations_points_positive', sql`${table.points} > 0`),
]);

export const aiPointLedgerEntries = pgTable('ai_point_ledger_entries', {
  sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  reservationId: uuid('reservation_id'),
  operationId: text('operation_id').notNull(),
  entryType: text('entry_type').notNull(),
  direction: text('direction').notNull(),
  points: integer('points').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ai_point_ledger_idempotency').on(
    table.environment,
    table.accountId,
    table.operationId,
    table.entryType,
    table.batchId,
  ),
  index('ai_point_ledger_account_sequence').on(table.environment, table.accountId, table.sequence),
  index('ai_point_ledger_reservation').on(table.reservationId),
  foreignKey({
    columns: [table.batchId, table.environment, table.accountId],
    foreignColumns: [aiPointBatches.id, aiPointBatches.environment, aiPointBatches.accountId],
    name: 'ai_point_ledger_batch_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  foreignKey({
    columns: [table.reservationId, table.environment, table.accountId],
    foreignColumns: [aiPointReservations.id, aiPointReservations.environment, aiPointReservations.accountId],
    name: 'ai_point_ledger_reservation_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('ai_point_ledger_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ai_point_ledger_entry_type_check', sql`${table.entryType} IN ('grant', 'reserve', 'settle', 'release', 'revoke', 'expire', 'restore', 'merge_debit', 'merge_credit')`),
  check('ai_point_ledger_direction_check', sql`${table.direction} IN ('credit', 'debit', 'neutral')`),
  check('ai_point_ledger_points_nonnegative', sql`${table.points} >= 0`),
]);
