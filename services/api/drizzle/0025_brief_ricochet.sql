CREATE TABLE "ai_consent_authorities" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"policy_version" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_consent_authorities_revision_check" CHECK ("ai_consent_authorities"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_consent_authorities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_consent_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"flow_revision" text NOT NULL,
	"token_hash" text NOT NULL,
	"consent_revision" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_consent_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_consents" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_consents" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_consent_authorities" ADD CONSTRAINT "ai_consent_authorities_user_id_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_consent_challenges" ADD CONSTRAINT "ai_consent_challenges_user_id_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_consent_challenges_token_hash" ON "ai_consent_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ai_consent_challenges_user" ON "ai_consent_challenges" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "ai_consent_authorities" (
	"user_id", "policy_version", "revision", "active", "updated_at"
)
SELECT
	"user_id", "policy_version", "revision", "revoked_at" IS NULL, "updated_at"
FROM "ai_consents"
ON CONFLICT ("user_id") DO UPDATE SET
	"policy_version" = EXCLUDED."policy_version",
	"revision" = EXCLUDED."revision",
	"active" = EXCLUDED."active",
	"updated_at" = EXCLUDED."updated_at";--> statement-breakpoint
DELETE FROM "ai_consents" WHERE "revoked_at" IS NOT NULL;--> statement-breakpoint
CREATE FUNCTION "enforce_ai_consent_authority"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."revoked_at" IS NOT NULL OR NOT EXISTS (
		SELECT 1
		FROM "ai_consent_authorities" authority
		WHERE authority."user_id" = NEW."user_id"
			AND authority."active" = true
			AND authority."policy_version" = NEW."policy_version"
			AND authority."revision" = NEW."revision"
	) THEN
		RAISE EXCEPTION 'ai_consent_authority_required';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_consents_authority_guard"
BEFORE INSERT OR UPDATE ON "ai_consents"
FOR EACH ROW EXECUTE FUNCTION "enforce_ai_consent_authority"();--> statement-breakpoint
CREATE FUNCTION "withdraw_ai_consent_authority_on_marker_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "ai_consent_authorities"
	SET "active" = false,
		"revision" = "revision" + 1,
		"updated_at" = now()
	WHERE "user_id" = OLD."user_id" AND "active" = true;
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_consents_delete_withdraws_authority"
AFTER DELETE ON "ai_consents"
FOR EACH ROW EXECUTE FUNCTION "withdraw_ai_consent_authority_on_marker_delete"();--> statement-breakpoint
REVOKE ALL ON TABLE "ai_consent_authorities", "ai_consent_challenges" FROM anon, authenticated;
