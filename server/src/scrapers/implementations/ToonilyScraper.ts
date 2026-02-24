/**
 * Toonily Scraper Implementation
 *
 * Scraper for toonily.com manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 *
 * Features:
 * - URL-based search (no API) with Playwright
 * - Chapter list scraping from series page
 * - "Load All Images At Once" toggle to bypass lazy loading
 * - Image download with retry logic and parallel batching
 * - Robust error handling and logging
 *
 * Site Structure:
 * - Base URL: https://toonily.com
 * - Search URL: https://toonily.com/search/{slug}  (slug = lowercased, hyphenated title)
 * - Series URL: https://toonily.com/serie/{serie-slug}/
 * - Chapter URL: https://toonily.com/serie/{serie-slug}/{chapter-slug}/
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import http from 'http';
import https from 'https';
import {
    IChapterScraper,
    ScrapedChapter,
    DownloadedChapter,
    MangaSearchResult,
    SearchOptions,
    ScraperMetadata,
} from '../interfaces/IChapterScraper';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;
const SITE_BASE = 'https://toonily.com';

/**
 * Convert a manga title into a Toonily search slug.
 *
 * Rules (derived from observed URL patterns):
 *  - Lowercase the entire string
 *  - Remove any character that is NOT a letter, digit, apostrophe, space, or hyphen
 *  - Replace runs of whitespace with a single hyphen
 *  - Collapse consecutive hyphens into one
 *  - Strip leading / trailing hyphens
 *
 * Examples:
 *  "The Lucky Guy"                              → "the-lucky-guy"
 *  "a pervert's daily life"                     → "a-pervert's-daily-life"
 *  "Under Observation: My First Loves and I"    → "under-observation-my-first-loves-and-i"
 */
function titleToSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9'\s-]/g, '')  // strip special chars except apostrophe, space, hyphen
        .replace(/\s+/g, '-')            // spaces → hyphens
        .replace(/-+/g, '-')             // collapse multiple hyphens
        .replace(/^-+|-+$/g, '');        // trim leading / trailing hyphens
}

/**
 * Calculate title similarity score (0-100)
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
    if (title1.toLowerCase() === title2.toLowerCase()) {
        return 100;
    }

    const normalize = (s: string) =>
        s
            .replace(/[^\w\s]/g, '')
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 0);

    const words1 = normalize(title1);
    const words2 = normalize(title2);

    if (words1.length === 0 || words2.length === 0) {
        return 0;
    }

    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
}

/**
 * Sanitize folder/file names
 */
const safeName = (val: string): string => {
    const cleaned = (val || 'chapter')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return cleaned || 'chapter';
};

/**
 * Toonily Scraper
 * Uses Playwright for search, chapter discovery, and image extraction
 */
export class ToonilyScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'toonily',
        name: 'Toonily',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.toonily.priority,
        enabled: appConfig.scraper.toonily.enabled,
    };

    // Browser pool for reusing browser instances
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 5;

    private static readonly httpAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 30000,
    });

    private static readonly httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 30000,
    });

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.toonily.timeout,
        httpAgent: ToonilyScraper.httpAgent,
        httpsAgent: ToonilyScraper.httpsAgent,
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }


    private static async getBrowser() {
        if (ToonilyScraper.browserPool.length > 0) {
            return ToonilyScraper.browserPool.pop();
        }

        logger.debug('[Toonily] Launching new browser for pool', { service: 'toonilyScraper' });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;

        try {
            if (!browser.isConnected()) {
                await browser.close().catch(() => {});
                return;
            }

            if (ToonilyScraper.browserPool.length < ToonilyScraper.MAX_BROWSERS) {
                ToonilyScraper.browserPool.push(browser);
                logger.debug(
                    `[Toonily] Browser returned to pool (${ToonilyScraper.browserPool.length}/${ToonilyScraper.MAX_BROWSERS})`,
                    { service: 'toonilyScraper' }
                );
            } else {
                await browser.close().catch(() => {});
                logger.debug('[Toonily] Browser closed (pool full)', { service: 'toonilyScraper' });
            }
        } catch (error) {
            logger.warn(`[Toonily] Error releasing browser: ${error}`, { service: 'toonilyScraper' });
            await browser.close().catch(() => {});
        }
    }


    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return true;
    }

    /**
     * Search Toonily for the best matching manga.
     *
     * For each title variant we build a URL like:
     *   https://toonily.com/search/under-observation-my-first-loves-and-i
     * Then parse the result page for `div.page-item-detail` entries and
     * score them by title similarity.
     */
    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        const browser = await ToonilyScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.toonily.userAgent,
        });
        await context.addCookies([{ name: 'toonily-mature', value: '1', domain: 'toonily.com', path: '/' }]);
        const page = await context.newPage();

        try {
            const variants = [
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                ...(options?.secondaryTitles || []),
            ].filter((v): v is string => !!v && v.length > 0);

            logger.info(
                `[Toonily] Trying ${variants.length} search variant(s)`,
                { service: 'toonilyScraper' }
            );

            for (const variant of variants) {
                const slug = titleToSlug(variant);
                const searchUrl = `${SITE_BASE}/search/${encodeURIComponent(slug)}`;

                logger.info(
                    `[Toonily] Searching for "${variant}" → ${searchUrl}`,
                    { service: 'toonilyScraper' }
                );

                try {
                    await page.goto(searchUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });

                    // Wait briefly for results to render
                    await page.waitForTimeout(500);

                    // Extract search results
                    const results: Array<{ href: string; title: string }> = await page.evaluate(() => {
                        const items = Array.from(
                            document.querySelectorAll('div.page-item-detail.manga')
                        );

                        return items.map(item => {
                            // Title anchor inside post-title
                            const titleAnchor = item.querySelector<HTMLAnchorElement>(
                                'div.post-title a'
                            );
                            // Thumbnail anchor carries the canonical title attribute
                            const thumbAnchor = item.querySelector<HTMLAnchorElement>(
                                'div.item-thumb a[title]'
                            );

                            const title =
                                titleAnchor?.textContent?.trim() ||
                                thumbAnchor?.getAttribute('title') ||
                                '';
                            const href =
                                titleAnchor?.href || thumbAnchor?.href || '';

                            return { href, title };
                        }).filter(r => r.href && r.title);
                    });

                    logger.info(
                        `[Toonily] Found ${results.length} result(s) for variant "${variant}"`,
                        { service: 'toonilyScraper' }
                    );

                    if (results.length === 0) {
                        continue;
                    }

                    // Score each result against the variant title
                    const scored = results
                        .map(r => ({
                            href: r.href,
                            title: r.title,
                            score: calculateTitleSimilarity(r.title, variant),
                        }))
                        .filter(r => r.score >= 70)
                        .sort((a, b) => b.score - a.score);

                    if (scored.length > 0) {
                        const best = scored[0];
                        logger.info(
                            `[Toonily] Best match: "${best.title}" score=${best.score} → ${best.href}`,
                            { service: 'toonilyScraper' }
                        );
                        return best;
                    }

                    logger.debug(
                        `[Toonily] No result above threshold (70) for variant "${variant}"`,
                        { service: 'toonilyScraper' }
                    );
                } catch (error: any) {
                    logger.debug(
                        `[Toonily] Search failed for variant "${variant}": ${error?.message || error}`,
                        { service: 'toonilyScraper' }
                    );
                }
            }

            logger.warn(
                `[Toonily] Could not find manga for "${mangaName}"`,
                { service: 'toonilyScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[Toonily] Search error: ${error}`,
                { service: 'toonilyScraper' }
            );
            throw error;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ToonilyScraper.releaseBrowser(browser);
        }
    }

    /**
     * Scrape chapter list from the series page and yield each new chapter.
     *
     * Chapter list HTML:
     *   <ul class="main version-chap no-volumn">
     *     <li class="wp-manga-chapter">
     *       <a href="https://toonily.com/serie/.../chapter-1/">Chapter 1</a>
     *     </li>
     *   </ul>
     *
     * Chapters are listed newest-first on the page; we reverse so we yield
     * oldest-first (consistent with other scrapers).
     */
    async* scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        coverUrl?: string,
        mangaPageUrl?: string,
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await ToonilyScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.toonily.userAgent,
        });
        await context.addCookies([{ name: 'toonily-mature', value: '1', domain: 'toonily.com', path: '/' }]);
        const page = await context.newPage();

        try {
            let pageUrl: string;

            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
                logger.info(
                    `[Toonily] Using saved URL for "${mangaName}"`,
                    { service: 'toonilyScraper' }
                );
            } else {
                const bestMatch = await this.findBestMatch(mangaName, {
                    seriesId,
                    romanizedTitle,
                    nativeTitle,
                    secondaryTitles,
                    coverUrl,
                });

                if (!bestMatch) {
                    throw new Error(`[Toonily] Could not find manga link for "${mangaName}"`);
                }

                pageUrl = bestMatch.href;
                logger.info(
                    `[Toonily] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                    { service: 'toonilyScraper' }
                );
            }

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for chapter list
            try {
                await page.waitForSelector('ul.main.version-chap', { timeout: 15000 });
            } catch {
                logger.warn(
                    `[Toonily] Chapter list selector not found, proceeding anyway`,
                    { service: 'toonilyScraper' }
                );
            }

            // Extract chapter links
            // The page renders newest chapters first; we reverse to yield oldest first.
            const chapterRows: Array<{ url: string; title: string }> = await page.evaluate(() => {
                const items = Array.from(
                    document.querySelectorAll('ul.main.version-chap li.wp-manga-chapter a')
                );
                return items
                    .map(a => ({
                        url: (a as HTMLAnchorElement).href,
                        title: a.textContent?.trim() || '',
                    }))
                    .filter(c => c.url && c.title)
                    .reverse(); // oldest → newest
            });

            logger.info(
                `[Toonily] Found ${chapterRows.length} chapter(s)`,
                { service: 'toonilyScraper' }
            );

            for (const chap of chapterRows) {
                const parsed = ChapterNumberParser.parse(chap.title);

                if (await checkExists(parsed.number)) {
                    logger.debug(
                        `[Toonily] Skipping chapter ${parsed.number} - already exists`,
                        { service: 'toonilyScraper' }
                    );
                    continue;
                }

                yield {
                    url: chap.url,
                    title: parsed.title,
                    number: parsed.number,
                    isSpecial: parsed.isSpecial,
                    specialType: parsed.specialType,
                };
            }
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ToonilyScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download a single chapter.
     *
     * Steps:
     *  1. Navigate to chapter URL
     *  2. Click the "LOAD ALL IMAGES AT ONCE" toggle (#btn-lazyload-controller)
     *  3. Wait for all images inside div.reading-content to have a src
     *  4. Download the images in parallel batches
     */
    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const browser = await ToonilyScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.toonily.userAgent,
        });
        await context.addCookies([{ name: 'toonily-mature', value: '1', domain: 'toonily.com', path: '/' }]);
        const page = await context.newPage();

        try {
            logger.info(
                `[Toonily] Downloading chapter ${chapterNumber} from ${url}`,
                { service: 'toonilyScraper' }
            );

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Click the "LOAD ALL IMAGES AT ONCE" toggle if present
            try {
                const toggleBtn = await page.$('#btn-lazyload-controller');
                if (toggleBtn) {
                    await toggleBtn.click();
                    logger.debug(
                        `[Toonily] Clicked "Load all images" toggle`,
                        { service: 'toonilyScraper' }
                    );
                    // Wait for the toggle to take effect
                    await page.waitForTimeout(1500);
                } else {
                    logger.debug(
                        `[Toonily] "Load all images" toggle not found, continuing without it`,
                        { service: 'toonilyScraper' }
                    );
                }
            } catch (e) {
                logger.debug(
                    `[Toonily] Toggle interaction failed: ${e}`,
                    { service: 'toonilyScraper' }
                );
            }

            // Wait for chapter images container
            try {
                await page.waitForSelector('div.reading-content', { timeout: 15000 });
            } catch {
                logger.warn(
                    `[Toonily] reading-content selector not found for chapter ${chapterNumber}`,
                    { service: 'toonilyScraper' }
                );
            }

            // Scroll through the page to trigger any remaining lazy-load
            const pageHeight = await page.evaluate(() => document.body.scrollHeight);
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            const scrollStep = viewportHeight;
            let currentScroll = 0;

            while (currentScroll < pageHeight) {
                await page.evaluate((step: number) => window.scrollBy(0, step), scrollStep);
                currentScroll += scrollStep;
                await page.waitForTimeout(30);
            }

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(200);

            // Extract image URLs from div.reading-content img.wp-manga-chapter-img
            const imageUrls: string[] = await page.evaluate(() => {
                const imgs = Array.from(
                    document.querySelectorAll<HTMLImageElement>(
                        'div.reading-content img.wp-manga-chapter-img'
                    )
                );
                return imgs
                    .map(img =>
                        img.getAttribute('data-src') ||
                        img.getAttribute('src') ||
                        ''
                    )
                    .filter(src => src.startsWith('http'));
            });

            // Deduplicate while preserving order
            const uniqueImages = [...new Set(imageUrls)];

            logger.info(
                `[Toonily] Found ${uniqueImages.length} image(s) for chapter ${chapterNumber}`,
                { service: 'toonilyScraper' }
            );

            if (uniqueImages.length === 0) {
                throw new Error(
                    `[Toonily] No images found for chapter ${chapterNumber} at ${url}`
                );
            }

            const storagePrefix = await this.downloadImages(
                uniqueImages,
                seriesId,
                chapterNumber,
                url
            );

            return {
                storagePrefix,
                pageCount: uniqueImages.length,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ToonilyScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download images to local filesystem with retry logic (parallel batches)
     */
    private async downloadImages(
        images: string[],
        seriesId: number,
        chapterNumber: string,
        referer: string
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        const dir = path.join(STORAGE_ROOT, storagePrefix);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const maxRetries = 3;
        const retryDelayMs = 1000;
        const batchSize = 10; // Number of images to download in parallel per batch

        const downloadImage = async (imageUrl: string, i: number) => {
            const filePath = path.join(
                dir,
                `${(i + 1).toString().padStart(3, '0')}.webp`
            );

            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await ToonilyScraper.axiosInstance.get(imageUrl, {
                        responseType: 'stream',
                        headers: {
                            Referer: referer,
                            'User-Agent': appConfig.scraper.toonily.userAgent,
                        },
                    });

                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const transformer = sharp({ failOn: 'none' })
                        .resize({ 
                            width: 2500,               // Cap width at a reasonable manga standard
                            height: 16383,             // Allow for long-strip vertical webtoons
                            fit: 'inside', 
                            withoutEnlargement: true,
                            fastShrinkOnLoad: true     // BIG WIN: Shrinks while reading, saves massive CPU
                        })
                        .webp({ 
                            quality: 75,               // Slightly lower quality (80 to 75) saves ~20% size
                            effort: 2,                 // BIG WIN: 2 is much faster than the default 4 or 6
                            smartSubsample: true       // Keeps text sharp in manga
                        });

                    await pipeline(
                        response.data,
                        transformer,
                        createWriteStream(filePath)
                    );

                    logger.debug(
                        `[Toonily] Downloaded image ${i + 1} (attempt ${attempt})`,
                        { service: 'toonilyScraper' }
                    );
                    return; // success
                } catch (err: any) {
                    lastError = err;
                    const delay = retryDelayMs * Math.pow(2, attempt - 1);
                    logger.warn(
                        `[Toonily] Image ${i + 1} attempt ${attempt}/${maxRetries} failed: ${err?.message}. Retrying in ${delay}ms…`,
                        { service: 'toonilyScraper' }
                    );
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            throw new Error(
                `[Toonily] Failed to download image ${i + 1} after ${maxRetries} attempts: ${lastError?.message}`
            );
        };

        // Download in batches to avoid connection pool exhaustion
        for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, images.length);
            const batch = images.slice(batchStart, batchEnd);

            await Promise.all(
                batch.map((imageUrl, localIndex) =>
                    downloadImage(imageUrl, batchStart + localIndex)
                )
            );
        }

        return storagePrefix;
    }
}
