CREATE TABLE "learning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_record_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_bank_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_id" text NOT NULL,
	"version" integer NOT NULL,
	"checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_objects" (
	"object_key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"source_path" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"user_id" uuid NOT NULL,
	"mutation_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_mutations_user_id_mutation_id_pk" PRIMARY KEY("user_id","mutation_id")
);
--> statement-breakpoint
CREATE TABLE "user_card_states" (
	"user_id" uuid NOT NULL,
	"bank_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"card_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_card_states_user_id_bank_id_topic_id_card_id_pk" PRIMARY KEY("user_id","bank_id","topic_id","card_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_record_user_client" ON "learning_records" USING btree ("user_id","client_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_release_bank_version" ON "question_bank_releases" USING btree ("bank_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_release_checksum" ON "question_bank_releases" USING btree ("bank_id","checksum");
--> statement-breakpoint
ALTER TABLE "profiles"
	ADD CONSTRAINT "profiles_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "learning_records"
	ADD CONSTRAINT "learning_records_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "sync_mutations"
	ADD CONSTRAINT "sync_mutations_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_card_states"
	ADD CONSTRAINT "user_card_states_user_id_auth_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_release_one_active"
	ON "question_bank_releases" USING btree ("bank_id") WHERE "active" = true;
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "question_bank_releases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "resource_objects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_card_states" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "learning_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_mutations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "profiles", "question_bank_releases", "resource_objects", "user_card_states", "learning_records", "sync_mutations" FROM anon, authenticated;
