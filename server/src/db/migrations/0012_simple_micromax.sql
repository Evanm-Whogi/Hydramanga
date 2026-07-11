ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "published" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "popularity" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "popularity_global_current" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "popularity_type_current" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "links_v2" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "relationships_v2" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "titles" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_popularity_global_current" ON "series" USING btree ("popularity_global_current");
