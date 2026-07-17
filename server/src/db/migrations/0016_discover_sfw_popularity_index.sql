-- Partial index for default discover (mostPopular + hide NSFW).
-- Matches getCatalogFilterConditions(hideNsfw=true) + popularity_global_current keyset
-- so cold first-page LIMIT and COUNT(*) use index-only scans instead of seq scans.
CREATE INDEX IF NOT EXISTS "idx_series_discover_sfw_popularity" ON "series" ("popularity_global_current" ASC NULLS LAST, "id" ASC) WHERE "type" IS DISTINCT FROM 'novel' AND "state" IS DISTINCT FROM 'merged' AND ("content_rating" IS NULL OR "content_rating" IS DISTINCT FROM 'pornographic') AND ("genres" IS NULL OR NOT ("genres" @> '["Hentai"]'::jsonb OR "genres" @> '["Lolicon"]'::jsonb OR "genres" @> '["Shotacon"]'::jsonb OR "genres" @> '["Smut"]'::jsonb'));
