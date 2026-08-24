CREATE TABLE "phone_otp_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_digest" text NOT NULL,
	"purpose" text NOT NULL,
	"account_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"otp_not_before" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_otp_intents_purpose_check" CHECK ("phone_otp_intents"."purpose" IN ('login', 'account_delete', 'password_recovery', 'phone_binding')),
	CONSTRAINT "phone_otp_intents_status_check" CHECK ("phone_otp_intents"."status" IN ('pending', 'consumed')),
	CONSTRAINT "phone_otp_intents_expiry_check" CHECK ("phone_otp_intents"."expires_at" > "phone_otp_intents"."created_at"),
	CONSTRAINT "phone_otp_intents_otp_time_check" CHECK ("phone_otp_intents"."otp_not_before" >= "phone_otp_intents"."created_at"),
	CONSTRAINT "phone_otp_intents_consumed_check" CHECK ("phone_otp_intents"."consumed_at" IS NULL OR "phone_otp_intents"."consumed_at" >= "phone_otp_intents"."created_at"),
	CONSTRAINT "phone_otp_intents_account_check" CHECK ((
    ("phone_otp_intents"."purpose" IN ('login', 'password_recovery') AND "phone_otp_intents"."account_id" IS NULL)
    OR ("phone_otp_intents"."purpose" IN ('account_delete', 'phone_binding') AND "phone_otp_intents"."account_id" IS NOT NULL)
  ))
);
--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sms_delivery_attempts" (
	"dedupe_key" text PRIMARY KEY NOT NULL,
	"phone_digest" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"lease_token" uuid NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_delivery_attempts_status_check" CHECK ("sms_delivery_attempts"."status" IN ('processing', 'retryable', 'completed')),
	CONSTRAINT "sms_delivery_attempts_attempts_check" CHECK ("sms_delivery_attempts"."attempt_count" > 0),
	CONSTRAINT "sms_delivery_attempts_expiry_check" CHECK ("sms_delivery_attempts"."expires_at" > "sms_delivery_attempts"."created_at")
);
--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sms_usage_counters" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_usage_counters_count_check" CHECK ("sms_usage_counters"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sms_usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "phone_otp_intents_lookup" ON "phone_otp_intents" USING btree ("phone_digest","purpose","account_id","status");--> statement-breakpoint
CREATE INDEX "phone_otp_intents_expiry" ON "phone_otp_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sms_delivery_attempts_expiry" ON "sms_delivery_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sms_delivery_attempts_lease" ON "sms_delivery_attempts" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "sms_usage_counters_expiry" ON "sms_usage_counters" USING btree ("expires_at");--> statement-breakpoint
REVOKE ALL ON TABLE "phone_otp_intents" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "sms_delivery_attempts" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "sms_usage_counters" FROM anon, authenticated;
