import { Request, Response, NextFunction } from 'express';
import { db } from '@/db';
import { series } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { mangaProgressService } from '@/services/mangaProgressService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import logger from '@/services/loggerService';

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
