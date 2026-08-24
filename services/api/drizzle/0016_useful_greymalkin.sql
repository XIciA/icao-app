CREATE TABLE "account_content_credential_revocations" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"deletion_job_id" uuid NOT NULL,
	"revoked_before" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_content_credential_revocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_deletion_auth_users" (
	"job_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error_code" text,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_auth_users_job_id_auth_user_id_pk" PRIMARY KEY("job_id","auth_user_id"),
	CONSTRAINT "account_deletion_auth_users_status_check" CHECK ("account_deletion_auth_users"."status" IN ('pending', 'retryable', 'deleted')),
	CONSTRAINT "account_deletion_auth_users_attempts_check" CHECK ("account_deletion_auth_users"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_deletion_auth_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"requested_by_auth_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"identity_provider_outcome" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error_code" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"identity_providers_revoked_at" timestamp with time zone,
	"auth_users_deleted_at" timestamp with time zone,
	"active_data_deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_jobs_status_check" CHECK ("account_deletion_jobs"."status" IN ('pending', 'processing', 'retryable', 'completed')),
	CONSTRAINT "account_deletion_jobs_identity_provider_outcome_check" CHECK ("account_deletion_jobs"."identity_provider_outcome" IN ('pending', 'revoked', 'manual_action_required', 'not_applicable')),
	CONSTRAINT "account_deletion_jobs_attempts_check" CHECK ("account_deletion_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_deletion_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_deletion_tombstones" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"legal_retention_until" timestamp with time zone NOT NULL,
	"benefits_revoked_at" timestamp with time zone,
	"active_data_deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_tombstones_status_check" CHECK ("account_deletion_tombstones"."status" IN ('pending', 'completed')),
	CONSTRAINT "account_deletion_tombstones_retention_check" CHECK ("account_deletion_tombstones"."legal_retention_until" > "account_deletion_tombstones"."created_at")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_tombstones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_digest" text NOT NULL,
	"subject_digest" text,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retention_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_security_events_outcome_check" CHECK ("account_security_events"."outcome" IN ('succeeded', 'failed', 'pending')),
	CONSTRAINT "account_security_events_retention_check" CHECK ("account_security_events"."retention_at" > "account_security_events"."created_at")
);
--> statement-breakpoint
ALTER TABLE "account_security_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apple_revocable_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"subject_digest" text NOT NULL,
	"digest_key_version" integer DEFAULT 1 NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encryption_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revoke_attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_revocable_credentials_status_check" CHECK ("apple_revocable_credentials"."status" IN ('active', 'revoke_pending', 'retryable', 'revoked')),
	CONSTRAINT "apple_revocable_credentials_attempts_check" CHECK ("apple_revocable_credentials"."revoke_attempt_count" >= 0),
	CONSTRAINT "apple_revocable_credentials_digest_key_version_check" CHECK ("apple_revocable_credentials"."digest_key_version" > 0),
	CONSTRAINT "apple_revocable_credentials_encryption_version_check" CHECK ("apple_revocable_credentials"."encryption_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "apple_revocable_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lifetime_identity_benefit_claims" (
	"benefit_key" text NOT NULL,
	"identity_digest" text NOT NULL,
	"provider" text NOT NULL,
	"digest_key_version" integer DEFAULT 1 NOT NULL,
	"claim_context_digest" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lifetime_identity_benefit_claims_benefit_key_identity_digest_pk" PRIMARY KEY("benefit_key","identity_digest"),
	CONSTRAINT "lifetime_identity_benefit_claims_provider_check" CHECK ("lifetime_identity_benefit_claims"."provider" IN ('phone', 'apple')),
	CONSTRAINT "lifetime_identity_benefit_claims_key_version_check" CHECK ("lifetime_identity_benefit_claims"."digest_key_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "lifetime_identity_benefit_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recent_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"method" text NOT NULL,
	"purpose" text NOT NULL,
	"target_digest" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_auth_challenges_method_check" CHECK ("recent_auth_challenges"."method" IN ('password', 'phone_otp', 'apple')),
	CONSTRAINT "recent_auth_challenges_purpose_check" CHECK ("recent_auth_challenges"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding')),
	CONSTRAINT "recent_auth_challenges_status_check" CHECK ("recent_auth_challenges"."status" IN ('pending', 'verified', 'consumed', 'expired')),
	CONSTRAINT "recent_auth_challenges_expiry_check" CHECK ("recent_auth_challenges"."expires_at" > "recent_auth_challenges"."created_at"),
	CONSTRAINT "recent_auth_challenges_verified_check" CHECK ("recent_auth_challenges"."verified_at" IS NULL OR "recent_auth_challenges"."verified_at" >= "recent_auth_challenges"."created_at"),
	CONSTRAINT "recent_auth_challenges_consumed_check" CHECK ("recent_auth_challenges"."consumed_at" IS NULL OR "recent_auth_challenges"."consumed_at" >= "recent_auth_challenges"."created_at")
);
--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recent_auth_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"method" text NOT NULL,
	"purpose" text NOT NULL,
	"target_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_auth_grants_method_check" CHECK ("recent_auth_grants"."method" IN ('password', 'phone_otp', 'apple')),
	CONSTRAINT "recent_auth_grants_purpose_check" CHECK ("recent_auth_grants"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding')),
	CONSTRAINT "recent_auth_grants_expiry_check" CHECK ("recent_auth_grants"."expires_at" > "recent_auth_grants"."created_at"),
	CONSTRAINT "recent_auth_grants_consumed_check" CHECK ("recent_auth_grants"."consumed_at" IS NULL OR "recent_auth_grants"."consumed_at" >= "recent_auth_grants"."created_at")
);
--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_content_credential_revocations" ADD CONSTRAINT "account_content_credential_revocations_deletion_job_id_account_deletion_jobs_id_fk" FOREIGN KEY ("deletion_job_id") REFERENCES "public"."account_deletion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_auth_users" ADD CONSTRAINT "account_deletion_auth_users_job_id_account_deletion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."account_deletion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_tombstones" ADD CONSTRAINT "account_deletion_tombstones_job_id_account_deletion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."account_deletion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD CONSTRAINT "recent_auth_grants_challenge_id_recent_auth_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."recent_auth_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_content_credential_revocations_job" ON "account_content_credential_revocations" USING btree ("deletion_job_id");--> statement-breakpoint
CREATE INDEX "account_deletion_auth_users_retry" ON "account_deletion_auth_users" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_jobs_account" ON "account_deletion_jobs" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_jobs_idempotency" ON "account_deletion_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "account_deletion_jobs_retry" ON "account_deletion_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_tombstones_job" ON "account_deletion_tombstones" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "account_deletion_tombstones_retention" ON "account_deletion_tombstones" USING btree ("legal_retention_until");--> statement-breakpoint
CREATE INDEX "account_security_events_account_created" ON "account_security_events" USING btree ("account_digest","created_at");--> statement-breakpoint
CREATE INDEX "account_security_events_retention" ON "account_security_events" USING btree ("retention_at");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_revocable_credentials_auth_user" ON "apple_revocable_credentials" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_revocable_credentials_subject" ON "apple_revocable_credentials" USING btree ("subject_digest");--> statement-breakpoint
CREATE INDEX "apple_revocable_credentials_account_status" ON "apple_revocable_credentials" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "apple_revocable_credentials_retry" ON "apple_revocable_credentials" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "lifetime_identity_benefit_claims_claimed" ON "lifetime_identity_benefit_claims" USING btree ("benefit_key","claimed_at");--> statement-breakpoint
CREATE INDEX "recent_auth_challenges_account_session" ON "recent_auth_challenges" USING btree ("account_id","session_id","purpose","status");--> statement-breakpoint
CREATE INDEX "recent_auth_challenges_expiry" ON "recent_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recent_auth_grants_challenge" ON "recent_auth_grants" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "recent_auth_grants_account_session" ON "recent_auth_grants" USING btree ("account_id","session_id","purpose");--> statement-breakpoint
CREATE INDEX "recent_auth_grants_expiry" ON "recent_auth_grants" USING btree ("expires_at");--> statement-breakpoint
REVOKE ALL ON TABLE "account_content_credential_revocations" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "account_deletion_auth_users" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "account_deletion_jobs" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "account_deletion_tombstones" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "account_security_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "apple_revocable_credentials" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "lifetime_identity_benefit_claims" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "recent_auth_challenges" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "recent_auth_grants" FROM anon, authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_recent_auth_grant_matches_challenge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.recent_auth_challenges challenge
    WHERE challenge.id = NEW.challenge_id
      AND challenge.account_id = NEW.account_id
      AND challenge.auth_user_id = NEW.auth_user_id
      AND challenge.session_id = NEW.session_id
      AND challenge.method = NEW.method
      AND challenge.purpose = NEW.purpose
      AND challenge.target_digest = NEW.target_digest
  ) THEN
    RAISE EXCEPTION 'recent_auth_grant_challenge_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER recent_auth_grant_matches_challenge
AFTER INSERT OR UPDATE ON public.recent_auth_grants
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_recent_auth_grant_matches_challenge();--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_recent_auth_challenge_binding_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD.account_id,
    OLD.auth_user_id,
    OLD.session_id,
    OLD.method,
    OLD.purpose,
    OLD.target_digest
  ) IS DISTINCT FROM (
    NEW.account_id,
    NEW.auth_user_id,
    NEW.session_id,
    NEW.method,
    NEW.purpose,
    NEW.target_digest
  ) AND EXISTS (
    SELECT 1 FROM public.recent_auth_grants grant_row
    WHERE grant_row.challenge_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'recent_auth_challenge_binding_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER recent_auth_challenge_binding_immutable
BEFORE UPDATE ON public.recent_auth_challenges
FOR EACH ROW EXECUTE FUNCTION prevent_recent_auth_challenge_binding_change();
