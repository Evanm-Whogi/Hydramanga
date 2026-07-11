import { sql, type SQL } from 'drizzle-orm';
import { series } from '@/db/schema';

/** MangaBaka score_desc hides single-source inflated ratings (e.g. lone AniList 9.9 → rating 99). */
const TOP_RATED_INFLATED_RATING = 99;
const TOP_RATED_SOURCE_MIN = 2;

/**
 * MangaBaka "Highest Rated" (score_desc) sorts on aggregated `rating`, not popularity RRF
 * and not our legacy weighted_score blend. Popularity ranks are a separate signal — see
 * https://mangabaka.org/pages/how-it-works/26-how-popularity-is-calculated
 *
 * Manhwa/manhua sort slightly below manga at the same numeric rating (MangaBaka score_desc).
 */
export function topRatedSortScoreExpr(seriesTable: typeof series = series) {
    return sql`CASE lower(trim(${seriesTable.type}))
        WHEN 'manhwa' THEN ${seriesTable.rating} - 1.25
        WHEN 'manhua' THEN ${seriesTable.rating} - 0.85
        WHEN 'novel' THEN ${seriesTable.rating} - 0.5
        ELSE ${seriesTable.rating}
    END`;
}

function sourceRatingCountExpr(seriesTable: typeof series) {
    return sql`(SELECT count(*)::int FROM jsonb_each(${seriesTable.source}) AS src
        WHERE (src.value->>'rating_normalized') IS NOT NULL
        AND (src.value->>'rating_normalized')::float > 0)`;
}

/** Series eligible for score_desc (multi-source rating, not junk-inflated). */
export function getTopRatedEligibilityConditions(seriesTable: typeof series = series): SQL[] {
    return [
        sql`${seriesTable.rating} IS NOT NULL`,
        sql`${seriesTable.rating} > 0`,
        sql`${seriesTable.rating} < ${TOP_RATED_INFLATED_RATING}`,
        sql`${sourceRatingCountExpr(seriesTable)} >= ${TOP_RATED_SOURCE_MIN}`,
    ];
}
