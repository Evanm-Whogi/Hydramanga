CREATE OR REPLACE FUNCTION series_display_title(p_titles jsonb) RETURNS text AS $$
DECLARE
  entry jsonb;
  title_text text;
  normalized text;
BEGIN
  IF p_titles IS NULL OR jsonb_typeof(p_titles) <> 'array' THEN
    RETURN 'Untitled';
  END IF;

  FOR entry IN
    SELECT value FROM jsonb_array_elements(p_titles) AS t(value)
    ORDER BY
      CASE
        WHEN value->>'language' = 'en' AND COALESCE((value->>'is_primary')::boolean, false) THEN 0
        WHEN value->>'language' = 'en' AND value->'traits' ? 'official' THEN 1
        WHEN value->>'language' = 'en' THEN 2
        WHEN COALESCE((value->>'is_primary')::boolean, false) THEN 3
        ELSE 4
      END,
      value->>'title'
  LOOP
    title_text := entry->>'title';
    IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
      normalized := title_text;
      IF lower(normalized) NOT LIKE 'unknown title%' THEN
        RETURN normalized;
      END IF;
    END IF;
  END LOOP;

  title_text := p_titles->0->>'title';
  IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
    RETURN title_text;
  END IF;

  RETURN 'Untitled';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_extract_title_strings(p_titles jsonb) RETURNS text[] AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  item jsonb;
  title_text text;
  normalized text;
BEGIN
  IF p_titles IS NOT NULL AND jsonb_typeof(p_titles) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_titles)
    LOOP
      title_text := item->>'title';
      IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
        normalized := lower(replace(replace(title_text, CHR(8217), ''''), CHR(8216), ''''));
        IF NOT normalized = ANY(parts) THEN
          parts := array_append(parts, normalized);
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN parts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_build_search_text(p_titles jsonb, p_authors jsonb) RETURNS text AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  author text;
  normalized text;
  alt_title text;
BEGIN
  IF p_titles IS NOT NULL OR jsonb_array_length(COALESCE(p_titles, '[]'::jsonb)) > 0 THEN
    FOR alt_title IN SELECT unnest(series_extract_title_strings(p_titles))
    LOOP
      IF alt_title IS NOT NULL AND btrim(alt_title) <> '' AND NOT alt_title = ANY(parts) THEN
        parts := array_append(parts, alt_title);
      END IF;
    END LOOP;
  END IF;
  IF p_authors IS NOT NULL THEN
    FOR author IN SELECT jsonb_array_elements_text(p_authors)
    LOOP
      IF author IS NOT NULL AND btrim(author) <> '' THEN
        normalized := lower(replace(replace(author, CHR(8217), ''''), CHR(8216), ''''));
        IF NOT normalized = ANY(parts) THEN
          parts := array_append(parts, normalized);
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NULLIF(array_to_string(parts, ' '), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_search_text_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_text := series_build_search_text(NEW.titles, NEW.authors);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS series_search_text_trigger ON "series";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_series_search_text ON "series";
--> statement-breakpoint
UPDATE "series"
SET "titles" = COALESCE(
  CASE
    WHEN "titles" IS NOT NULL AND jsonb_typeof("titles") = 'array' AND jsonb_array_length("titles") > 0 THEN "titles"
    ELSE NULL
  END,
  (
    SELECT COALESCE(jsonb_agg(entry ORDER BY ord), '[]'::jsonb)
    FROM (
      SELECT 1 AS ord, jsonb_build_object('language', 'en', 'title', title, 'is_primary', true, 'traits', '[]'::jsonb) AS entry
      WHERE title IS NOT NULL AND btrim(title) <> ''
      UNION ALL
      SELECT 2, jsonb_build_object('language', 'ja', 'title', native_title, 'is_primary', true, 'traits', jsonb_build_array('native'))
      WHERE native_title IS NOT NULL AND btrim(native_title) <> ''
      UNION ALL
      SELECT 3, jsonb_build_object('language', 'ja-Latn', 'title', romanized_title, 'is_primary', true, 'traits', jsonb_build_array('native'))
      WHERE romanized_title IS NOT NULL AND btrim(romanized_title) <> ''
    ) legacy_entries
  )
)
WHERE "titles" IS NULL OR jsonb_typeof("titles") <> 'array' OR jsonb_array_length(COALESCE("titles", '[]'::jsonb)) = 0;
--> statement-breakpoint
UPDATE "series" SET search_text = series_build_search_text(titles, authors);
--> statement-breakpoint
CREATE TRIGGER series_search_text_trigger
  BEFORE INSERT OR UPDATE OF titles, authors
  ON "series"
  FOR EACH ROW
  EXECUTE FUNCTION series_search_text_trigger_fn();
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_series_title_trgm";
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_series_search_text ON "series";
--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN IF EXISTS "title";
--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN IF EXISTS "native_title";
--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN IF EXISTS "romanized_title";
--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN IF EXISTS "secondary_titles";
