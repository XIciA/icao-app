CREATE TABLE "account_deletion_status_rate_limits" (
	"scope_digest" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_status_rate_limits_count_check" CHECK ("account_deletion_status_rate_limits"."count" >= 0),
	CONSTRAINT "account_deletion_status_rate_limits_expiry_check" CHECK ("account_deletion_status_rate_limits"."expires_at" > "account_deletion_status_rate_limits"."window_started_at")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_status_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apple_credential_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"subject_digest" text NOT NULL,
	"digest_key_version" integer DEFAULT 1 NOT NULL,
	"encrypted_refresh_token" text,
	"encryption_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending_binding' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"revoked_at" timestamp with time zone,
	"retention_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_credential_intakes_status_check" CHECK ("apple_credential_intakes"."status" IN ('pending_binding', 'revoke_pending', 'retryable', 'revoked', 'manual_action_required')),
	CONSTRAINT "apple_credential_intakes_attempts_check" CHECK ("apple_credential_intakes"."attempt_count" >= 0),
	CONSTRAINT "apple_credential_intakes_versions_check" CHECK ("apple_credential_intakes"."digest_key_version" > 0 AND "apple_credential_intakes"."encryption_version" > 0),
	CONSTRAINT "apple_credential_intakes_retention_check" CHECK ("apple_credential_intakes"."retention_at" > "apple_credential_intakes"."created_at")
);
--> statement-breakpoint
ALTER TABLE "apple_credential_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_content_credential_revocations" DROP CONSTRAINT "account_content_credential_revocations_deletion_job_id_account_deletion_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "account_content_credential_revocations" ALTER COLUMN "deletion_job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_deletion_jobs" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
CREATE INDEX "account_deletion_status_rate_limits_expiry" ON "account_deletion_status_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "apple_credential_intakes_account_status" ON "apple_credential_intakes" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "apple_credential_intakes_retry" ON "apple_credential_intakes" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "apple_credential_intakes_retention" ON "apple_credential_intakes" USING btree ("retention_at");--> statement-breakpoint
ALTER TABLE "account_content_credential_revocations" ADD CONSTRAINT "account_content_credential_revocations_deletion_job_id_account_deletion_jobs_id_fk" FOREIGN KEY ("deletion_job_id") REFERENCES "public"."account_deletion_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON TABLE "account_deletion_status_rate_limits" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "apple_credential_intakes" FROM anon, authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_active_account_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_uuid uuid;
BEGIN
  account_uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF account_uuid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.accounts account
    WHERE account.id = account_uuid AND account.status = 'active'
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER profiles_active_account_write
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER feedback_tickets_active_account_write
BEFORE INSERT OR UPDATE ON public.feedback_tickets
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER user_card_states_active_account_write
BEFORE INSERT OR UPDATE ON public.user_card_states
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER learning_records_active_account_write
BEFORE INSERT OR UPDATE ON public.learning_records
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER sync_mutations_active_account_write
BEFORE INSERT OR UPDATE ON public.sync_mutations
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER user_documents_active_account_write
BEFORE INSERT OR UPDATE ON public.user_documents
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER sync_changes_active_account_write
BEFORE INSERT OR UPDATE ON public.sync_changes
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER ai_consents_active_account_write
BEFORE INSERT OR UPDATE ON public.ai_consents
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER ai_usage_logs_active_account_write
BEFORE INSERT OR UPDATE ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER ai_quota_buckets_active_account_write
BEFORE INSERT OR UPDATE ON public.ai_quota_buckets
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER ai_word_cache_active_account_write
BEFORE INSERT OR UPDATE ON public.ai_word_cache
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('user_id');--> statement-breakpoint
CREATE TRIGGER account_identities_active_account_write
BEFORE INSERT OR UPDATE ON public.account_identities
FOR EACH ROW EXECUTE FUNCTION enforce_active_account_write('account_id');--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_active_apple_credential_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.accounts account
    WHERE account.id = NEW.account_id AND account.status = 'active'
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER apple_revocable_credentials_active_account_write
BEFORE INSERT OR UPDATE ON public.apple_revocable_credentials
FOR EACH ROW EXECUTE FUNCTION enforce_active_apple_credential_write();--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_active_feedback_attachment_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.feedback_tickets ticket
    JOIN public.accounts account ON account.id = ticket.user_id
    WHERE ticket.id = NEW.ticket_id AND account.status = 'active'
    FOR KEY SHARE OF account
  ) THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER feedback_attachments_active_account_write
BEFORE INSERT OR UPDATE ON public.feedback_attachments
FOR EACH ROW EXECUTE FUNCTION enforce_active_feedback_attachment_write();
