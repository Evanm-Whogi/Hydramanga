-- Keep btree sort columns in sync with canonical popularity JSON.
UPDATE "series"
SET
  "popularity_global_current" = ("popularity"->'global'->>'current')::int,
  "popularity_type_current" = ("popularity"->'type'->>'current')::int
WHERE "popularity" IS NOT NULL
  AND (
    "popularity_global_current" IS DISTINCT FROM ("popularity"->'global'->>'current')::int
    OR "popularity_type_current" IS DISTINCT FROM ("popularity"->'type'->>'current')::int
  );
