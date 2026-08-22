CREATE TABLE "invite_accounts" (
	"code_lookup" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invite_accounts_status_check" CHECK ("status" IN ('active', 'disabled', 'deleted')),
	CONSTRAINT "invite_accounts_display_name_check" CHECK (char_length("display_name") = 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invite_accounts_user" ON "invite_accounts" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "invite_accounts"
	ADD CONSTRAINT "invite_accounts_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE "invite_login_attempts" (
	"source_hash" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invite_login_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "invite_accounts", "invite_login_attempts" FROM anon, authenticated;
