CREATE TABLE "vocabulary_releases" (
	"version" integer PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_releases_version_positive" CHECK ("vocabulary_releases"."version" > 0),
	CONSTRAINT "vocabulary_releases_checksum_sha256" CHECK ("vocabulary_releases"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "vocabulary_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_releases_one_active" ON "vocabulary_releases" USING btree ("active") WHERE "vocabulary_releases"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_releases_checksum" ON "vocabulary_releases" USING btree ("checksum");
--> statement-breakpoint
REVOKE ALL ON TABLE "vocabulary_releases" FROM anon, authenticated;
