ALTER TABLE "ai_usage_logs" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "upstream_status" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;