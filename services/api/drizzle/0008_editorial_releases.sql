ALTER TABLE "resource_objects"
	ADD COLUMN "storage_bucket" text DEFAULT 'question-bank-assets' NOT NULL;
--> statement-breakpoint
CREATE TABLE "editorial_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_release_version" ON "editorial_releases" USING btree ("version");
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_release_checksum" ON "editorial_releases" USING btree ("checksum");
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_release_single_active" ON "editorial_releases" (("active")) WHERE "active" = true;
--> statement-breakpoint
ALTER TABLE "editorial_releases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "editorial_releases" FROM anon, authenticated;
