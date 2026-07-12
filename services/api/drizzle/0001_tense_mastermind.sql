CREATE TABLE "sync_changes" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_changes_user_sequence" ON "sync_changes" USING btree ("user_id","sequence");
--> statement-breakpoint
ALTER TABLE "sync_changes"
	ADD CONSTRAINT "sync_changes_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "sync_changes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "sync_changes" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE "sync_changes_sequence_seq" FROM anon, authenticated;
