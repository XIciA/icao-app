CREATE TABLE "content_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"exam_date" text,
	"center" text,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"draft" jsonb,
	"published_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_work_orders_kind" CHECK ("content_work_orders"."kind" IN ('opi','article','questions')),
	CONSTRAINT "content_work_orders_status" CHECK ("content_work_orders"."status" IN ('pending','ready','published')),
	CONSTRAINT "content_work_orders_revision" CHECK ("content_work_orders"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "content_work_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "content_work_orders_opi_date_center" ON "content_work_orders" USING btree ("exam_date","center") WHERE "content_work_orders"."kind" = 'opi';
--> statement-breakpoint
REVOKE ALL ON TABLE public.content_work_orders FROM anon, authenticated;
