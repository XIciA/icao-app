CREATE TABLE "product_click_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"event" text NOT NULL,
	"category" text NOT NULL,
	"context" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_click_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "audio_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "product_click_events" ADD CONSTRAINT "product_click_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_click_events_date" ON "product_click_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_click_events_account" ON "product_click_events" USING btree ("account_id");
--> statement-breakpoint
REVOKE ALL ON TABLE "product_click_events" FROM anon, authenticated;

--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" DROP CONSTRAINT "ops_entitlement_adjustments_values_check";
--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ADD CONSTRAINT "ops_entitlement_adjustments_values_check" CHECK ("membership_days" BETWEEN 0 AND 366 AND "ai_points" BETWEEN 0 AND 1000000 AND ("membership_days" > 0 OR "ai_points" > 0));
