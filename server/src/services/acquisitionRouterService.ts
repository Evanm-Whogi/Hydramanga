/**
 * Acquisition Router (plan §3.5, §11.2).
 *
 * Decides, per series, whether an import is served by the ARCHIVE (torrent) path or
 * the existing SCRAPE path — and wires the fallback so scraping is always the safety
 * net, never a worse outcome than scrape-only.
 *
 * Driver = back-catalog SIZE, not the completed/ongoing label:
 *   - completed series, OR a known large backlog, OR an explicit manual-backfill →
 *     archive the bulk, then scrape gap-fills the leading edge (ongoing only).
 *   - small/new/unknown-backlog series → just scrape (fast).
 * Monitored rescans never come here — they stay pure scrape (leading edge).
 */
import { db } from '@/db';
import { series, chapters, acquisitionJobs } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { queueService } from '@/services/queueService';
import {
    ARCHIVE_ACQUIRE_QUEUE,
    type ArchiveAcquireJobData,
} from '@/jobs/handlers/archiveQueueNames';

export type AcquisitionTrigger = 'initial-import' | 'manual-backfill';
export type AcquisitionStrategy = 'archive_then_scrape' | 'archive_only' | 'scrape';

function coverUrlOf(cover: unknown): string | undefined {
    const c = cover as any;
    return c ? c?.x350?.x1 || c?.x250?.x1 || c?.raw?.url || undefined : undefined;
}

/** Parse a text chapter/volume count column (stored as text) to a number. */
function parseCount(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
}

class AcquisitionRouterService {
    private get cfg() {
        return appConfig.archive;
    }

    /** Whether the archive pipeline is enabled at all. */
    get enabled(): boolean {
        return this.cfg.enabled;
    }

    /**
     * Decide the strategy for a series. `haveChapters` is the count already in the DB.
     */
    resolveStrategy(
        seriesRow: { status: string | null; totalChapters: string | null; finalChapter: string | null },
        haveChapters: number,
        trigger: AcquisitionTrigger
    ): AcquisitionStrategy {
        const expected = parseCount(seriesRow.totalChapters) ?? parseCount(seriesRow.finalChapter);
        const backlog = expected != null ? expected - haveChapters : undefined;

        const archiveWorthIt =
            seriesRow.status === 'completed' ||
            (backlog != null && backlog >= this.cfg.router.backfillGapThreshold) ||
            trigger === 'manual-backfill';

        if (!archiveWorthIt) return 'scrape';
        // Completed series: a full batch needs no follow-up scrape. Anything else gets
        // a gap-fill scrape afterwards for the leading edge archives always lag.
        return seriesRow.status === 'completed' ? 'archive_only' : 'archive_then_scrape';
    }

    /**
     * Route an import for a series. Returns the chosen strategy. When archive is
     * chosen, enqueues the acquire job; otherwise (or when disabled) signals the
     * caller should scrape (and enqueues the scrape itself for convenience).
     */
    async routeImport(
        seriesId: number,
        trigger: AcquisitionTrigger = 'initial-import',
        opts: { scrapeFallback?: boolean } = {}
    ): Promise<AcquisitionStrategy> {
        // When false, the caller owns the scrape enqueue (e.g. on-demand first-scan,
        // which needs isFirstScan/preview semantics the generic fallback lacks).
        const scrapeFallback = opts.scrapeFallback !== false;
        if (!this.enabled) return 'scrape';

        const [row] = await db
            .select({
                title: series.title,
                romanizedTitle: series.romanizedTitle,
                nativeTitle: series.nativeTitle,
                secondaryTitles: series.secondaryTitles,
                cover: series.cover,
                status: series.status,
                totalChapters: series.totalChapters,
                finalChapter: series.finalChapter,
            })
            .from(series)
            .where(eq(series.id, seriesId))
            .limit(1);

        if (!row?.title) {
            logger.warn(`[ROUTER] Series ${seriesId} not found; defaulting to scrape`, { service: 'acquisitionRouter' });
            return 'scrape';
        }

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(chapters)
            .where(eq(chapters.seriesId, seriesId));

        const strategy = this.resolveStrategy(row, count, trigger);
        logger.info(`[ROUTER] Series ${seriesId} ("${row.title}") → ${strategy} (have=${count}, status=${row.status}, trigger=${trigger})`, {
            service: 'acquisitionRouter',
        });

        if (strategy === 'scrape') {
            if (scrapeFallback) await this.enqueueScrape(seriesId, 'router-scrape');
            return strategy;
        }

        // Dedupe: one in-flight/successful acquisition per series (plan §11.2).
        const existing = await db
            .select({ id: acquisitionJobs.id, status: acquisitionJobs.status })
            .from(acquisitionJobs)
            .where(eq(acquisitionJobs.seriesId, seriesId));
        const active = existing.find((j) => j.status !== 'failed');
        if (active && trigger !== 'manual-backfill') {
            logger.info(`[ROUTER] Series ${seriesId} already has acquisition job ${active.id} (${active.status}); skipping`, {
                service: 'acquisitionRouter',
            });
            return strategy;
        }

        // Scrape gap-fill after ingest when the operator explicitly asked for an
        // archive+scrape backfill, or when the strategy already implies a follow-up
        // scrape. Completed-series initial-imports stay archive_only (no scrape).
        const scrapeAfter = trigger === 'manual-backfill' || strategy === 'archive_then_scrape';

        const data: ArchiveAcquireJobData = {
            seriesId,
            trigger,
            titles: this.collectTitles(row),
            expectedChapters: parseCount(row.totalChapters) ?? parseCount(row.finalChapter),
            scrapeAfter,
        };
        await queueService.addJob(ARCHIVE_ACQUIRE_QUEUE, `Archive acquire ${row.title}`, data, {
            jobId: `acquire-${seriesId}-${trigger}`,
            attempts: 1,
        });
        return strategy;
    }

    /**
     * Enqueue the existing scrape flow for a series — used as the fallback on any
     * archive-stage failure, and as the gap-fill after a successful ongoing-series
     * ingest. Serialized after ingest by the caller (never concurrent, §11.3).
     */
    async enqueueScrape(seriesId: number, reason: string): Promise<void> {
        const [row] = await db
            .select({ title: series.title, romanizedTitle: series.romanizedTitle, cover: series.cover })
            .from(series)
            .where(eq(series.id, seriesId))
            .limit(1);
        if (!row?.title) {
            logger.warn(`[ROUTER] Cannot enqueue scrape for unknown series ${seriesId}`, { service: 'acquisitionRouter' });
            return;
        }
        await queueService.addJob(
            'mangaChapterImportQueue',
            `Archive ${reason} ${row.title}`,
            {
                mangaTitle: row.title,
                seriesId,
                romanizedTitle: row.romanizedTitle || undefined,
                coverUrl: coverUrlOf(row.cover),
            },
            { jobId: `archive-scrape-${seriesId}`, attempts: 2 }
        );
        logger.info(`[ROUTER] Enqueued ${reason} scrape for series ${seriesId} (${row.title})`, {
            service: 'acquisitionRouter',
        });
    }

    private collectTitles(row: {
        title: string | null;
        romanizedTitle: string | null;
        nativeTitle: string | null;
        secondaryTitles: unknown;
    }): string[] {
        const titles: string[] = [];
        const push = (t?: string | null) => {
            const trimmed = (t || '').trim();
            if (trimmed && !titles.some((x) => x.toLowerCase() === trimmed.toLowerCase())) titles.push(trimmed);
        };
        push(row.title);
        push(row.romanizedTitle);
        push(row.nativeTitle);
        // secondaryTitles is jsonb (array of strings or objects with .title).
        const sec = row.secondaryTitles;
        if (Array.isArray(sec)) {
            for (const item of sec) {
                if (typeof item === 'string') push(item);
                else if (item && typeof item === 'object' && typeof (item as any).title === 'string') push((item as any).title);
            }
        }
        return titles;
    }
}

export const acquisitionRouterService = new AcquisitionRouterService();
export { AcquisitionRouterService };
