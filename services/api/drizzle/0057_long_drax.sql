ALTER TABLE "wechat_payment_attempts" ADD COLUMN "trade_type" text DEFAULT 'APP' NOT NULL;--> statement-breakpoint
ALTER TABLE "wechat_payment_attempts" ADD COLUMN "code_url" text;--> statement-breakpoint
ALTER TABLE "wechat_payment_attempts" ADD CONSTRAINT "wechat_payment_attempts_channel_check" CHECK ("wechat_payment_attempts"."trade_type" IN ('APP','NATIVE'));