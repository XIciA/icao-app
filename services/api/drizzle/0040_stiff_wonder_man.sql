ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_status_check";--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" DROP CONSTRAINT "sms_delivery_attempts_status_check";--> statement-breakpoint
DROP INDEX "phone_otp_intents_active_phone";--> statement-breakpoint
DROP INDEX "sms_delivery_attempts_one_per_otp_intent";--> statement-breakpoint
-- Delivery attempts are short-lived idempotency fences. Pre-v2 rows have no
-- exact OTP intent binding and therefore cannot safely survive the protocol
-- cutover. Terminalize every pre-v2 active challenge in the same migration so
-- neither a late hook nor a rolled-back API image can consume it.
DELETE FROM "sms_delivery_attempts";--> statement-breakpoint
UPDATE "phone_otp_intents"
SET
  "status" = 'failed',
  "dispatch_lease_until" = NULL,
  "verification_token" = NULL,
  "consumed_at" = GREATEST(COALESCE("consumed_at", now()), "created_at")
WHERE "status" IN ('queued', 'dispatching', 'quarantined', 'pending', 'verifying');--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ALTER COLUMN "otp_intent_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ALTER COLUMN "otp_dispatch_sequence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "provider_rejected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "verified_auth_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_otp_intents_active_phone" ON "phone_otp_intents" USING btree ("phone_digest") WHERE "phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'ready', 'verifying');--> statement-breakpoint
CREATE UNIQUE INDEX "sms_delivery_attempts_one_per_otp_intent" ON "sms_delivery_attempts" USING btree ("otp_intent_id");--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_verified_user_check" CHECK ((
    "phone_otp_intents"."verified_auth_user_id" IS NULL
    OR "phone_otp_intents"."status" IN ('consumed', 'redeemed')
  ));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_redeemed_purpose_check" CHECK ((
    "phone_otp_intents"."status" <> 'redeemed'
    OR "phone_otp_intents"."purpose" = 'password_recovery'
  ));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_provider_rejected_check" CHECK ((
    "phone_otp_intents"."provider_rejected" = false
    OR "phone_otp_intents"."purpose" = 'password_recovery'
  ));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_status_check" CHECK ("phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'ready', 'verifying', 'consumed', 'redeemed', 'superseded', 'failed'));--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_status_check" CHECK ("sms_delivery_attempts"."status" IN ('processing', 'retryable', 'rejected', 'completed'));
