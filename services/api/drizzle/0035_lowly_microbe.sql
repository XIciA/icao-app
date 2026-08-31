CREATE TABLE "auth_usage_counters" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_usage_counters_count_check" CHECK ("auth_usage_counters"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wechat_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"auth_user_id" uuid,
	"purpose" text DEFAULT 'login' NOT NULL,
	"state_digest" text NOT NULL,
	"code_digest" text,
	"subject_digest" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wechat_auth_challenges_purpose_check" CHECK ("wechat_auth_challenges"."purpose" IN ('login', 'binding')),
	CONSTRAINT "wechat_auth_challenges_status_check" CHECK ("wechat_auth_challenges"."status" IN ('pending', 'verifying', 'consumed', 'failed', 'expired')),
	CONSTRAINT "wechat_auth_challenges_attempt_count_check" CHECK ("wechat_auth_challenges"."attempt_count" >= 0 AND "wechat_auth_challenges"."attempt_count" <= 10),
	CONSTRAINT "wechat_auth_challenges_expiry_check" CHECK ("wechat_auth_challenges"."expires_at" > "wechat_auth_challenges"."created_at"),
	CONSTRAINT "wechat_auth_challenges_binding_check" CHECK ((
    ("wechat_auth_challenges"."purpose" = 'login' AND "wechat_auth_challenges"."account_id" IS NULL AND "wechat_auth_challenges"."auth_user_id" IS NULL)
    OR ("wechat_auth_challenges"."purpose" = 'binding' AND "wechat_auth_challenges"."account_id" IS NOT NULL AND "wechat_auth_challenges"."auth_user_id" IS NOT NULL)
  )),
	CONSTRAINT "wechat_auth_challenges_consumed_check" CHECK ("wechat_auth_challenges"."consumed_at" IS NULL OR "wechat_auth_challenges"."consumed_at" >= "wechat_auth_challenges"."created_at")
);
--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wechat_auth_principals" (
	"subject_digest" text PRIMARY KEY NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wechat_auth_principals_subject_digest_check" CHECK ("wechat_auth_principals"."subject_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "wechat_auth_principals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lifetime_identity_benefit_claims" DROP CONSTRAINT "lifetime_identity_benefit_claims_provider_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_status_check";--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" DROP CONSTRAINT "recent_auth_challenges_method_check";--> statement-breakpoint
ALTER TABLE "recent_auth_grants" DROP CONSTRAINT "recent_auth_grants_method_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "auth_usage_counters_expiry" ON "auth_usage_counters" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_auth_challenges_state" ON "wechat_auth_challenges" USING btree ("state_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_auth_challenges_code" ON "wechat_auth_challenges" USING btree ("code_digest");--> statement-breakpoint
CREATE INDEX "wechat_auth_challenges_expiry" ON "wechat_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "wechat_auth_challenges_account" ON "wechat_auth_challenges" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_auth_principals_auth_user" ON "wechat_auth_principals" USING btree ("auth_user_id");--> statement-breakpoint
ALTER TABLE "lifetime_identity_benefit_claims" ADD CONSTRAINT "lifetime_identity_benefit_claims_provider_check" CHECK ("lifetime_identity_benefit_claims"."provider" IN ('phone', 'apple', 'wechat'));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_attempt_count_check" CHECK ("phone_otp_intents"."attempt_count" >= 0 AND "phone_otp_intents"."attempt_count" <= 10);--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_status_check" CHECK ("phone_otp_intents"."status" IN ('pending', 'consumed', 'superseded', 'failed'));--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" ADD CONSTRAINT "recent_auth_challenges_method_check" CHECK ("recent_auth_challenges"."method" IN ('password', 'phone_otp', 'apple', 'wechat'));--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD CONSTRAINT "recent_auth_grants_method_check" CHECK ("recent_auth_grants"."method" IN ('password', 'phone_otp', 'apple', 'wechat'));--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_usage_counters" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."wechat_auth_challenges" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."wechat_auth_principals" FROM anon, authenticated;
