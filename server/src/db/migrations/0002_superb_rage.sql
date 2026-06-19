ALTER TABLE "chapters" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_chapters_unnotified" ON "chapters" USING btree ("series_id") WHERE "chapters"."notified_at" IS NULL;--> statement-breakpoint
-- Backfill: treat all pre-existing chapters as already announced so the first import
-- completion after deploy doesn't re-announce the entire back catalog.
UPDATE "chapters" SET "notified_at" = "created_at" WHERE "notified_at" IS NULL;