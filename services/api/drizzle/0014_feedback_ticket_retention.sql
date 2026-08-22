ALTER TABLE "feedback_tickets" ADD COLUMN "retention_at" timestamp with time zone;--> statement-breakpoint
UPDATE "feedback_tickets"
SET "retention_at" = "created_at" + INTERVAL '365 days'
WHERE "retention_at" IS NULL;--> statement-breakpoint
UPDATE "feedback_tickets"
SET "diagnostics_expires_at" = "retention_at"
WHERE "diagnostics" IS NOT NULL
	AND "diagnostics_expires_at" IS DISTINCT FROM "retention_at";--> statement-breakpoint
UPDATE "feedback_attachments" AS "attachment"
SET "expires_at" = "ticket"."retention_at"
FROM "feedback_tickets" AS "ticket"
WHERE "attachment"."ticket_id" = "ticket"."id"
	AND "attachment"."expires_at" IS DISTINCT FROM "ticket"."retention_at";--> statement-breakpoint
ALTER TABLE "feedback_tickets" ALTER COLUMN "retention_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_attachments" DROP CONSTRAINT IF EXISTS "feedback_attachments_ticket_id_feedback_tickets_id_fk";--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_ticket_id_feedback_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."feedback_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_tickets_retention" ON "feedback_tickets" USING btree ("retention_at");
