import { sql, inArray, and, gte, getTableColumns } from 'drizzle-orm';
import { db, schema } from '@/db/index';
import { series } from '@/db/schema';

/** Card/list selects — omits search_text until DB migration (see sql/add_series_search_text.sql). */
const { searchText: _searchText, ...seriesCardColumns } = getTableColumns(series);
export { seriesCardColumns };

export async function fetchSeriesChapterFlags(seriesIds: number[], newInterval = '3 days'): Promise<{ importedIds: Set<number>; newIds: Set<number> }> {
  if (seriesIds.length === 0) {
    return { importedIds: new Set(), newIds: new Set() };
  }

  const newSince = sql`now() - interval ${sql.raw(`'${newInterval}'`)}`;

  const [importedRows, newRows] = await Promise.all([
    db
      .selectDistinct({ seriesId: schema.chapters.seriesId })
      .from(schema.chapters)
      .where(inArray(schema.chapters.seriesId, seriesIds)),
    db
      .selectDistinct({ seriesId: schema.chapters.seriesId })
      .from(schema.chapters)
      .where(and(inArray(schema.chapters.seriesId, seriesIds), gte(schema.chapters.createdAt, newSince))),
  ]);

  return {
    importedIds: new Set(importedRows.map((row) => row.seriesId)),
    newIds: new Set(newRows.map((row) => row.seriesId)),
  };
}

export async function enrichSeriesListExtras<T extends { id: number }>(items: T[], newInterval = '3 days'): Promise<(T & { isNew: boolean; hasImportedChapters: boolean })[]> {
  if (items.length === 0) return [];

  const { importedIds, newIds } = await fetchSeriesChapterFlags(
    items.map((item) => item.id),
    newInterval,
  );

  return items.map((item) => ({
    ...item,
    isNew: newIds.has(item.id),
    hasImportedChapters: importedIds.has(item.id),
  }));
}

/** Attach isNew / hasImportedChapters to nested series objects (e.g. popular chapters). */
export async function enrichNestedSeriesExtras<T extends { series: { id: number } }>(rows: T[], newInterval = '3 days'): Promise<T[]> {
  if (rows.length === 0) return rows;

  const flags = await fetchSeriesChapterFlags(
    rows.map((row) => row.series.id),
    newInterval,
  );

  return rows.map((row) => ({
    ...row,
    series: {
      ...row.series,
      isNew: flags.newIds.has(row.series.id),
      hasImportedChapters: flags.importedIds.has(row.series.id),
    },
  }));
}
