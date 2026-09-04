ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_status_check";--> statement-breakpoint
DROP INDEX "phone_otp_intents_active_phone";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "verification_token" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_otp_intents_active_phone" ON "phone_otp_intents" USING btree ("phone_digest") WHERE "phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'pending', 'verifying');--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_verification_fence_check" CHECK ((
    ("phone_otp_intents"."status" = 'verifying' AND "phone_otp_intents"."verification_token" IS NOT NULL)
    OR ("phone_otp_intents"."status" <> 'verifying' AND "phone_otp_intents"."verification_token" IS NULL)
  ));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_status_check" CHECK ("phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'pending', 'verifying', 'consumed', 'superseded', 'failed'));