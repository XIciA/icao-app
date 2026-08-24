ALTER TABLE "apple_notification_events" DROP CONSTRAINT "apple_notification_events_status_check";--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "lease_owner" uuid;--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD COLUMN "retention_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION "commerce_strip_apple_notification_jws"(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  item record;
  result jsonb;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR item IN SELECT key, val FROM jsonb_each(value) AS entry(key, val) LOOP
      IF item.key NOT IN ('signedTransactionInfo', 'signedRenewalInfo', 'signedAppTransactionInfo') THEN
        result := result || jsonb_build_object(item.key, commerce_strip_apple_notification_jws(item.val));
      END IF;
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(commerce_strip_apple_notification_jws(element)), '[]'::jsonb)
    INTO result
    FROM jsonb_array_elements(value) AS items(element);
    RETURN result;
  END IF;
  RETURN value;
END;
$$;--> statement-breakpoint
UPDATE "apple_notification_events"
SET "decoded_payload" = "commerce_strip_apple_notification_jws"("decoded_payload");--> statement-breakpoint
DROP FUNCTION "commerce_strip_apple_notification_jws"(jsonb);--> statement-breakpoint
UPDATE "apple_notification_events"
SET "signed_payload" = NULL
WHERE "status" = 'processed';--> statement-breakpoint
UPDATE "apple_notification_events"
SET "next_attempt_at" = COALESCE("processed_at", "received_at"),
  "retention_at" = "received_at" + interval '7 days'
WHERE "status" = 'failed' AND "signed_payload" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "apple_notification_events_retry" ON "apple_notification_events" USING btree ("environment","status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD CONSTRAINT "apple_notification_events_attempt_count_check" CHECK ("apple_notification_events"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD CONSTRAINT "apple_notification_events_lease_check" CHECK ((
    ("apple_notification_events"."locked_at" IS NULL AND "apple_notification_events"."lease_owner" IS NULL AND "apple_notification_events"."lease_until" IS NULL)
    OR ("apple_notification_events"."locked_at" IS NOT NULL AND "apple_notification_events"."lease_owner" IS NOT NULL AND "apple_notification_events"."lease_until" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "apple_notification_events" ADD CONSTRAINT "apple_notification_events_status_check" CHECK ("apple_notification_events"."status" IN ('received', 'processed', 'failed', 'expired'));
