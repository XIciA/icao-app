CREATE TABLE "ops_audit_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"actor_staff_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_audit_events_actor_role_check" CHECK ("ops_audit_events"."actor_role" IS NULL OR "ops_audit_events"."actor_role" IN ('admin', 'support')),
	CONSTRAINT "ops_audit_events_reason_check" CHECK (length(btrim("ops_audit_events"."reason")) BETWEEN 3 AND 500)
);
--> statement-breakpoint
ALTER TABLE "ops_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_change_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"target_account_id" uuid NOT NULL,
	"request_payload" jsonb NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"confirmation_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_change_previews_change_type_check" CHECK ("ops_change_previews"."change_type" IN ('grant_review_entitlement')),
	CONSTRAINT "ops_change_previews_expiry_check" CHECK ("ops_change_previews"."expires_at" > "ops_change_previews"."created_at")
);
--> statement-breakpoint
ALTER TABLE "ops_change_previews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_entitlement_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"reason" text NOT NULL,
	"membership_days" integer DEFAULT 0 NOT NULL,
	"ai_points" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_entitlement_adjustments_environment_check" CHECK ("ops_entitlement_adjustments"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "ops_entitlement_adjustments_reason_check" CHECK (length(btrim("ops_entitlement_adjustments"."reason")) BETWEEN 8 AND 500),
	CONSTRAINT "ops_entitlement_adjustments_values_check" CHECK ("ops_entitlement_adjustments"."membership_days" BETWEEN 0 AND 366 AND "ops_entitlement_adjustments"."ai_points" BETWEEN 0 AND 100000 AND ("ops_entitlement_adjustments"."membership_days" > 0 OR "ops_entitlement_adjustments"."ai_points" > 0))
);
--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_staff_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_ciphertext" text NOT NULL,
	"totp_secret_iv" text NOT NULL,
	"totp_secret_tag" text NOT NULL,
	"totp_confirmed_at" timestamp with time zone NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_totp_step" bigint DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_staff_accounts_email_check" CHECK ("ops_staff_accounts"."email" = lower("ops_staff_accounts"."email") AND length("ops_staff_accounts"."email") BETWEEN 3 AND 254),
	CONSTRAINT "ops_staff_accounts_role_check" CHECK ("ops_staff_accounts"."role" IN ('admin', 'support')),
	CONSTRAINT "ops_staff_accounts_last_totp_step_check" CHECK ("ops_staff_accounts"."last_totp_step" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ops_staff_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_staff_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_staff_recovery_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text,
	"totp_verified_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_staff_sessions_expiry_check" CHECK ("ops_staff_sessions"."expires_at" > "ops_staff_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "ops_staff_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ADD COLUMN "ops_adjustment_id" uuid;--> statement-breakpoint
ALTER TABLE "ops_audit_events" ADD CONSTRAINT "ops_audit_events_actor_staff_id_ops_staff_accounts_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_change_previews" ADD CONSTRAINT "ops_change_previews_staff_id_ops_staff_accounts_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_change_previews" ADD CONSTRAINT "ops_change_previews_session_id_ops_staff_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ops_staff_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_change_previews" ADD CONSTRAINT "ops_change_previews_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ADD CONSTRAINT "ops_entitlement_adjustments_preview_id_ops_change_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."ops_change_previews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ADD CONSTRAINT "ops_entitlement_adjustments_staff_id_ops_staff_accounts_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ADD CONSTRAINT "ops_entitlement_adjustments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_staff_recovery_codes" ADD CONSTRAINT "ops_staff_recovery_codes_staff_id_ops_staff_accounts_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_staff_sessions" ADD CONSTRAINT "ops_staff_sessions_staff_id_ops_staff_accounts_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."ops_staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_audit_events_actor_created" ON "ops_audit_events" USING btree ("actor_staff_id","created_at");--> statement-breakpoint
CREATE INDEX "ops_audit_events_target_created" ON "ops_audit_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_change_previews_confirmation_hash" ON "ops_change_previews" USING btree ("confirmation_hash");--> statement-breakpoint
CREATE INDEX "ops_change_previews_actor_pending" ON "ops_change_previews" USING btree ("staff_id","session_id","executed_at");--> statement-breakpoint
CREATE INDEX "ops_change_previews_expiry" ON "ops_change_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_entitlement_adjustments_preview" ON "ops_entitlement_adjustments" USING btree ("preview_id");--> statement-breakpoint
CREATE INDEX "ops_entitlement_adjustments_account" ON "ops_entitlement_adjustments" USING btree ("environment","account_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_staff_accounts_email" ON "ops_staff_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ops_staff_accounts_role_active" ON "ops_staff_accounts" USING btree ("role","disabled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_staff_recovery_codes_hash" ON "ops_staff_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "ops_staff_recovery_codes_staff" ON "ops_staff_recovery_codes" USING btree ("staff_id","consumed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_staff_sessions_token_hash" ON "ops_staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ops_staff_sessions_staff_active" ON "ops_staff_sessions" USING btree ("staff_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "ops_staff_sessions_expiry" ON "ops_staff_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ADD CONSTRAINT "membership_entitlement_segments_ops_adjustment_id_ops_entitlement_adjustments_id_fk" FOREIGN KEY ("ops_adjustment_id") REFERENCES "public"."ops_entitlement_adjustments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_segments_adjustment_revision" ON "membership_entitlement_segments" USING btree ("environment","ops_adjustment_id","revision");--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ADD CONSTRAINT "membership_segments_source_check" CHECK (num_nonnulls("membership_entitlement_segments"."order_id", "membership_entitlement_segments"."ops_adjustment_id") = 1);--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_ops_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ops_append_only_table_mutation_forbidden:%', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ops_audit_events_append_only
BEFORE UPDATE OR DELETE ON "ops_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_ops_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER ops_entitlement_adjustments_append_only
BEFORE UPDATE OR DELETE ON "ops_entitlement_adjustments"
FOR EACH ROW EXECUTE FUNCTION prevent_ops_append_only_mutation();--> statement-breakpoint
REVOKE ALL ON TABLE "ops_staff_accounts" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ops_staff_recovery_codes" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ops_staff_sessions" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ops_change_previews" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ops_entitlement_adjustments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ops_audit_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "ops_audit_events_sequence_seq" FROM anon, authenticated;
