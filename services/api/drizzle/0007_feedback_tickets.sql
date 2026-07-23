CREATE TABLE "feedback_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"client_submission_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"contact" text,
	"status" text DEFAULT 'received' NOT NULL,
	"source" text NOT NULL,
	"source_route" text NOT NULL,
	"app_display_version" text NOT NULL,
	"platform" text NOT NULL,
	"browser_name" text,
	"browser_version" text,
	"os_name" text,
	"os_version" text,
	"error_code" text,
	"error_request_id" text,
	"bank_id" text,
	"bank_version" integer,
	"bank_checksum" text,
	"category_id" text,
	"topic_id" text,
	"card_id" text,
	"question_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_tickets_category_check" CHECK ("category" IN ('feature_suggestion', 'content_correction', 'other')),
	CONSTRAINT "feedback_tickets_status_check" CHECK ("status" IN ('received', 'in_progress', 'resolved', 'cannot_reproduce')),
	CONSTRAINT "feedback_tickets_source_check" CHECK ("source" IN ('profile', 'study')),
	CONSTRAINT "feedback_tickets_platform_check" CHECK ("platform" IN ('web', 'ios', 'android')),
	CONSTRAINT "feedback_tickets_description_check" CHECK (char_length(btrim("description")) BETWEEN 5 AND 500),
	CONSTRAINT "feedback_tickets_contact_check" CHECK ("contact" IS NULL OR char_length("contact") <= 100)
);
--> statement-breakpoint
CREATE TABLE "feedback_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_tickets"
	ADD CONSTRAINT "feedback_tickets_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "feedback_attachments"
	ADD CONSTRAINT "feedback_attachments_ticket_id_feedback_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "feedback_tickets"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_tickets_ticket_number" ON "feedback_tickets" USING btree ("ticket_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_tickets_user_submission" ON "feedback_tickets" USING btree ("user_id", "client_submission_id");
--> statement-breakpoint
CREATE INDEX "feedback_tickets_user_created" ON "feedback_tickets" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "feedback_tickets_status_created" ON "feedback_tickets" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "feedback_tickets_category_created" ON "feedback_tickets" USING btree ("category", "created_at");
--> statement-breakpoint
CREATE INDEX "feedback_tickets_app_version" ON "feedback_tickets" USING btree ("app_display_version");
--> statement-breakpoint
CREATE INDEX "feedback_tickets_question" ON "feedback_tickets" USING btree ("bank_id", "card_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_attachments_object_key" ON "feedback_attachments" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "feedback_attachments_ticket" ON "feedback_attachments" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX "feedback_attachments_expiry" ON "feedback_attachments" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "feedback_tickets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "feedback_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "feedback_tickets", "feedback_attachments" FROM anon, authenticated;
--> statement-breakpoint
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
	'feedback-screenshots',
	'feedback-screenshots',
	false,
	5242880,
	ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT ("id") DO UPDATE SET
	"public" = false,
	"file_size_limit" = EXCLUDED."file_size_limit",
	"allowed_mime_types" = EXCLUDED."allowed_mime_types";
