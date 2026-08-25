CREATE TABLE "content_environment_session_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"session_digest" text NOT NULL,
	"verified_transaction_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"retention_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_environment_session_grants_environment_check" CHECK ("content_environment_session_grants"."environment" = 'sandbox'),
	CONSTRAINT "content_environment_session_grants_expiry_check" CHECK ("content_environment_session_grants"."expires_at" > "content_environment_session_grants"."created_at"),
	CONSTRAINT "content_environment_session_grants_retention_check" CHECK ("content_environment_session_grants"."retention_at" >= "content_environment_session_grants"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "content_environment_session_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "content_environment_session_grants_identity" ON "content_environment_session_grants" USING btree ("environment","session_digest");--> statement-breakpoint
CREATE INDEX "content_environment_session_grants_account_expiry" ON "content_environment_session_grants" USING btree ("account_id","environment","expires_at");--> statement-breakpoint
CREATE INDEX "content_environment_session_grants_retention" ON "content_environment_session_grants" USING btree ("retention_at");--> statement-breakpoint
REVOKE ALL ON TABLE "content_environment_session_grants" FROM anon, authenticated;
