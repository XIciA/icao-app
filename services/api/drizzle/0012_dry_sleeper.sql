ALTER TABLE "feedback_tickets" ADD COLUMN "diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD COLUMN "diagnostics_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "feedback_tickets_diagnostics_expires" ON "feedback_tickets" USING btree ("diagnostics_expires_at");
