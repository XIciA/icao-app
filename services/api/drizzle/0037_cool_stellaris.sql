ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_status_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "dispatch_sequence" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "dispatch_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "provider_completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "phone_otp_intents_dispatch" ON "phone_otp_intents" USING btree ("phone_digest","status","dispatch_sequence");--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_dispatch_lease_check" CHECK ((
    ("phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined') AND "phone_otp_intents"."dispatch_lease_until" IS NOT NULL)
    OR ("phone_otp_intents"."status" NOT IN ('queued', 'dispatching', 'quarantined') AND "phone_otp_intents"."dispatch_lease_until" IS NULL)
  ));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_status_check" CHECK ("phone_otp_intents"."status" IN ('queued', 'dispatching', 'quarantined', 'pending', 'consumed', 'superseded', 'failed'));
