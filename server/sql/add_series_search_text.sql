-- Denormalized search_text for discover (titles + authors, lowercased).
-- Also applied via drizzle migration 0032_series_search_text.sql.

ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "search_text" text;

CREATE INDEX IF NOT EXISTS "idx_series_search_text_trgm" ON "series" USING gin ("search_text" gin_trgm_ops);

CREATE OR REPLACE FUNCTION series_build_search_text(p_title text, p_native_title text, p_romanized_title text, p_authors jsonb) RETURNS text AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  author text;
  normalized text;
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
  RETURN NULLIF(array_to_string(parts, ' '), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION series_search_text_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_text := series_build_search_text(NEW.title, NEW.native_title, NEW.romanized_title, NEW.authors);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS series_search_text_trigger ON "series";

CREATE TRIGGER series_search_text_trigger
  BEFORE INSERT OR UPDATE OF title, native_title, romanized_title, authors
  ON "series"
  FOR EACH ROW
  EXECUTE FUNCTION series_search_text_trigger_fn();

UPDATE "series"
SET search_text = series_build_search_text(title, native_title, romanized_title, authors)
WHERE search_text IS DISTINCT FROM series_build_search_text(title, native_title, romanized_title, authors);
