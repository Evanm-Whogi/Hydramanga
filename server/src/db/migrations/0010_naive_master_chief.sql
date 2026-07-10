CREATE TABLE "chapter_placeholder_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"storage_prefix" text NOT NULL,
	"page_number" integer NOT NULL,
	"image_url" text,
	"error_message" text,
	"http_status" integer,
	"scraper_id" text,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_scan_state" ADD COLUMN "current_batch_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_scan_state" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_scan_state" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "manga_import_progress" ADD COLUMN "failed_chapters" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter_placeholder_pages" ADD CONSTRAINT "chapter_placeholder_pages_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_chapter_placeholder_prefix_page" ON "chapter_placeholder_pages" USING btree ("storage_prefix","page_number");--> statement-breakpoint
CREATE INDEX "idx_chapter_placeholder_series" ON "chapter_placeholder_pages" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_chapter_placeholder_unresolved" ON "chapter_placeholder_pages" USING btree ("reason") WHERE "chapter_placeholder_pages"."resolved_at" IS NULL;