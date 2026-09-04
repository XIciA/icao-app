ALTER TABLE "phone_otp_intents" ADD COLUMN "otp_token_digest" text;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "otp_intent_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "otp_dispatch_sequence" bigint;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "provider_out_id" text;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "provider_biz_id" text;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD COLUMN "submission_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_otp_intent_id_phone_otp_intents_id_fk" FOREIGN KEY ("otp_intent_id") REFERENCES "public"."phone_otp_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
WITH "ranked_active_phone_otp_intents" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "phone_digest"
      ORDER BY "dispatch_sequence" DESC, "created_at" DESC, "id" DESC
    ) AS "active_rank"
  FROM "phone_otp_intents"
  WHERE "status" IN ('queued', 'dispatching', 'quarantined', 'pending')
)
UPDATE "phone_otp_intents" AS "intent"
SET
  "status" = 'superseded',
  "dispatch_lease_until" = NULL,
  "consumed_at" = GREATEST(COALESCE("intent"."consumed_at", now()), "intent"."created_at")
FROM "ranked_active_phone_otp_intents" AS "ranked"
WHERE "intent"."id" = "ranked"."id" AND "ranked"."active_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_otp_intents_active_phone" ON "phone_otp_intents" USING btree ("phone_digest") WHERE "phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'pending');--> statement-breakpoint
CREATE INDEX "sms_delivery_attempts_otp_intent" ON "sms_delivery_attempts" USING btree ("otp_intent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_delivery_attempts_one_per_otp_intent" ON "sms_delivery_attempts" USING btree ("otp_intent_id") WHERE "sms_delivery_attempts"."otp_intent_id" IS NOT NULL;
