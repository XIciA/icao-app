ALTER TABLE feedback_tickets DROP CONSTRAINT feedback_tickets_category_check;
--> statement-breakpoint
ALTER TABLE feedback_tickets ADD CONSTRAINT feedback_tickets_category_check CHECK (category IN ('feature_suggestion', 'content_correction', 'other', 'listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'));
--> statement-breakpoint
ALTER TABLE feedback_tickets DROP CONSTRAINT feedback_tickets_source_check;
--> statement-breakpoint
ALTER TABLE feedback_tickets ADD CONSTRAINT feedback_tickets_source_check CHECK (source IN ('profile', 'study', 'exam_report', 'opi_hotspot'));
