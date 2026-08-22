CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_account_id" uuid,
	"sessions_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_status_check" CHECK ("status" IN ('active', 'merging', 'merged', 'deleted')),
	CONSTRAINT "accounts_merge_target_check" CHECK (
		("status" = 'merged' AND "merged_into_account_id" IS NOT NULL)
		OR ("status" <> 'merged' AND "merged_into_account_id" IS NULL)
	)
);
--> statement-breakpoint
CREATE TABLE "account_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_identities_provider_check" CHECK ("provider" IN ('phone', 'apple', 'wechat')),
	CONSTRAINT "account_identities_subject_hash_check" CHECK (char_length("subject_hash") = 64),
	CONSTRAINT "account_identities_auth_user_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "account_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_account_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"initiated_by_auth_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_merges_distinct_accounts_check" CHECK ("source_account_id" <> "target_account_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_identities_provider_subject" ON "account_identities" USING btree ("provider", "subject_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_identities_auth_provider" ON "account_identities" USING btree ("auth_user_id", "provider");
--> statement-breakpoint
CREATE INDEX "account_identities_account" ON "account_identities" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "account_identities_auth_user" ON "account_identities" USING btree ("auth_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_merges_source" ON "account_merges" USING btree ("source_account_id");
--> statement-breakpoint
CREATE INDEX "account_merges_target" ON "account_merges" USING btree ("target_account_id");
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account_identities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account_merges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "accounts", "account_identities", "account_merges" FROM anon, authenticated;
--> statement-breakpoint
INSERT INTO "accounts" ("id")
SELECT DISTINCT "user_id"
FROM (
	SELECT "user_id" FROM "profiles"
	UNION ALL SELECT "user_id" FROM "learning_records"
	UNION ALL SELECT "user_id" FROM "sync_mutations"
	UNION ALL SELECT "user_id" FROM "user_card_states"
	UNION ALL SELECT "user_id" FROM "sync_changes"
	UNION ALL SELECT "user_id" FROM "user_documents"
	UNION ALL SELECT "user_id" FROM "ai_consents"
	UNION ALL SELECT "user_id" FROM "ai_quota_buckets"
	UNION ALL SELECT "user_id" FROM "ai_usage_logs"
	UNION ALL SELECT "user_id" FROM "ai_word_cache"
	UNION ALL SELECT "user_id" FROM "feedback_tickets"
) AS "existing_business_users"
WHERE "user_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_records" DROP CONSTRAINT IF EXISTS "learning_records_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_mutations" DROP CONSTRAINT IF EXISTS "sync_mutations_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_card_states" DROP CONSTRAINT IF EXISTS "user_card_states_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_changes" DROP CONSTRAINT IF EXISTS "sync_changes_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_documents" DROP CONSTRAINT IF EXISTS "user_documents_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_consents" DROP CONSTRAINT IF EXISTS "ai_consents_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_quota_buckets" DROP CONSTRAINT IF EXISTS "ai_quota_buckets_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT IF EXISTS "ai_usage_logs_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_word_cache" DROP CONSTRAINT IF EXISTS "ai_word_cache_user_id_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "feedback_tickets" DROP CONSTRAINT IF EXISTS "feedback_tickets_user_id_auth_users_id_fk";
--> statement-breakpoint
CREATE FUNCTION "enforce_writable_business_account"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	account_status text;
BEGIN
	SELECT "status" INTO account_status
	FROM "accounts"
	WHERE "id" = NEW."user_id"
	FOR SHARE;

	IF account_status IS NULL OR account_status NOT IN ('active', 'merging') THEN
		RAISE EXCEPTION 'account_not_writable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "enforce_writable_identity_account"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	account_status text;
BEGIN
	SELECT "status" INTO account_status
	FROM "accounts"
	WHERE "id" = NEW."account_id"
	FOR SHARE;

	IF account_status IS NULL OR account_status NOT IN ('active', 'merging') THEN
		RAISE EXCEPTION 'account_not_writable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "profiles_writable_account" BEFORE INSERT OR UPDATE ON "profiles" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "learning_records_writable_account" BEFORE INSERT OR UPDATE ON "learning_records" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "sync_mutations_writable_account" BEFORE INSERT OR UPDATE ON "sync_mutations" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "user_card_states_writable_account" BEFORE INSERT OR UPDATE ON "user_card_states" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "sync_changes_writable_account" BEFORE INSERT OR UPDATE ON "sync_changes" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "user_documents_writable_account" BEFORE INSERT OR UPDATE ON "user_documents" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "ai_consents_writable_account" BEFORE INSERT OR UPDATE ON "ai_consents" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "ai_quota_buckets_writable_account" BEFORE INSERT OR UPDATE ON "ai_quota_buckets" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "ai_usage_logs_writable_account" BEFORE INSERT OR UPDATE ON "ai_usage_logs" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "ai_word_cache_writable_account" BEFORE INSERT OR UPDATE ON "ai_word_cache" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "feedback_tickets_writable_account" BEFORE INSERT OR UPDATE ON "feedback_tickets" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_business_account"();
--> statement-breakpoint
CREATE TRIGGER "account_identities_writable_account" BEFORE INSERT OR UPDATE ON "account_identities" FOR EACH ROW EXECUTE FUNCTION "enforce_writable_identity_account"();
