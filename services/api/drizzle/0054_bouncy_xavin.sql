CREATE TABLE "feedback_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"client_reply_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD COLUMN "replies_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback_replies" ADD CONSTRAINT "feedback_replies_ticket_id_feedback_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."feedback_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_replies_ticket_client" ON "feedback_replies" USING btree ("ticket_id","client_reply_id");--> statement-breakpoint
CREATE INDEX "feedback_replies_ticket_created" ON "feedback_replies" USING btree ("ticket_id","created_at");
--> statement-breakpoint
REVOKE ALL ON TABLE "feedback_replies" FROM anon, authenticated;
