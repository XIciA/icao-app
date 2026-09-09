CREATE TABLE "ai_allowance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_allowance_accounts_environment" CHECK ("ai_allowance_accounts"."environment" IN ('sandbox', 'production'))
);
--> statement-breakpoint
ALTER TABLE "ai_allowance_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_allowance" integer NOT NULL,
	"trial_allowance" integer NOT NULL,
	"costs" jsonb NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"previous_version_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"request_digest" text NOT NULL,
	CONSTRAINT "ai_usage_rules_weekly_range" CHECK ("ai_usage_rule_versions"."weekly_allowance" BETWEEN 1 AND 1000000),
	CONSTRAINT "ai_usage_rules_trial_range" CHECK ("ai_usage_rule_versions"."trial_allowance" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
ALTER TABLE "ai_usage_rule_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_point_batches" DROP CONSTRAINT "ai_point_batches_source_check";--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "ai_usage_rule_version_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage_rule_versions" ADD CONSTRAINT "ai_usage_rule_versions_actor_id_ops_staff_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_allowance_accounts_owner" ON "ai_allowance_accounts" USING btree ("environment","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_rules_idempotency" ON "ai_usage_rule_versions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_usage_rules_effective" ON "ai_usage_rule_versions" USING btree ("effective_at","created_at");--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_ai_usage_rule_version_id_ai_usage_rule_versions_id_fk" FOREIGN KEY ("ai_usage_rule_version_id") REFERENCES "public"."ai_usage_rule_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD CONSTRAINT "ai_point_batches_source_check" CHECK ("ai_point_batches"."source_type" IN ('trial', 'membership', 'weekly_membership', 'compensation'));
--> statement-breakpoint
INSERT INTO "ai_usage_rule_versions" (
  "id", "weekly_allowance", "trial_allowance", "costs", "effective_at", "created_at",
  "idempotency_key", "request_digest"
) VALUES (
  '00000000-0000-4000-8000-000000000500', 500, 100,
  '{"transcription":5,"grammar_correction":3,"opi_refinement":5,"transcription_grammar":8,"transcription_opi":10}',
  to_timestamp(0), now(), '00000000-0000-4000-8000-000000000500', 'initial-weekly-allowance-v1'
);
--> statement-breakpoint
UPDATE "commerce_products" SET "active" = ("duration_days" IN (7,31,93)),
  "base_price_cny_fen" = CASE "duration_days" WHEN 31 THEN 15800 WHEN 93 THEN 35800 ELSE "base_price_cny_fen" END,
  "updated_at" = now();
--> statement-breakpoint
UPDATE "commerce_channel_products" SET "active" = ("product_key" IN ('membership_7d_v1','membership_31d_v1','membership_93d_v1')),
  "updated_at" = now();
--> statement-breakpoint
CREATE FUNCTION "ai_usage_rule_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_usage_rule_versions_are_append_only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ai_usage_rule_version_immutable" BEFORE UPDATE OR DELETE ON "ai_usage_rule_versions"
FOR EACH ROW EXECUTE FUNCTION "ai_usage_rule_version_immutable"();
--> statement-breakpoint
REVOKE ALL ON "ai_allowance_accounts", "ai_usage_rule_versions" FROM anon, authenticated;
