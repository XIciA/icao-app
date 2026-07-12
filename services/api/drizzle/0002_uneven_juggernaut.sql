CREATE TABLE "user_documents" (
	"user_id" uuid NOT NULL,
	"document_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_documents_user_id_document_key_pk" PRIMARY KEY("user_id","document_key")
);
--> statement-breakpoint
ALTER TABLE "user_documents"
	ADD CONSTRAINT "user_documents_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "user_documents" FROM anon, authenticated;
