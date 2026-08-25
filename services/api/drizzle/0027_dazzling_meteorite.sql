CREATE TABLE "content_access_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"account_id" uuid NOT NULL,
	"entitlement_segment_id" uuid NOT NULL,
	"device_digest" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"credential_digest" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"retention_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_access_credentials_environment_check" CHECK ("content_access_credentials"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "content_access_credentials_window_check" CHECK ("content_access_credentials"."expires_at" > "content_access_credentials"."issued_at" AND "content_access_credentials"."expires_at" <= "content_access_credentials"."issued_at" + interval '72 hours'),
	CONSTRAINT "content_access_credentials_retention_check" CHECK ("content_access_credentials"."retention_at" >= "content_access_credentials"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "content_access_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_access_credentials" ADD CONSTRAINT "content_access_credentials_entitlement_fk" FOREIGN KEY ("entitlement_segment_id","environment","account_id") REFERENCES "public"."membership_entitlement_segments"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "content_access_credentials_digest" ON "content_access_credentials" USING btree ("credential_digest");--> statement-breakpoint
CREATE INDEX "content_access_credentials_account_expiry" ON "content_access_credentials" USING btree ("account_id","expires_at");--> statement-breakpoint
CREATE INDEX "content_access_credentials_retention" ON "content_access_credentials" USING btree ("retention_at");
