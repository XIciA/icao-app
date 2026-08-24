ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_otp_time_check";--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD COLUMN "reservation_token" uuid;--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD COLUMN "reservation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_otp_time_check" CHECK ("phone_otp_intents"."otp_not_before" >= date_trunc('second', "phone_otp_intents"."created_at"));--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD CONSTRAINT "recent_auth_grants_reservation_check" CHECK ((
    ("recent_auth_grants"."reservation_token" IS NULL AND "recent_auth_grants"."reservation_expires_at" IS NULL)
    OR ("recent_auth_grants"."reservation_token" IS NOT NULL AND "recent_auth_grants"."reservation_expires_at" IS NOT NULL)
  ));