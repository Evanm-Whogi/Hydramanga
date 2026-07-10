import { db } from '@/db';
import { chapterPlaceholderPages } from '@/db/schema';
import { and, desc, eq, inArray, isNull, not, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';

/**
 * Durable per-page failure/placeholder ledger.
 *
 * A row is written whenever a page either gets a placeholder image (a missing
 * page we substitute rather than fail the chapter over) or fails to download
 * permanently. This is the queryable source of truth for "which pages are bad and
 * why" — the BullMQ failed set is a rolling 25-deep buffer per scraper queue and
 * loses history under load, so it can't be relied on for this.
 *
 * Reasons:
 *  - `http_404`          — page URL returned 404 after retries → placeholder
 *  - `known_broken`      — bytes matched the source's known broken-image graphic → placeholder
 *  - `undecodable`       — 200 body that isn't a decodable image → placeholder
 *  - `source_placeholder`— source advertised the URL as a fallback/broken image → placeholder
 *  - `download_failed`   — non-404 permanent failure (403/5xx/network); chapter failed, no placeholder
 *  - `legacy_scan`       — backfilled from an S3 placeholder scan
 */
export type PlaceholderReason =
  | 'http_404'
  | 'known_broken'
  | 'undecodable'
  | 'source_placeholder'
  | 'download_failed'
  | 'legacy_scan';

export interface RecordPlaceholderInput {
  seriesId: number;
  storagePrefix: string;
  pageNumber: number;
  reason: PlaceholderReason;
  imageUrl?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  scraperId?: string | null;
}

/** Parse the seriesId out of a `${seriesId}/${chapterNumber}` storage prefix. */
export function seriesIdFromStoragePrefix(storagePrefix: string): number | null {
  const first = Number(storagePrefix.split('/')[0]);
  return Number.isFinite(first) ? first : null;
}

class PlaceholderTrackingService {
  /**
   * Upsert a per-page row (keyed on storagePrefix+pageNumber). Re-recording the
   * same page refreshes the detail and clears `resolvedAt`. Never throws — ledger
   * bookkeeping must not break a download/upload path.
   */
  async record(input: RecordPlaceholderInput): Promise<void> {
    try {
      const now = new Date();
      await db
        .insert(chapterPlaceholderPages)
        .values({
          seriesId: input.seriesId,
          storagePrefix: input.storagePrefix,
          pageNumber: input.pageNumber,
          imageUrl: input.imageUrl ?? null,
          errorMessage: input.errorMessage ?? null,
          httpStatus: input.httpStatus ?? null,
          scraperId: input.scraperId ?? null,
          reason: input.reason,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [chapterPlaceholderPages.storagePrefix, chapterPlaceholderPages.pageNumber],
          set: {
            seriesId: input.seriesId,
            imageUrl: input.imageUrl ?? null,
            errorMessage: input.errorMessage ?? null,
            httpStatus: input.httpStatus ?? null,
            scraperId: input.scraperId ?? null,
            reason: input.reason,
            resolvedAt: null,
            updatedAt: now,
          },
        });
    } catch (error) {
      logger.error(
        `Failed to record placeholder page ${input.storagePrefix}#${input.pageNumber} (${input.reason}): ${error}`,
        { service: 'placeholderTrackingService' }
      );
    }
  }

  /** Convenience wrapper deriving seriesId from the storage prefix. */
  async recordForPrefix(args: Omit<RecordPlaceholderInput, 'seriesId'>): Promise<void> {
    const seriesId = seriesIdFromStoragePrefix(args.storagePrefix);
    if (seriesId == null) {
      logger.warn(`Cannot derive seriesId from storage prefix "${args.storagePrefix}"; skipping placeholder record`, { service: 'placeholderTrackingService' });
      return;
    }
    await this.record({ ...args, seriesId });
  }

  /**
   * Mark all unresolved rows for a storage prefix as resolved, except any pages
   * still placeholdered this run. One query per chapter — safe to call after a
   * chapter's pages are stored.
   */
  async resolveByPrefixExcept(storagePrefix: string, keepPageNumbers: number[]): Promise<void> {
    try {
      const conditions = [
        eq(chapterPlaceholderPages.storagePrefix, storagePrefix),
        isNull(chapterPlaceholderPages.resolvedAt),
      ];
      if (keepPageNumbers.length > 0) {
        conditions.push(not(inArray(chapterPlaceholderPages.pageNumber, keepPageNumbers)));
      }
      await db
        .update(chapterPlaceholderPages)
        .set({ resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(...conditions));
    } catch (error) {
      logger.error(`Failed to resolve placeholder rows for prefix ${storagePrefix}: ${error}`, { service: 'placeholderTrackingService' });
    }
  }

  /** Mark every unresolved row for a prefix as resolved (e.g. after an admin redownload). */
  async resolveByPrefix(storagePrefix: string): Promise<void> {
    await this.resolveByPrefixExcept(storagePrefix, []);
  }

  /** Mark one unresolved page row as resolved (e.g. after an admin manual replace). */
  async resolvePage(storagePrefix: string, pageNumber: number): Promise<void> {
    try {
      await db
        .update(chapterPlaceholderPages)
        .set({ resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(chapterPlaceholderPages.storagePrefix, storagePrefix),
          eq(chapterPlaceholderPages.pageNumber, pageNumber),
          isNull(chapterPlaceholderPages.resolvedAt),
        ));
    } catch (error) {
      logger.error(`Failed to resolve placeholder row ${storagePrefix}#${pageNumber}: ${error}`, { service: 'placeholderTrackingService' });
    }
  }

  /** List unresolved ledger rows, most recent first, optionally filtered by reason. */
  async listUnresolved(opts: { reason?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
    const offset = Math.max(0, opts.offset ?? 0);
    const conditions = [isNull(chapterPlaceholderPages.resolvedAt)];
    if (opts.reason) conditions.push(eq(chapterPlaceholderPages.reason, opts.reason));
    return db
      .select()
      .from(chapterPlaceholderPages)
      .where(and(...conditions))
      .orderBy(desc(chapterPlaceholderPages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /** Count unresolved rows, optionally filtered by reason. */
  async countUnresolved(reason?: string): Promise<number> {
    const conditions = [isNull(chapterPlaceholderPages.resolvedAt)];
    if (reason) conditions.push(eq(chapterPlaceholderPages.reason, reason));
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chapterPlaceholderPages)
      .where(and(...conditions));
    return row?.count ?? 0;
  }
}

export const placeholderTrackingService = new PlaceholderTrackingService();
export { PlaceholderTrackingService };
