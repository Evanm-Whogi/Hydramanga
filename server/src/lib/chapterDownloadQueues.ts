import { appConfig } from '@/config/appConfig';
import { scraperManager } from '@/scrapers';

export const CHAPTER_DOWNLOAD_QUEUE_PREFIX = 'chapterDownload-';
export const UNKNOWN_SCRAPER_QUEUE_ID = 'unknown';

/** Display/worker order for per-scraper chapter download queues. */
export const CHAPTER_DOWNLOAD_SCRAPER_IDS = [
    'weebcentral',
    'atsumoe',
    'mangataro',
    'toonily',
    'asuracomic',
    'comix',
    'kagane',
    'mangadex',
    'nhentai',
] as const;

export type ChapterDownloadScraperId = (typeof CHAPTER_DOWNLOAD_SCRAPER_IDS)[number];

export interface ChapterDownloadWorkerConfig {
    concurrency: number;
    timeout: number;
    retries: number;
    limiter: { max: number; duration: number };
}

const SCRAPER_DISPLAY_NAMES: Record<string, string> = {
    weebcentral: 'WeebCentral',
    mangadex: 'MangaDex',
    mangataro: 'MangaTaro',
    toonily: 'Toonily',
    asuracomic: 'AsuraComic',
    comix: 'Comix',
    atsumoe: 'AtsuMoe',
    kagane: 'Kagane',
    nhentai: 'nHentai',
    [UNKNOWN_SCRAPER_QUEUE_ID]: 'Unknown',
};

/** Conservative defaults for rate-sensitive sources; env vars override per scraper. */
const SCRAPER_DOWNLOAD_OVERRIDES: Record<string, Partial<Pick<ChapterDownloadWorkerConfig, 'concurrency'> & { limiterMax: number }>> = {
    mangadex: { concurrency: 1, limiterMax: 2 },
    kagane: { concurrency: 1, limiterMax: 2 },
    nhentai: { concurrency: 2, limiterMax: 4 },
};

function parseEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}

function scraperEnvKey(scraperId: string): string {
    return scraperId.toUpperCase().replace(/-/g, '_');
}

export function chapterDownloadQueueName(scraperId: string | null | undefined): string {
    const id = scraperId?.trim() || UNKNOWN_SCRAPER_QUEUE_ID;
    return `${CHAPTER_DOWNLOAD_QUEUE_PREFIX}${id}`;
}

export function isChapterDownloadQueue(queueName: string): boolean {
    return queueName.startsWith(CHAPTER_DOWNLOAD_QUEUE_PREFIX);
}

export function scraperIdFromChapterDownloadQueue(queueName: string): string | null {
    if (!isChapterDownloadQueue(queueName)) return null;
    return queueName.slice(CHAPTER_DOWNLOAD_QUEUE_PREFIX.length);
}

export function isChapterDownloadJobQueue(queueName: string): boolean {
    return isChapterDownloadQueue(queueName);
}

export function resolveChapterDownloadQueueConfig(scraperId: string): ChapterDownloadWorkerConfig {
    const defaults = appConfig.queues.chapterDownload;
    const override = SCRAPER_DOWNLOAD_OVERRIDES[scraperId];
    const envKey = scraperEnvKey(scraperId);

    return {
        concurrency: parseEnvNumber(
            `CHAPTER_DOWNLOAD_${envKey}_CONCURRENCY`,
            override?.concurrency ?? defaults.defaultConcurrency
        ),
        timeout: defaults.timeout,
        retries: defaults.retries,
        limiter: {
            max: parseEnvNumber(
                `CHAPTER_DOWNLOAD_${envKey}_RATE_MAX`,
                override?.limiterMax ?? defaults.defaultLimiter.max
            ),
            duration: parseEnvNumber(
                `CHAPTER_DOWNLOAD_${envKey}_RATE_DURATION`,
                defaults.defaultLimiter.duration
            ),
        },
    };
}

export function getChapterDownloadScraperIds(): string[] {
    const ordered: string[] = [...CHAPTER_DOWNLOAD_SCRAPER_IDS];
    const known = new Set<string>(ordered);
    for (const scraper of scraperManager.getStats().scrapers) {
        if (!known.has(scraper.id) && scraper.id !== UNKNOWN_SCRAPER_QUEUE_ID) {
            ordered.push(scraper.id);
            known.add(scraper.id);
        }
    }
    if (!known.has(UNKNOWN_SCRAPER_QUEUE_ID)) {
        ordered.push(UNKNOWN_SCRAPER_QUEUE_ID);
    }
    return ordered;
}

export function getAllChapterDownloadQueueNames(): string[] {
    return getChapterDownloadScraperIds().map((id) => chapterDownloadQueueName(id));
}

export function getChapterDownloadQueueLabel(queueName: string): string {
    const scraperId = scraperIdFromChapterDownloadQueue(queueName);
    if (!scraperId) return queueName;
    const display = SCRAPER_DISPLAY_NAMES[scraperId] ?? scraperId;
    return `Chapter Download (${display})`;
}

export function getChapterDownloadQueueDescription(queueName: string): string {
    const scraperId = scraperIdFromChapterDownloadQueue(queueName);
    if (!scraperId) return 'Chapter image downloads from sources';
    const display = SCRAPER_DISPLAY_NAMES[scraperId] ?? scraperId;
    return `Chapter image downloads via ${display}`;
}

export function getAdminQueueDisplayOrder(): string[] {
    return [
        'mangaChapterImportQueue',
        'mangaImportQueue',
        ...getAllChapterDownloadQueueNames(),
        'storageCleanupQueue',
        'seriesMigrationQueue',
        'emailQueue',
    ];
}
