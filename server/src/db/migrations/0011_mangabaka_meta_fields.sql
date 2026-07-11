ALTER TABLE "series" ADD COLUMN "published" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "popularity" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "popularity_global_current" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "popularity_type_current" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "links_v2" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "relationships_v2" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "titles" jsonb;--> statement-breakpoint
CREATE INDEX "idx_series_popularity_global_current" ON "series" USING btree ("popularity_global_current");--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_extract_title_strings(p_titles jsonb, p_secondary_titles jsonb) RETURNS text[] AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  item jsonb;
  nested jsonb;
  title_text text;
BEGIN
  IF p_titles IS NOT NULL AND jsonb_typeof(p_titles) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_titles)
    LOOP
      title_text := item->>'title';
      IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
        parts := array_append(parts, lower(replace(replace(title_text, CHR(8217), ''''), CHR(8216), '''')));
      END IF;
    END LOOP;
  END IF;

  IF p_secondary_titles IS NOT NULL THEN
    IF jsonb_typeof(p_secondary_titles) = 'array' THEN
      FOR item IN SELECT value FROM jsonb_array_elements(p_secondary_titles)
      LOOP
        IF jsonb_typeof(item) = 'string' THEN
          title_text := item #>> '{}';
        ELSE
          title_text := item->>'title';
        END IF;
        IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
          parts := array_append(parts, lower(replace(replace(title_text, CHR(8217), ''''), CHR(8216), '''')));
        END IF;
      END LOOP;
    ELSIF jsonb_typeof(p_secondary_titles) = 'object' THEN
      FOR nested IN SELECT value FROM jsonb_each(p_secondary_titles)
      LOOP
        IF jsonb_typeof(nested) = 'array' THEN
          FOR item IN SELECT value FROM jsonb_array_elements(nested)
          LOOP
            IF jsonb_typeof(item) = 'string' THEN
              title_text := item #>> '{}';
            ELSE
              title_text := item->>'title';
            END IF;
            IF title_text IS NOT NULL AND btrim(title_text) <> '' THEN
              parts := array_append(parts, lower(replace(replace(title_text, CHR(8217), ''''), CHR(8216), '''')));
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN parts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_build_search_text(p_title text, p_native_title text, p_romanized_title text, p_authors jsonb, p_titles jsonb, p_secondary_titles jsonb) RETURNS text AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  author text;
  normalized text;
  alt_title text;
BEGIN
  IF p_title IS NOT NULL AND btrim(p_title) <> '' THEN
    normalized := lower(replace(replace(p_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_romanized_title IS NOT NULL AND btrim(p_romanized_title) <> '' THEN
    normalized := lower(replace(replace(p_romanized_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_native_title IS NOT NULL AND btrim(p_native_title) <> '' THEN
    normalized := lower(replace(replace(p_native_title, CHR(8217), ''''), CHR(8216), ''''));
    parts := array_append(parts, normalized);
  END IF;
  IF p_authors IS NOT NULL THEN
    FOR author IN SELECT jsonb_array_elements_text(p_authors)
    LOOP
      IF author IS NOT NULL AND btrim(author) <> '' THEN
        normalized := lower(replace(replace(author, CHR(8217), ''''), CHR(8216), ''''));
        parts := array_append(parts, normalized);
      END IF;
    END LOOP;
  END IF;
  IF p_titles IS NOT NULL OR p_secondary_titles IS NOT NULL THEN
    FOR alt_title IN SELECT unnest(series_extract_title_strings(p_titles, p_secondary_titles))
    LOOP
      IF alt_title IS NOT NULL AND btrim(alt_title) <> '' AND NOT alt_title = ANY(parts) THEN
        parts := array_append(parts, alt_title);
      END IF;
    END LOOP;
  END IF;
  RETURN NULLIF(array_to_string(parts, ' '), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION series_search_text_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_text := series_build_search_text(NEW.title, NEW.native_title, NEW.romanized_title, NEW.authors, NEW.titles, NEW.secondary_titles);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS series_search_text_trigger ON "series";--> statement-breakpoint
CREATE TRIGGER series_search_text_trigger
  BEFORE INSERT OR UPDATE OF title, native_title, romanized_title, authors, titles, secondary_titles
  ON "series"
  FOR EACH ROW
  EXECUTE FUNCTION series_search_text_trigger_fn();
