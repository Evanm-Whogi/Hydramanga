import { sql } from 'drizzle-orm';
import { series } from '@/db/schema';

/** SQL expression for the resolved display title (matches series_display_title()). */
export const seriesDisplayTitleSql = sql<string>`series_display_title(${series.titles})`;
