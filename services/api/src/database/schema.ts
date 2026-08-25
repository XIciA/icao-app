import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').default('active').notNull(),
  mergedIntoAccountId: uuid('merged_into_account_id'),
  sessionsRevokedAt: timestamp('sessions_revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('accounts_status_check', sql`${table.status} IN ('active', 'merging', 'merged', 'deleting', 'deleted')`),
]).enableRLS();

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

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
]).enableRLS();

export const accountMerges = pgTable('account_merges', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceAccountId: uuid('source_account_id').notNull(),
  targetAccountId: uuid('target_account_id').notNull(),
  initiatedByAuthUserId: uuid('initiated_by_auth_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_merges_source').on(table.sourceAccountId),
  index('account_merges_target').on(table.targetAccountId),
]).enableRLS();

export const accountSessionRevocations = pgTable('account_session_revocations', {
  sessionId: uuid('session_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('account_session_revocations_user').on(table.userId),
]).enableRLS();

export const recentAuthChallenges = pgTable('recent_auth_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull(),
  authUserId: uuid('auth_user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  method: text('method').notNull(),
  purpose: text('purpose').notNull(),
  targetDigest: text('target_digest').notNull(),
  status: text('status').default('pending').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('recent_auth_challenges_account_session').on(table.accountId, table.sessionId, table.purpose, table.status),
  index('recent_auth_challenges_expiry').on(table.expiresAt),
  check('recent_auth_challenges_method_check', sql`${table.method} IN ('password', 'phone_otp', 'apple')`),
  check('recent_auth_challenges_purpose_check', sql`${table.purpose} IN ('account_delete', 'password_recovery', 'phone_binding')`),
  check('recent_auth_challenges_status_check', sql`${table.status} IN ('pending', 'verified', 'consumed', 'expired')`),
  check('recent_auth_challenges_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('recent_auth_challenges_verified_check', sql`${table.verifiedAt} IS NULL OR ${table.verifiedAt} >= ${table.createdAt}`),
  check('recent_auth_challenges_consumed_check', sql`${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt}`),
]).enableRLS();

export const recentAuthGrants = pgTable('recent_auth_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  challengeId: uuid('challenge_id').notNull()
    .references(() => recentAuthChallenges.id, { onDelete: 'restrict' }),
  accountId: uuid('account_id').notNull(),
  authUserId: uuid('auth_user_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  method: text('method').notNull(),
  purpose: text('purpose').notNull(),
  targetDigest: text('target_digest').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  reservationToken: uuid('reservation_token'),
  reservationExpiresAt: timestamp('reservation_expires_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('recent_auth_grants_challenge').on(table.challengeId),
  index('recent_auth_grants_account_session').on(table.accountId, table.sessionId, table.purpose),
  index('recent_auth_grants_expiry').on(table.expiresAt),
  check('recent_auth_grants_method_check', sql`${table.method} IN ('password', 'phone_otp', 'apple')`),
  check('recent_auth_grants_purpose_check', sql`${table.purpose} IN ('account_delete', 'password_recovery', 'phone_binding')`),
  check('recent_auth_grants_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('recent_auth_grants_reservation_check', sql`(
    (${table.reservationToken} IS NULL AND ${table.reservationExpiresAt} IS NULL)
    OR (${table.reservationToken} IS NOT NULL AND ${table.reservationExpiresAt} IS NOT NULL)
  )`),
  check('recent_auth_grants_consumed_check', sql`${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt}`),
]).enableRLS();

export const appleRevocableCredentials = pgTable('apple_revocable_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull(),
  authUserId: uuid('auth_user_id').notNull(),
  subjectDigest: text('subject_digest').notNull(),
  digestKeyVersion: integer('digest_key_version').default(1).notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  encryptionVersion: integer('encryption_version').default(1).notNull(),
  status: text('status').default('active').notNull(),
  revokeAttemptCount: integer('revoke_attempt_count').default(0).notNull(),
  revokeLeaseToken: uuid('revoke_lease_token'),
  revokeLeaseUntil: timestamp('revoke_lease_until', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('apple_revocable_credentials_auth_user').on(table.authUserId),
  uniqueIndex('apple_revocable_credentials_subject').on(table.subjectDigest),
  index('apple_revocable_credentials_account_status').on(table.accountId, table.status),
  index('apple_revocable_credentials_retry').on(table.status, table.nextRetryAt),
  check('apple_revocable_credentials_status_check', sql`${table.status} IN ('active', 'revoke_pending', 'retryable', 'revoked', 'manual_action_required')`),
  check('apple_revocable_credentials_attempts_check', sql`${table.revokeAttemptCount} >= 0`),
  check('apple_revocable_credentials_digest_key_version_check', sql`${table.digestKeyVersion} > 0`),
  check('apple_revocable_credentials_encryption_version_check', sql`${table.encryptionVersion} > 0`),
  check('apple_revocable_credentials_lease_check', sql`(
    (${table.revokeLeaseToken} IS NULL AND ${table.revokeLeaseUntil} IS NULL)
    OR (${table.revokeLeaseToken} IS NOT NULL AND ${table.revokeLeaseUntil} IS NOT NULL)
  )`),
]).enableRLS();

export const appleCredentialIntakes = pgTable('apple_credential_intakes', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull(),
  authUserId: uuid('auth_user_id').notNull(),
  subjectDigest: text('subject_digest').notNull(),
  subjectDigestAliases: jsonb('subject_digest_aliases').default(sql`'[]'::jsonb`).notNull(),
  digestKeyVersion: integer('digest_key_version').default(1).notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  encryptionVersion: integer('encryption_version').default(1).notNull(),
  status: text('status').default('pending_binding').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  retentionAt: timestamp('retention_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('apple_credential_intakes_account_status').on(table.accountId, table.status),
  index('apple_credential_intakes_retry').on(table.status, table.nextRetryAt),
  index('apple_credential_intakes_retention').on(table.retentionAt),
  check('apple_credential_intakes_status_check', sql`${table.status} IN ('pending_exchange', 'pending_validation', 'pending_binding', 'revoke_pending', 'retryable', 'revoked', 'manual_action_required')`),
  check('apple_credential_intakes_attempts_check', sql`${table.attemptCount} >= 0`),
  check('apple_credential_intakes_versions_check', sql`${table.digestKeyVersion} > 0 AND ${table.encryptionVersion} > 0`),
  check('apple_credential_intakes_aliases_check', sql`jsonb_typeof(${table.subjectDigestAliases}) = 'array'`),
  check('apple_credential_intakes_retention_check', sql`${table.retentionAt} > ${table.createdAt}`),
]).enableRLS();

export const lifetimeIdentityBenefitClaims = pgTable('lifetime_identity_benefit_claims', {
  benefitKey: text('benefit_key').notNull(),
  identityDigest: text('identity_digest').notNull(),
  provider: text('provider').notNull(),
  digestKeyVersion: integer('digest_key_version').default(1).notNull(),
  claimContextDigest: text('claim_context_digest').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.benefitKey, table.identityDigest] }),
  index('lifetime_identity_benefit_claims_claimed').on(table.benefitKey, table.claimedAt),
  check('lifetime_identity_benefit_claims_provider_check', sql`${table.provider} IN ('phone', 'apple')`),
  check('lifetime_identity_benefit_claims_key_version_check', sql`${table.digestKeyVersion} > 0`),
]).enableRLS();

export const phoneOtpIntents = pgTable('phone_otp_intents', {
  id: uuid('id').defaultRandom().primaryKey(),
  phoneDigest: text('phone_digest').notNull(),
  purpose: text('purpose').notNull(),
  accountId: uuid('account_id'),
  status: text('status').default('pending').notNull(),
  otpNotBefore: timestamp('otp_not_before', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('phone_otp_intents_lookup').on(table.phoneDigest, table.purpose, table.accountId, table.status),
  index('phone_otp_intents_expiry').on(table.expiresAt),
  check('phone_otp_intents_purpose_check', sql`${table.purpose} IN ('login', 'account_delete', 'password_recovery', 'phone_binding')`),
  check('phone_otp_intents_status_check', sql`${table.status} IN ('pending', 'consumed')`),
  check('phone_otp_intents_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('phone_otp_intents_otp_time_check', sql`${table.otpNotBefore} >= date_trunc('second', ${table.createdAt})`),
  check('phone_otp_intents_consumed_check', sql`${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt}`),
  check('phone_otp_intents_account_check', sql`(
    (${table.purpose} IN ('login', 'password_recovery') AND ${table.accountId} IS NULL)
    OR (${table.purpose} IN ('account_delete', 'phone_binding') AND ${table.accountId} IS NOT NULL)
  )`),
]).enableRLS();

export const smsUsageCounters = pgTable('sms_usage_counters', {
  scopeKey: text('scope_key').primaryKey(),
  count: integer('count').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sms_usage_counters_expiry').on(table.expiresAt),
  check('sms_usage_counters_count_check', sql`${table.count} >= 0`),
]).enableRLS();

export const smsDeliveryAttempts = pgTable('sms_delivery_attempts', {
  dedupeKey: text('dedupe_key').primaryKey(),
  phoneDigest: text('phone_digest').notNull(),
  status: text('status').default('processing').notNull(),
  leaseToken: uuid('lease_token').notNull(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }).notNull(),
  attemptCount: integer('attempt_count').default(1).notNull(),
  lastErrorCode: text('last_error_code'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sms_delivery_attempts_expiry').on(table.expiresAt),
  index('sms_delivery_attempts_lease').on(table.status, table.leaseUntil),
  check('sms_delivery_attempts_status_check', sql`${table.status} IN ('processing', 'retryable', 'completed')`),
  check('sms_delivery_attempts_attempts_check', sql`${table.attemptCount} > 0`),
  check('sms_delivery_attempts_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('sms_delivery_attempts_lease_time_check', sql`${table.leaseUntil} >= ${table.createdAt}`),
  check('sms_delivery_attempts_completed_time_check', sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt}`),
  check('sms_delivery_attempts_state_time_check', sql`(
    (${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL)
    OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)
  )`),
]).enableRLS();

export const accountDeletionJobs = pgTable('account_deletion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull(),
  requestedByAuthUserId: uuid('requested_by_auth_user_id'),
  idempotencyKey: uuid('idempotency_key').notNull(),
  status: text('status').default('pending').notNull(),
  identityProviderOutcome: text('identity_provider_outcome').default('pending').notNull(),
  objectCleanupStatus: text('object_cleanup_status').default('pending').notNull(),
  objectKeys: jsonb('object_keys').default(sql`'[]'::jsonb`).notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  leaseToken: uuid('lease_token'),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  identityProvidersRevokedAt: timestamp('identity_providers_revoked_at', { withTimezone: true }),
  authUsersDeletedAt: timestamp('auth_users_deleted_at', { withTimezone: true }),
  objectsDeletedAt: timestamp('objects_deleted_at', { withTimezone: true }),
  activeDataDeletedAt: timestamp('active_data_deleted_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_deletion_jobs_account').on(table.accountId),
  uniqueIndex('account_deletion_jobs_idempotency').on(table.idempotencyKey),
  index('account_deletion_jobs_retry').on(table.status, table.nextRetryAt),
  check('account_deletion_jobs_status_check', sql`${table.status} IN ('pending', 'processing', 'retryable', 'completed')`),
  check('account_deletion_jobs_identity_provider_outcome_check', sql`${table.identityProviderOutcome} IN ('pending', 'revoked', 'manual_action_required', 'not_applicable')`),
  check('account_deletion_jobs_object_cleanup_status_check', sql`${table.objectCleanupStatus} IN ('pending', 'retryable', 'completed', 'not_applicable')`),
  check('account_deletion_jobs_object_keys_check', sql`jsonb_typeof(${table.objectKeys}) = 'array'`),
  check('account_deletion_jobs_attempts_check', sql`${table.attemptCount} >= 0`),
]).enableRLS();

export const accountDeletionAuthUsers = pgTable('account_deletion_auth_users', {
  jobId: uuid('job_id').notNull()
    .references(() => accountDeletionJobs.id, { onDelete: 'restrict' }),
  authUserId: uuid('auth_user_id').notNull(),
  status: text('status').default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.jobId, table.authUserId] }),
  index('account_deletion_auth_users_retry').on(table.status, table.nextRetryAt),
  check('account_deletion_auth_users_status_check', sql`${table.status} IN ('pending', 'retryable', 'deleted')`),
  check('account_deletion_auth_users_attempts_check', sql`${table.attemptCount} >= 0`),
]).enableRLS();

export const accountDeletionTombstones = pgTable('account_deletion_tombstones', {
  accountId: uuid('account_id').primaryKey(),
  jobId: uuid('job_id').notNull()
    .references(() => accountDeletionJobs.id, { onDelete: 'restrict' }),
  status: text('status').default('pending').notNull(),
  legalRetentionUntil: timestamp('legal_retention_until', { withTimezone: true }).notNull(),
  benefitsRevokedAt: timestamp('benefits_revoked_at', { withTimezone: true }),
  activeDataDeletedAt: timestamp('active_data_deleted_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_deletion_tombstones_job').on(table.jobId),
  index('account_deletion_tombstones_retention').on(table.legalRetentionUntil),
  check('account_deletion_tombstones_status_check', sql`${table.status} IN ('pending', 'completed')`),
  check('account_deletion_tombstones_retention_check', sql`${table.legalRetentionUntil} > ${table.createdAt}`),
]).enableRLS();

export const accountContentCredentialRevocations = pgTable('account_content_credential_revocations', {
  accountId: uuid('account_id').primaryKey(),
  deletionJobId: uuid('deletion_job_id')
    .references(() => accountDeletionJobs.id, { onDelete: 'set null' }),
  revokedBefore: timestamp('revoked_before', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('account_content_credential_revocations_job').on(table.deletionJobId),
]).enableRLS();

export const accountDeletionStatusRateLimits = pgTable('account_deletion_status_rate_limits', {
  scopeDigest: text('scope_digest').primaryKey(),
  count: integer('count').default(0).notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('account_deletion_status_rate_limits_expiry').on(table.expiresAt),
  check('account_deletion_status_rate_limits_count_check', sql`${table.count} >= 0`),
  check('account_deletion_status_rate_limits_expiry_check', sql`${table.expiresAt} > ${table.windowStartedAt}`),
]).enableRLS();

export const accountSecurityEvents = pgTable('account_security_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountDigest: text('account_digest').notNull(),
  subjectDigest: text('subject_digest'),
  eventType: text('event_type').notNull(),
  outcome: text('outcome').notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  retentionAt: timestamp('retention_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('account_security_events_account_created').on(table.accountDigest, table.createdAt),
  index('account_security_events_retention').on(table.retentionAt),
  check('account_security_events_outcome_check', sql`${table.outcome} IN ('succeeded', 'failed', 'pending')`),
  check('account_security_events_retention_check', sql`${table.retentionAt} > ${table.createdAt}`),
]).enableRLS();

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
]).enableRLS();

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
}).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

export const inviteLoginAttempts = pgTable('invite_login_attempts', {
  sourceHash: text('source_hash').primaryKey(),
  failureCount: integer('failure_count').default(0).notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).defaultNow().notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

export const syncMutations = pgTable('sync_mutations', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  mutationId: text('mutation_id').notNull(),
  kind: text('kind').notNull(),
  payloadHash: text('payload_hash').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mutationId] }),
]).enableRLS();

export const userDocuments = pgTable('user_documents', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  documentKey: text('document_key').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.documentKey] }),
]).enableRLS();

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
]).enableRLS();

export const aiConsents = pgTable('ai_consents', {
  userId: uuid('user_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
  revision: integer('revision').default(1).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const aiConsentAuthorities = pgTable('ai_consent_authorities', {
  userId: uuid('user_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  revision: integer('revision').default(0).notNull(),
  active: boolean('active').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('ai_consent_authorities_revision_check', sql`${table.revision} >= 0`),
]).enableRLS();

export const aiConsentChallenges = pgTable('ai_consent_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  flowRevision: text('flow_revision').notNull(),
  tokenHash: text('token_hash').notNull(),
  consentRevision: integer('consent_revision').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ai_consent_challenges_token_hash').on(table.tokenHash),
  index('ai_consent_challenges_user').on(table.userId),
]).enableRLS();

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
]).enableRLS();

export const aiQuotaBuckets = pgTable('ai_quota_buckets', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bucketDate: text('bucket_date').notNull(),
  usedUnits: integer('used_units').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bucketDate] }),
]).enableRLS();

export const aiWordCache = pgTable('ai_word_cache', {
  userId: uuid('user_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  queryHash: text('query_hash').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.queryHash] }),
  index('ai_word_cache_expiry').on(table.expiresAt),
]).enableRLS();

export const opsStaffAccounts = pgTable('ops_staff_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecretCiphertext: text('totp_secret_ciphertext').notNull(),
  totpSecretIv: text('totp_secret_iv').notNull(),
  totpSecretTag: text('totp_secret_tag').notNull(),
  totpConfirmedAt: timestamp('totp_confirmed_at', { withTimezone: true }).notNull(),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).defaultNow().notNull(),
  lastTotpStep: bigint('last_totp_step', { mode: 'number' }).default(0).notNull(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ops_staff_accounts_email').on(table.email),
  index('ops_staff_accounts_role_active').on(table.role, table.disabledAt),
  check('ops_staff_accounts_email_check', sql`${table.email} = lower(${table.email}) AND length(${table.email}) BETWEEN 3 AND 254`),
  check('ops_staff_accounts_role_check', sql`${table.role} IN ('admin', 'support')`),
  check('ops_staff_accounts_last_totp_step_check', sql`${table.lastTotpStep} >= 0`),
]).enableRLS();

export const opsStaffRecoveryCodes = pgTable('ops_staff_recovery_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  staffId: uuid('staff_id').notNull()
    .references(() => opsStaffAccounts.id, { onDelete: 'restrict' }),
  codeHash: text('code_hash').notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ops_staff_recovery_codes_hash').on(table.codeHash),
  index('ops_staff_recovery_codes_staff').on(table.staffId, table.consumedAt),
]).enableRLS();

export const opsStaffSessions = pgTable('ops_staff_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  staffId: uuid('staff_id').notNull()
    .references(() => opsStaffAccounts.id, { onDelete: 'restrict' }),
  tokenHash: text('token_hash').notNull(),
  deviceName: text('device_name'),
  totpVerifiedAt: timestamp('totp_verified_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ops_staff_sessions_token_hash').on(table.tokenHash),
  index('ops_staff_sessions_staff_active').on(table.staffId, table.revokedAt, table.expiresAt),
  index('ops_staff_sessions_expiry').on(table.expiresAt),
  check('ops_staff_sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
]).enableRLS();

export const opsChangePreviews = pgTable('ops_change_previews', {
  id: uuid('id').defaultRandom().primaryKey(),
  staffId: uuid('staff_id').notNull()
    .references(() => opsStaffAccounts.id, { onDelete: 'restrict' }),
  sessionId: uuid('session_id').notNull()
    .references(() => opsStaffSessions.id, { onDelete: 'restrict' }),
  changeType: text('change_type').notNull(),
  targetAccountId: uuid('target_account_id').notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  requestPayload: jsonb('request_payload').notNull(),
  beforeState: jsonb('before_state').notNull(),
  afterState: jsonb('after_state').notNull(),
  confirmationHash: text('confirmation_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ops_change_previews_confirmation_hash').on(table.confirmationHash),
  index('ops_change_previews_actor_pending').on(table.staffId, table.sessionId, table.executedAt),
  index('ops_change_previews_expiry').on(table.expiresAt),
  check('ops_change_previews_change_type_check', sql`${table.changeType} IN ('grant_review_entitlement')`),
  check('ops_change_previews_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
]).enableRLS();

export const opsEntitlementAdjustments = pgTable('ops_entitlement_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  previewId: uuid('preview_id').notNull()
    .references(() => opsChangePreviews.id, { onDelete: 'restrict' }),
  staffId: uuid('staff_id').notNull()
    .references(() => opsStaffAccounts.id, { onDelete: 'restrict' }),
  accountId: uuid('account_id').notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  environment: text('environment').notNull(),
  reason: text('reason').notNull(),
  membershipDays: integer('membership_days').default(0).notNull(),
  aiPoints: integer('ai_points').default(0).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ops_entitlement_adjustments_preview').on(table.previewId),
  index('ops_entitlement_adjustments_account').on(table.environment, table.accountId, table.appliedAt),
  check('ops_entitlement_adjustments_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ops_entitlement_adjustments_reason_check', sql`length(btrim(${table.reason})) BETWEEN 8 AND 500`),
  check('ops_entitlement_adjustments_values_check', sql`${table.membershipDays} BETWEEN 0 AND 366 AND ${table.aiPoints} BETWEEN 0 AND 100000 AND (${table.membershipDays} > 0 OR ${table.aiPoints} > 0)`),
]).enableRLS();

export const opsAuditEvents = pgTable('ops_audit_events', {
  sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
  requestId: text('request_id').notNull(),
  actorStaffId: uuid('actor_staff_id')
    .references(() => opsStaffAccounts.id, { onDelete: 'restrict' }),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  reason: text('reason').notNull(),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ops_audit_events_actor_created').on(table.actorStaffId, table.createdAt),
  index('ops_audit_events_target_created').on(table.targetType, table.targetId, table.createdAt),
  check('ops_audit_events_actor_role_check', sql`${table.actorRole} IS NULL OR ${table.actorRole} IN ('admin', 'support')`),
  check('ops_audit_events_reason_check', sql`length(btrim(${table.reason})) BETWEEN 3 AND 500`),
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
  membershipGrantSource: text('membership_grant_source').notNull(),
  membershipEffectiveAt: timestamp('membership_effective_at', { withTimezone: true }).notNull(),
  membershipContributionMs: bigint('membership_contribution_ms', { mode: 'number' }).notNull(),
  status: text('status').default('verified').notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revocationCycleKey: text('revocation_cycle_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('commerce_orders_external').on(table.environment, table.channel, table.externalOrderId),
  unique('commerce_orders_identity').on(table.id, table.environment, table.accountId),
  index('commerce_orders_account_purchased').on(table.environment, table.accountId, table.purchasedAt),
  index('commerce_orders_product').on(table.productKey),
  check('commerce_orders_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('commerce_orders_channel_check', sql`${table.channel} IN ('apple_app_store', 'alipay', 'wechat_pay')`),
  check('commerce_orders_status_check', sql`${table.status} IN ('verified', 'refunded', 'revoked')`),
  check('commerce_orders_membership_source_check', sql`${table.membershipGrantSource} IN ('purchase_discovery', 'refund_restore')`),
  check('commerce_orders_membership_contribution_nonnegative', sql`${table.membershipContributionMs} >= 0`),
  check('commerce_orders_duration_positive', sql`${table.durationDays} > 0`),
]).enableRLS();

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
]).enableRLS();

export const appleNotificationEvents = pgTable('apple_notification_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  notificationUuid: uuid('notification_uuid').notNull(),
  notificationType: text('notification_type').notNull(),
  subtype: text('subtype'),
  status: text('status').default('received').notNull(),
  signedPayload: text('signed_payload'),
  signedPayloadHash: text('signed_payload_hash').notNull(),
  decodedPayload: jsonb('decoded_payload').notNull(),
  errorCode: text('error_code'),
  attemptCount: integer('attempt_count').default(0).notNull(),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  leaseOwner: uuid('lease_owner'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  retentionAt: timestamp('retention_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('apple_notification_events_environment_uuid').on(table.environment, table.notificationUuid),
  index('apple_notification_events_status_received').on(table.status, table.receivedAt),
  index('apple_notification_events_retry').on(table.environment, table.status, table.nextAttemptAt),
  check('apple_notification_events_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('apple_notification_events_status_check', sql`${table.status} IN ('received', 'processed', 'failed', 'expired')`),
  check('apple_notification_events_attempt_count_check', sql`${table.attemptCount} >= 0`),
  check('apple_notification_events_lease_check', sql`(
    (${table.lockedAt} IS NULL AND ${table.leaseOwner} IS NULL AND ${table.leaseUntil} IS NULL)
    OR (${table.lockedAt} IS NOT NULL AND ${table.leaseOwner} IS NOT NULL AND ${table.leaseUntil} IS NOT NULL)
  )`),
]).enableRLS();

export const membershipEntitlementSegments = pgTable('membership_entitlement_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  orderId: uuid('order_id'),
  opsAdjustmentId: uuid('ops_adjustment_id')
    .references(() => opsEntitlementAdjustments.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').default('active').notNull(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('membership_segments_order_revision').on(table.environment, table.orderId, table.revision),
  uniqueIndex('membership_segments_adjustment_revision').on(table.environment, table.opsAdjustmentId, table.revision),
  unique('membership_segments_identity').on(table.id, table.environment, table.accountId),
  index('membership_segments_account_window').on(table.environment, table.accountId, table.startsAt, table.endsAt),
  index('membership_segments_active').on(table.environment, table.accountId, table.status),
  foreignKey({
    columns: [table.orderId, table.environment, table.accountId],
    foreignColumns: [commerceOrders.id, commerceOrders.environment, commerceOrders.accountId],
    name: 'membership_segments_order_environment_account_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('membership_segments_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('membership_segments_status_check', sql`${table.status} IN ('active', 'superseded', 'revoked')`),
  check('membership_segments_source_check', sql`num_nonnulls(${table.orderId}, ${table.opsAdjustmentId}) = 1`),
  check('membership_segments_window_check', sql`${table.endsAt} > ${table.startsAt}`),
]).enableRLS();

export const contentAccessCredentials = pgTable('content_access_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').default('production').notNull(),
  accountId: uuid('account_id').notNull(),
  entitlementSegmentId: uuid('entitlement_segment_id').notNull(),
  deviceDigest: text('device_digest').notNull(),
  scopes: jsonb('scopes').notNull(),
  policyVersion: text('policy_version').notNull(),
  credentialDigest: text('credential_digest').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  retentionAt: timestamp('retention_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('content_access_credentials_digest').on(table.credentialDigest),
  index('content_access_credentials_account_expiry').on(table.accountId, table.expiresAt),
  index('content_access_credentials_retention').on(table.retentionAt),
  foreignKey({
    columns: [table.entitlementSegmentId, table.environment, table.accountId],
    foreignColumns: [
      membershipEntitlementSegments.id,
      membershipEntitlementSegments.environment,
      membershipEntitlementSegments.accountId,
    ],
    name: 'content_access_credentials_entitlement_fk',
  }).onDelete('restrict').onUpdate('cascade'),
  check('content_access_credentials_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('content_access_credentials_window_check', sql`${table.expiresAt} > ${table.issuedAt} AND ${table.expiresAt} <= ${table.issuedAt} + interval '72 hours'`),
  check('content_access_credentials_retention_check', sql`${table.retentionAt} >= ${table.expiresAt}`),
]).enableRLS();

export const contentEnvironmentSessionGrants = pgTable('content_environment_session_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  sessionDigest: text('session_digest').notNull(),
  verifiedTransactionId: text('verified_transaction_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  retentionAt: timestamp('retention_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('content_environment_session_grants_identity').on(table.environment, table.sessionDigest),
  index('content_environment_session_grants_account_expiry').on(table.accountId, table.environment, table.expiresAt),
  index('content_environment_session_grants_retention').on(table.retentionAt),
  check('content_environment_session_grants_environment_check', sql`${table.environment} = 'sandbox'`),
  check('content_environment_session_grants_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  check('content_environment_session_grants_retention_check', sql`${table.retentionAt} >= ${table.expiresAt}`),
]).enableRLS();

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
  unique('ai_point_batches_identity').on(table.id, table.environment, table.accountId),
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
]).enableRLS();

export const aiPointReservations = pgTable('ai_point_reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: text('environment').notNull(),
  accountId: uuid('account_id').notNull(),
  operationId: text('operation_id').notNull(),
  capability: text('capability').notNull(),
  requestDigest: text('request_digest').default('legacy').notNull(),
  ruleVersion: text('rule_version').notNull(),
  points: integer('points').notNull(),
  status: text('status').default('reserved').notNull(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  resultPayload: jsonb('result_payload'),
  failureCode: text('failure_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('ai_point_reservations_operation').on(table.environment, table.accountId, table.operationId),
  unique('ai_point_reservations_identity').on(table.id, table.environment, table.accountId),
  index('ai_point_reservations_account_status').on(table.environment, table.accountId, table.status),
  check('ai_point_reservations_environment_check', sql`${table.environment} IN ('sandbox', 'production')`),
  check('ai_point_reservations_status_check', sql`${table.status} IN ('reserved', 'settled', 'released')`),
  check('ai_point_reservations_points_positive', sql`${table.points} > 0`),
]).enableRLS();

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
]).enableRLS();

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
  uniqueIndex('ai_point_ledger_merge_credit_operation')
    .on(table.environment, table.accountId, table.operationId)
    .where(sql`${table.entryType} = 'merge_credit'`),
  uniqueIndex('ai_point_ledger_merge_debit_batch')
    .on(table.environment, table.batchId)
    .where(sql`${table.entryType} = 'merge_debit'`),
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
  check('ai_point_ledger_entry_direction_pair_check', sql`(
    (${table.entryType} IN ('grant', 'release', 'restore', 'merge_credit') AND ${table.direction} = 'credit')
    OR (${table.entryType} IN ('reserve', 'revoke', 'expire', 'merge_debit') AND ${table.direction} = 'debit')
    OR (${table.entryType} = 'settle' AND ${table.direction} = 'neutral')
  )`),
  check('ai_point_ledger_points_nonnegative', sql`${table.points} >= 0`),
]).enableRLS();
