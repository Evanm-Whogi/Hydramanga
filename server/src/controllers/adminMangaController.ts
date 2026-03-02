import { Request, Response, NextFunction } from 'express';
import { db } from '@/db';
import { series, chapters, mangaImportProgress } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { mangaProgressService } from '@/services/mangaProgressService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import logger from '@/services/loggerService';
import { appConfig } from '@/config/appConfig';
import path from 'path';
import fs from 'fs-extra';

function extractSecondaryTitleStrings(secondaryTitles: unknown): string[] {
    if (!secondaryTitles) return [];
    let parsed: unknown = secondaryTitles;
    if (typeof secondaryTitles === 'string') {
        try {
            parsed = JSON.parse(secondaryTitles);
        } catch {
            parsed = secondaryTitles;
        }
    }
    const titles: string[] = [];
    const visit = (value: unknown) => {
        if (!value) return;
        if (typeof value === 'string') {
            const t = (value as string).trim();
            if (t) titles.push(t);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) visit(item);
            return;
        }
        if (typeof value === 'object') {
            const record = value as Record<string, unknown>;
            if (typeof record.title === 'string') {
                const t = (record.title as string).trim();
                if (t) titles.push(t);
                return;
            }
            for (const nested of Object.values(record)) visit(nested);
        }
    };
    visit(parsed);
    const seen = new Set<string>();
    return titles.filter((title) => {
        const key = title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function adminScraperSearch(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });
        
        const queryOverride = typeof req.query.q === 'string' ? req.query.q.trim() : null;

        const [row] = await db
            .select({
                title: series.title,
                romanizedTitle: series.romanizedTitle,
                nativeTitle: series.nativeTitle,
                secondaryTitles: series.secondaryTitles,
            })
            .from(series)
            .where(eq(series.id, id))
            .limit(1);

        if (!row) return res.status(404).json({ error: 'Manga not found' });
        

        const mangaName = queryOverride || row.title || '';
        if (!mangaName) return res.status(400).json({ error: 'No search query (provide ?q= or ensure series has a title)' });
        
        const secondaryTitles = extractSecondaryTitleStrings(row.secondaryTitles);
        const sources = await scraperManager.searchAllSources(mangaName, {
            seriesId: id,
            romanizedTitle: row.romanizedTitle || undefined,
            nativeTitle: row.nativeTitle || undefined,
            secondaryTitles: secondaryTitles.length > 0 ? secondaryTitles : undefined,
        }, 10);

        return res.json({ sources });
    } catch (error) {
        logger.error(`Admin scraper search failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

export async function adminSetSource(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });
        
        const { scraperId, scraperUrl } = req.body || {};
        if (typeof scraperId !== 'string' || typeof scraperUrl !== 'string' || !scraperId.trim() || !scraperUrl.trim()) {
            return res.status(400).json({ error: 'scraperId and scraperUrl are required' });
        }

        await mangaProgressService.setScraperMatch(id, scraperId.trim(), scraperUrl.trim());
        return res.json({ success: true, seriesId: id });
    } catch (error) {
        logger.error(`Admin set source failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

export async function adminAddSecondaryTitle(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });
        
        const { language, type, title } = req.body || {};
        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'title is required' });
        }

        const lang = typeof language === 'string' && language.trim() ? language.trim() : 'en';
        const typeVal = typeof type === 'string' && type.trim() ? type.trim() : 'official';

        const [row] = await db
            .select({ secondaryTitles: series.secondaryTitles })
            .from(series)
            .where(eq(series.id, id))
            .limit(1);

        if (!row) return res.status(404).json({ error: 'Manga not found' });
        
        let current = row.secondaryTitles as Record<string, Array<{ type?: string; title: string; language?: string }>> | null;
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            current = {};
        }

        const entry = { type: typeVal, title: title.trim(), language: lang };
        const langArray = Array.isArray(current[lang]) ? [...current[lang]] : [];
        langArray.push(entry);
        const updated = { ...current, [lang]: langArray };

        await db
            .update(series)
            .set({ secondaryTitles: updated })
            .where(eq(series.id, id));

        return res.json({ success: true, seriesId: id, secondaryTitles: updated });
    } catch (error) {
        logger.error(`Admin add secondary title failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

export async function adminTriggerRescan(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });
        
        await mangaOrchestratorService.enqueueSingleRescan(id);
        return res.json({ success: true, seriesId: id, message: 'Rescan queued' });
    } catch (error) {
        logger.error(`Admin trigger rescan failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

/** Admin: get current scraper source, scan status, and last error from manga_import_progress. */
export async function adminGetSource(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        const [progress, scanStatus, row] = await Promise.all([
            mangaProgressService.getProgress(id),
            mangaOrchestratorService.getScanStatus(id),
            db.query.mangaImportProgress.findFirst({
                where: eq(mangaImportProgress.seriesId, id),
            }),
        ]);

        const scraperId = row?.scraperId ?? progress?.scraperId ?? null;
        const scraperUrl = row?.scraperUrl ?? progress?.scraperUrl ?? null;

        return res.json({
            scraperId,
            scraperUrl,
            status: progress?.status ?? null,
            errorMessage: progress?.errorMessage ?? null,
            scanStatus: scanStatus.scanStatus,
            isQueued: scanStatus.isQueued,
        });
    } catch (error) {
        logger.error(`Admin get source failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

/** Admin: clear scraper source so next scan re-searches instead of using saved URL. */
export async function adminClearSource(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        await mangaProgressService.clearScraperMatch(id);
        return res.json({ success: true, seriesId: id, message: 'Source cleared' });
    } catch (error) {
        logger.error(`Admin clear source failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

/** Admin: update series metadata (title, description, status, etc.) */
export async function adminUpdateSeries(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        const body = req.body || {};
        const allowed: (keyof typeof series.$inferSelect)[] = [
            'title', 'nativeTitle', 'romanizedTitle', 'description', 'status',
            'year', 'contentRating', 'type', 'totalChapters', 'finalVolume', 'finalChapter',
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
            if (key in body) {
                const val = (body as Record<string, unknown>)[key];
                if (val === null || val === '' || typeof val === 'string' || typeof val === 'number') {
                    updates[key] = val === '' ? null : val;
                }
            }
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        updates.lastUpdatedAt = new Date();

        const [updated] = await db
            .update(series)
            .set(updates as any)
            .where(eq(series.id, id))
            .returning();
        if (!updated) return res.status(404).json({ error: 'Series not found' });
        return res.json({ success: true, seriesId: id, series: updated });
    } catch (error) {
        logger.error(`Admin update series failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

/** Admin: cancel active scan for a series. Removes jobs from queues and Redis progress. */
export async function adminCancelScan(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        const removed = await mangaOrchestratorService.cancelScan(id);
        await mangaProgressService.cancelAndCleanup(id);
        return res.json({ success: true, seriesId: id, message: 'Scan cancelled', removed });
    } catch (error) {
        logger.error(`Admin cancel scan failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}

/** Admin: delete chapters by IDs. Requires confirmation via body.confirm. Deletes DB rows and storage files. */
export async function adminDeleteChapters(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        const { chapterIds, confirm } = req.body || {};
        if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
            return res.status(400).json({ error: 'chapterIds array is required' });
        }
        if (confirm !== true) {
            return res.status(400).json({ error: 'confirm: true is required to delete chapters' });
        }

        const validIds = chapterIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => !isNaN(n) && n > 0);
        if (validIds.length === 0) return res.status(400).json({ error: 'No valid chapter IDs' });

        const rows = await db
            .select({ id: chapters.id, seriesId: chapters.seriesId, storagePrefix: chapters.storagePrefix })
            .from(chapters)
            .where(eq(chapters.seriesId, id));

        const toDelete = rows.filter((r) => validIds.includes(r.id));
        if (toDelete.length === 0) return res.status(404).json({ error: 'No matching chapters found for this series' });

        const storageRoot = appConfig.scraper?.chapterStorageRoot;
        const storageFailed: string[] = [];
        if (storageRoot) {
            for (const ch of toDelete) {
                if (ch.storagePrefix) {
                    const dir = path.join(storageRoot, ch.storagePrefix);
                    try {
                        await fs.remove(dir);
                        logger.info(`Deleted chapter storage: ${dir}`, { service: 'adminMangaController' });
                    } catch (err) {
                        const msg = (err as Error).message;
                        logger.warn(`Failed to delete chapter storage ${dir}: ${msg}`, { service: 'adminMangaController' });
                        storageFailed.push(`${ch.storagePrefix}: ${msg}`);
                    }
                }
            }
        }

        await db.delete(chapters).where(inArray(chapters.id, toDelete.map((c) => c.id)));
        logger.info(`Deleted ${toDelete.length} chapters for series ${id}`, { service: 'adminMangaController' });
        return res.json({
            success: true,
            seriesId: id,
            deletedCount: toDelete.length,
            ...(storageFailed.length > 0 && { storageFailed, storageFailedCount: storageFailed.length }),
        });
    } catch (error) {
        logger.error(`Admin delete chapters failed: ${(error as Error).message}`, { service: 'adminMangaController' });
        return next(error);
    }
}
