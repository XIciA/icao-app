ALTER TABLE "content_work_orders" DROP CONSTRAINT "content_work_orders_status";--> statement-breakpoint
ALTER TABLE "content_work_orders" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "content_work_orders" ADD COLUMN "processing_note" text;--> statement-breakpoint
ALTER TABLE "content_work_orders" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "content_work_orders" ADD CONSTRAINT "content_work_orders_status" CHECK ("content_work_orders"."status" IN ('pending','processing','ready','published'));