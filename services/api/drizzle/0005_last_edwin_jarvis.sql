CREATE TABLE "account_session_revocations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DELETE FROM "ai_usage_logs" WHERE "user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "account_session_revocations_user" ON "account_session_revocations" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "account_session_revocations"
	ADD CONSTRAINT "account_session_revocations_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "account_session_revocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "account_session_revocations" FROM anon, authenticated;
