ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_purpose_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" DROP CONSTRAINT "phone_otp_intents_account_check";--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" DROP CONSTRAINT "recent_auth_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "recent_auth_grants" DROP CONSTRAINT "recent_auth_grants_purpose_check";--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" DROP CONSTRAINT "sms_delivery_attempts_status_check";--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" DROP CONSTRAINT "sms_delivery_attempts_state_time_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_binding_check";--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ALTER COLUMN "status" SET DEFAULT 'processing_v2';--> statement-breakpoint
-- This deployment is deliberately roll-forward-only. Namespace every
-- surviving delivery state before installing the v2-only check constraint.
-- An old hook binary can still read these rows, but every legacy status write
-- is rejected before it can reach provider submission or reopen a generation.
UPDATE "sms_delivery_attempts"
SET "status" = CASE "status"
  WHEN 'processing' THEN 'processing_v2'
  WHEN 'retryable' THEN 'retryable_v2'
  WHEN 'rejected' THEN 'rejected_v2'
  WHEN 'completed' THEN 'completed_v2'
  ELSE "status"
END
WHERE "status" IN ('processing', 'retryable', 'rejected', 'completed');--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_purpose_check" CHECK ("phone_otp_intents"."purpose" IN ('login', 'account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all'));--> statement-breakpoint
ALTER TABLE "phone_otp_intents" ADD CONSTRAINT "phone_otp_intents_account_check" CHECK ((
    ("phone_otp_intents"."purpose" IN ('login', 'password_recovery') AND "phone_otp_intents"."account_id" IS NULL)
    OR ("phone_otp_intents"."purpose" IN ('account_delete', 'phone_binding', 'session_revoke_all') AND "phone_otp_intents"."account_id" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "recent_auth_challenges" ADD CONSTRAINT "recent_auth_challenges_purpose_check" CHECK ("recent_auth_challenges"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all'));--> statement-breakpoint
ALTER TABLE "recent_auth_grants" ADD CONSTRAINT "recent_auth_grants_purpose_check" CHECK ("recent_auth_grants"."purpose" IN ('account_delete', 'password_recovery', 'phone_binding', 'session_revoke_all'));--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_status_check" CHECK ("sms_delivery_attempts"."status" IN ('processing_v2', 'retryable_v2', 'rejected_v2', 'completed_v2'));--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_state_time_check" CHECK ((
    ("sms_delivery_attempts"."status" = 'completed_v2' AND "sms_delivery_attempts"."completed_at" IS NOT NULL)
    OR ("sms_delivery_attempts"."status" <> 'completed_v2' AND "sms_delivery_attempts"."completed_at" IS NULL)
  ));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_purpose_check" CHECK ("wechat_auth_challenges"."purpose" IN ('login', 'binding', 'account_delete', 'session_revoke_all'));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_binding_check" CHECK ((
    ("wechat_auth_challenges"."purpose" = 'login' AND "wechat_auth_challenges"."account_id" IS NULL AND "wechat_auth_challenges"."auth_user_id" IS NULL)
    OR ("wechat_auth_challenges"."purpose" IN ('binding', 'account_delete', 'session_revoke_all') AND "wechat_auth_challenges"."account_id" IS NOT NULL AND "wechat_auth_challenges"."auth_user_id" IS NOT NULL)
  ));
