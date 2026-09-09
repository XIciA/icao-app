CREATE TABLE "account_login_method_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "account_login_method_removals_provider_check" CHECK ("account_login_method_removals"."provider" IN ('phone', 'apple', 'wechat')),
	CONSTRAINT "account_login_method_removals_status_check" CHECK ("account_login_method_removals"."status" IN ('pending', 'completed')),
	CONSTRAINT "account_login_method_removals_completion_check" CHECK (("account_login_method_removals"."status" = 'pending' AND "account_login_method_removals"."completed_at" IS NULL) OR ("account_login_method_removals"."status" = 'completed' AND "account_login_method_removals"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_login_method_removals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_purpose_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_account_check";--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" DROP CONSTRAINT "recent_auth_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "recent_auth_grants" DROP CONSTRAINT "recent_auth_grants_purpose_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_binding_check";--> statement-breakpoint
ALTER TABLE "account_login_method_removals" ADD CONSTRAINT "account_login_method_removals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_login_method_removals_auth_user" ON "account_login_method_removals" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "account_login_method_removals_pending" ON "account_login_method_removals" USING btree ("status");--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_purpose_check" CHECK ("phone_otp_intents"."purpose" IN ('login', 'account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding'));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_account_check" CHECK ((
    ("phone_otp_intents"."purpose" IN ('login', 'password_recovery') AND "phone_otp_intents"."account_id" IS NULL)
    OR ("phone_otp_intents"."purpose" IN ('account_delete', 'phone_binding', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding') AND "phone_otp_intents"."account_id" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" ADD CONSTRAINT "recent_auth_challenges_purpose_check" CHECK ("recent_auth_challenges"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding'));--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD CONSTRAINT "recent_auth_grants_purpose_check" CHECK ("recent_auth_grants"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding'));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_purpose_check" CHECK ("wechat_auth_challenges"."purpose" IN ('login', 'binding', 'account_delete', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding', 'wechat_identity_binding'));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_binding_check" CHECK ((
    ("wechat_auth_challenges"."purpose" = 'login' AND "wechat_auth_challenges"."account_id" IS NULL AND "wechat_auth_challenges"."auth_user_id" IS NULL)
    OR ("wechat_auth_challenges"."purpose" IN ('binding', 'account_delete', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding', 'wechat_identity_binding') AND "wechat_auth_challenges"."account_id" IS NOT NULL AND "wechat_auth_challenges"."auth_user_id" IS NOT NULL)
  ));
--> statement-breakpoint
REVOKE ALL ON TABLE public.account_login_method_removals FROM anon, authenticated;
