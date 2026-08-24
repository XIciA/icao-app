ALTER TABLE "ai_point_reservations" ADD COLUMN "request_digest" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_point_reservations" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_point_reservations" ADD COLUMN "result_payload" jsonb;--> statement-breakpoint
ALTER TABLE "ai_point_reservations" ADD COLUMN "failure_code" text;--> statement-breakpoint
UPDATE "ai_point_reservations"
SET "lease_until" = now() - interval '1 second'
WHERE "status" = 'reserved' AND "lease_until" IS NULL;
