ALTER TABLE "ops_change_previews" DROP CONSTRAINT "ops_change_previews_change_type_check";--> statement-breakpoint
ALTER TABLE "ops_change_previews" ALTER COLUMN "target_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD COLUMN "allowance_consumed_baseline" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD COLUMN "allowance_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD CONSTRAINT "ai_point_batches_allowance_baseline_check" CHECK ("ai_point_batches"."allowance_consumed_baseline" >= 0 AND "ai_point_batches"."allowance_consumed_baseline" <= "ai_point_batches"."consumed_points");--> statement-breakpoint
ALTER TABLE "ops_change_previews" ADD CONSTRAINT "ops_change_previews_change_type_check" CHECK ("ops_change_previews"."change_type" IN ('grant_review_entitlement', 'reset_all_allowances'));