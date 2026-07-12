CREATE TABLE "ai_consents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"policy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_quota_buckets" (
	"user_id" uuid NOT NULL,
	"bucket_date" text NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_quota_buckets_user_id_bucket_date_pk" PRIMARY KEY("user_id","bucket_date")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"capability" text NOT NULL,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"quota_units" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_microunits" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_word_cache" (
	"user_id" uuid NOT NULL,
	"query_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_word_cache_user_id_query_hash_pk" PRIMARY KEY("user_id","query_hash")
);
--> statement-breakpoint
CREATE INDEX "ai_usage_user_created" ON "ai_usage_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_request_capability" ON "ai_usage_logs" USING btree ("request_id","capability");--> statement-breakpoint
CREATE INDEX "ai_word_cache_expiry" ON "ai_word_cache" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_quota_buckets" ADD CONSTRAINT "ai_quota_buckets_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_word_cache" ADD CONSTRAINT "ai_word_cache_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_consents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_quota_buckets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_word_cache" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "ai_consents", "ai_quota_buckets", "ai_usage_logs", "ai_word_cache" FROM anon, authenticated;
