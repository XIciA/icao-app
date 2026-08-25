ALTER TABLE "accounts" ADD COLUMN "learning_data_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ai_result_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_learning_data_generation_check" CHECK ("accounts"."learning_data_generation" >= 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ai_result_generation_check" CHECK ("accounts"."ai_result_generation" >= 0);