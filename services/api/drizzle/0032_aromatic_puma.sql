CREATE TABLE "privacy_action_receipts" (
	"account_id" uuid NOT NULL,
	"action" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_action_receipts_account_id_action_idempotency_key_pk" PRIMARY KEY("account_id","action","idempotency_key"),
	CONSTRAINT "privacy_action_receipts_action_check" CHECK ("privacy_action_receipts"."action" IN ('delete_all_ai_results', 'clear_learning_data')),
	CONSTRAINT "privacy_action_receipts_request_hash_check" CHECK ("privacy_action_receipts"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "privacy_action_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "privacy_action_receipts" ADD CONSTRAINT "privacy_action_receipts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;