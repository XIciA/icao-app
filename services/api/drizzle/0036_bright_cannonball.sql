ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_status_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" DROP CONSTRAINT "wechat_auth_challenges_binding_check";--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD COLUMN "verification_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "wechat_auth_challenges" SET "status" = 'failed' WHERE "status" = 'verifying';--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_verification_lease_check" CHECK ((
    ("wechat_auth_challenges"."status" = 'verifying' AND "wechat_auth_challenges"."verification_expires_at" IS NOT NULL)
    OR ("wechat_auth_challenges"."status" <> 'verifying' AND "wechat_auth_challenges"."verification_expires_at" IS NULL)
  ));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_purpose_check" CHECK ("wechat_auth_challenges"."purpose" IN ('login', 'binding', 'account_delete'));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_status_check" CHECK ("wechat_auth_challenges"."status" IN ('pending', 'verifying', 'verified', 'consumed', 'failed', 'expired'));--> statement-breakpoint
ALTER TABLE "wechat_auth_challenges" ADD CONSTRAINT "wechat_auth_challenges_binding_check" CHECK ((
    ("wechat_auth_challenges"."purpose" = 'login' AND "wechat_auth_challenges"."account_id" IS NULL AND "wechat_auth_challenges"."auth_user_id" IS NULL)
    OR ("wechat_auth_challenges"."purpose" IN ('binding', 'account_delete') AND "wechat_auth_challenges"."account_id" IS NOT NULL AND "wechat_auth_challenges"."auth_user_id" IS NOT NULL)
  ));
