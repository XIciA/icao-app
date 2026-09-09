CREATE TABLE "wechat_payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"product_key" text NOT NULL,
	"description" text NOT NULL,
	"duration_days" integer NOT NULL,
	"amount_fen" integer NOT NULL,
	"ai_usage_rule_version_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"prepay_id" text,
	"transaction_id" text,
	"paid_at" timestamp with time zone,
	"refund_id" text,
	"refund_number" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wechat_payment_attempts_state_check" CHECK ("wechat_payment_attempts"."state" IN ('pending','paid','closed','refund_pending','refunded')),
	CONSTRAINT "wechat_payment_attempts_amount_check" CHECK ("wechat_payment_attempts"."amount_fen" > 0 AND "wechat_payment_attempts"."duration_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "wechat_payment_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wechat_payment_attempts" ADD CONSTRAINT "wechat_payment_attempts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wechat_payment_attempts" ADD CONSTRAINT "wechat_payment_attempts_ai_usage_rule_version_id_ai_usage_rule_versions_id_fk" FOREIGN KEY ("ai_usage_rule_version_id") REFERENCES "public"."ai_usage_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_payment_attempts_idempotency" ON "wechat_payment_attempts" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_payment_attempts_transaction" ON "wechat_payment_attempts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "wechat_payment_attempts_account_state" ON "wechat_payment_attempts" USING btree ("account_id","state");
--> statement-breakpoint
REVOKE ALL ON wechat_payment_attempts FROM anon, authenticated;
