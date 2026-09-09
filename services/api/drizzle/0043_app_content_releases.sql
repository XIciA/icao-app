CREATE TABLE "app_content_releases" (
	"version" integer PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_content_releases_version_positive" CHECK ("app_content_releases"."version" > 0),
	CONSTRAINT "app_content_releases_checksum_sha256" CHECK ("app_content_releases"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "app_content_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "app_content_releases_one_active" ON "app_content_releases" USING btree ("active") WHERE "app_content_releases"."active" = true;
--> statement-breakpoint
REVOKE ALL ON "app_content_releases" FROM anon, authenticated;
