ALTER TABLE "accounts" DROP CONSTRAINT "accounts_status_check";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" IN ('active', 'merging', 'merged', 'deleting', 'deleted'));
