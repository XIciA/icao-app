ALTER TABLE "apple_credential_intakes" ADD COLUMN "subject_digest_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apple_revocable_credentials" ADD COLUMN "revoke_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "apple_revocable_credentials" ADD COLUMN "revoke_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apple_credential_intakes" ADD CONSTRAINT "apple_credential_intakes_aliases_check" CHECK (jsonb_typeof("apple_credential_intakes"."subject_digest_aliases") = 'array');--> statement-breakpoint
ALTER TABLE "apple_revocable_credentials" ADD CONSTRAINT "apple_revocable_credentials_lease_check" CHECK ((
    ("apple_revocable_credentials"."revoke_lease_token" IS NULL AND "apple_revocable_credentials"."revoke_lease_until" IS NULL)
    OR ("apple_revocable_credentials"."revoke_lease_token" IS NOT NULL AND "apple_revocable_credentials"."revoke_lease_until" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_lease_time_check" CHECK ("sms_delivery_attempts"."lease_until" >= "sms_delivery_attempts"."created_at");--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_completed_time_check" CHECK ("sms_delivery_attempts"."completed_at" IS NULL OR "sms_delivery_attempts"."completed_at" >= "sms_delivery_attempts"."created_at");--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_state_time_check" CHECK ((
    ("sms_delivery_attempts"."status" = 'completed' AND "sms_delivery_attempts"."completed_at" IS NOT NULL)
    OR ("sms_delivery_attempts"."status" <> 'completed' AND "sms_delivery_attempts"."completed_at" IS NULL)
  ));