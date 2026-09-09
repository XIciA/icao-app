ALTER TABLE "ai_point_reservations" ADD COLUMN "ai_result_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_point_reservations" ADD COLUMN "result_deleted_at" timestamp with time zone;
--> statement-breakpoint
-- Conservatively scrub retained operation bodies for accounts that already reset AI data.
UPDATE ai_point_reservations r
SET result_payload = NULL, result_deleted_at = now()
FROM accounts a
WHERE r.account_id = a.id AND a.ai_result_generation > 0;
