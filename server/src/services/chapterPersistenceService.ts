/**
 * Chapter Persistence Service
 *
 * The shared "tail" of every chapter acquisition path: once pages are in object
 * storage, persist the chapter row, drive import progress, and fire the
 * "newly downloaded" announcement exactly once per completed import.
 *
 * Both acquisition paths converge here so they produce identical DB rows,
 * progress updates, and notifications:
 * - the scrape path (`chapterDownloaderService`) after the scraper uploads pages;
 * - the archive/torrent path (`archiveIngestService`) after a chapter's pages are
 *   transcoded out of an unpacked archive.
 *
 * Provenance is recorded via `chapters.scraperId` (e.g. a concrete scraper id for
 * scrapes, `'torrent'` for archive ingests).
 */
import { db } from '@/db';
import { chapters } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { mangaProgressService } from '@/services/mangaProgressService';
import { notificationService } from '@/services/notificationService';
import logger from '@/services/loggerService';
import { withDbRetry } from '@/utils/dbError';

export interface PersistDownloadedChapterInput {
    seriesId: number;
    chapterNumber: number | string;
    /** Volume this chapter belongs to (e.g. archive volume packs); null when unknown. */
    volumeNumber?: number | string | null;
    /** Chapter display title. */
    title: string;
    /** Object-key prefix where the pages were stored (e.g. `${seriesId}/${chapterNumber}`). */
    storagePrefix: string;
    pageCount: number;
    /** Provenance: scraper id, or `'torrent'` for archive ingests. */
    scraperId?: string | null;
}

export interface PersistDownloadedChapterResult {
    /** Database id of the upserted chapter row, if it could be read back. */
    chapterId?: number;
    /** True only on the call that drove the whole import to a completed state. */
    justCompleted: boolean;
}

class ChapterPersistenceService {
    /**
     * Upsert a downloaded chapter, increment import progress, and announce the
     * import's newly downloaded chapters once it finishes.
     *
     * Mirrors the original inline logic in `chapterDownloaderService.downloadChapter`.
     * The caller is responsible for the progress lifecycle that must already be in
     * place (`initializeProgress` → `setTotalChapters`) before this runs — otherwise
     * `incrementDownloaded` no-ops because the series isn't in a `downloading` state.
     */
    async persistDownloadedChapter(
        input: PersistDownloadedChapterInput
    ): Promise<PersistDownloadedChapterResult> {
        const { seriesId, title, storagePrefix, pageCount } = input;
        const chapterNumberStr = String(input.chapterNumber);
        const volumeNumberStr = input.volumeNumber != null ? String(input.volumeNumber) : null;
        const scraperId = input.scraperId ?? null;

        // Upsert chapter metadata (insert, or update if the (series, number) already exists).
        await withDbRetry(
            () =>
                db
                    .insert(chapters)
                    .values({
                        seriesId,
                        chapterNumber: chapterNumberStr,
                        volumeNumber: volumeNumberStr,
                        storagePrefix,
                        pageCount,
                        title,
                        scraperId,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: [chapters.seriesId, chapters.chapterNumber],
                        set: {
                            // Don't clobber an existing volumeNumber with null when a later
                            // scrape (which doesn't know volumes) re-persists the same chapter.
                            ...(volumeNumberStr != null ? { volumeNumber: volumeNumberStr } : {}),
                            storagePrefix,
                            pageCount,
                            title,
                            scraperId,
                            updatedAt: new Date(),
                        },
                    }),
            {
                label: `persist_chapter series=${seriesId} chapter=${chapterNumberStr}`,
                maxAttempts: 3,
            }
        );

        // Fetch the complete saved row so progress tracking has full chapter info.
        const [savedChapter] = await db
            .select()
            .from(chapters)
            .where(and(eq(chapters.chapterNumber, chapterNumberStr), eq(chapters.seriesId, seriesId)))
            .limit(1);

        const incrementResult = savedChapter
            ? await mangaProgressService.incrementDownloaded(seriesId, {
                  id: savedChapter.id,
                  chapterNumber: savedChapter.chapterNumber,
                  title: savedChapter.title || title,
                  pageCount: savedChapter.pageCount || pageCount,
                  createdAt: savedChapter.createdAt?.toISOString(),
                  updatedAt: savedChapter.updatedAt?.toISOString(),
              })
            : await mangaProgressService.incrementDownloaded(seriesId, {
                  chapterNumber: chapterNumberStr,
                  title,
                  pageCount,
              });

        // Announce only once the whole import has finished downloading, so users and
        // Discord see chapters that actually landed — not ones merely queued (some of
        // which may fail and only arrive later via the recovery job).
        if (incrementResult.justCompleted) {
            await notificationService.announceNewlyDownloadedChapters(seriesId);
        }

        logger.info(
            `[PERSIST] Saved chapter ${chapterNumberStr} for series ${seriesId} (prefix ${storagePrefix}, ${pageCount} pages, source ${scraperId ?? 'unknown'})`,
            { service: 'chapterPersistenceService' }
        );

        return { chapterId: savedChapter?.id, justCompleted: incrementResult.justCompleted };
    }
}

export const chapterPersistenceService = new ChapterPersistenceService();
export { ChapterPersistenceService };
