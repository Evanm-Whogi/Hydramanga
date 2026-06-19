/**
 * AsuraComic Scraper Implementation
 *
 * Scraper for asuracomic.net manga source.
 * Follows the design patterns from MangaTaro (title similarity + axios image downloads)
 * and WeebCentral/Toonily (Playwright-based HTML scraping).
 *
 * Site structure (as of 2026-03-07):
 * - Base URL: https://asuracomic.net
 * - Search URL: https://asuracomic.net/series?page=1&name={query}
 *   Returns a grid of series cards:
 *     <div class="grid ...">
 *       <a href="series/bad-born-blood-a45325d3">
 *         ...
 *         <span class="block ... font-bold">Bad Born Blood</span>
 *       </a>
 * - Series URL: https://asuracomic.net/series/{slug}
 * - Chapter list: anchors inside the scrollable chapter list container:
 *     <div class="pl-4 pr-2 pb-4 overflow-y-auto ...">
 *       <a href="bad-born-blood-a45325d3/chapter/76"> ... </a>
 * - Chapter reader: vertical list of page images inside a content container:
 *     <div class="py-8 ...">
 *       <img src="https://gg.asuracomic.net/storage/media/...-optimized.webp" alt="chapter page 1" />
 *       ...
 *       <img src="/images/EndDesign.webp" alt="end page" />
 *     </div>
 *   The "/images/EndDesign.webp" "end" image must be filtered out.
 */

import { chromium } from 'playwright';
import axios from 'axios';
import { downloadAndStoreChapter, isNetworkRetryableError } from '../lib/chapterImageDownloader';
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

const SITE_BASE = appConfig.scraper.asuraComic.baseUrl;

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
 * Calculate title similarity (0-100)
 * Reused approach from MangaTaro / Toonily scrapers for consistent scoring.
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
 * Normalize a title/search string so minor punctuation/connector differences
 * (e.g. ":" vs "-" or multiple spaces) don't affect matching.
 */
function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value
        .replace(/[-_.]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * AsuraComic Scraper
 * Uses URL-based search with Playwright and axios-based image downloads.
 */
export class AsuraComicScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'asuracomic',
        name: 'AsuraComic',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.asuraComic.priority,
        enabled: appConfig.scraper.asuraComic.enabled,
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
        timeout: appConfig.scraper.asuraComic.timeout,
        httpAgent: AsuraComicScraper.httpAgent,
        httpsAgent: AsuraComicScraper.httpsAgent,
        headers: {
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            Pragma: 'no-cache',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    private static async getBrowser() {
        if (AsuraComicScraper.browserPool.length > 0) {
            return AsuraComicScraper.browserPool.pop();
        }

        logger.debug('[AsuraComic] Launching new browser for pool', { service: 'asuraComicScraper' });
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

            if (AsuraComicScraper.browserPool.length < AsuraComicScraper.MAX_BROWSERS) {
                AsuraComicScraper.browserPool.push(browser);
                logger.debug(
                    `[AsuraComic] Browser returned to pool (${AsuraComicScraper.browserPool.length}/${AsuraComicScraper.MAX_BROWSERS})`,
                    { service: 'asuraComicScraper' },
                );
            } else {
                await browser.close().catch(() => {});
                logger.debug('[AsuraComic] Browser closed (pool full)', { service: 'asuraComicScraper' });
            }
        } catch (error) {
            logger.warn(`[AsuraComic] Error releasing browser: ${error}`, { service: 'asuraComicScraper' });
            await browser.close().catch(() => {});
        }
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        // AsuraComic can handle all manga by default
        return true;
    }

    /**
     * Search AsuraComic for the best matching manga.
     *
     * For each title variant we build a URL like:
     *   https://asuracomic.net/series?page=1&name=Bad%20Born%20Blood
     * Then parse the result grid for links to /series/{slug} and score them.
     */
    async findBestMatch(
        mangaName: string,
        options?: SearchOptions,
    ): Promise<MangaSearchResult | undefined> {
        const browser = await AsuraComicScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.asuraComic.userAgent,
        });
        const page = await context.newPage();

        try {
            const baseVariants = [
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                ...(options?.secondaryTitles || []),
            ].filter((v): v is string => !!v && v.length > 0);

            const normalizedExtras = baseVariants
                .map(v => normalizeForSearch(v))
                .filter(v => v && !baseVariants.includes(v));

            const variants = [...baseVariants, ...normalizedExtras];

            logger.info(
                `[AsuraComic] Trying ${variants.length} search variant(s)`,
                { service: 'asuraComicScraper' },
            );

            let bestOverall: MangaSearchResult | undefined;

            for (const variant of variants) {
                const searchUrl = `${SITE_BASE}/series?page=1&name=${encodeURIComponent(variant)}`;

                logger.info(
                    `[AsuraComic] Searching for "${variant}" → ${searchUrl}`,
                    { service: 'asuraComicScraper' },
                );

                try {
                    await page.goto(searchUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });

                    // Short delay to allow any JS-based rendering to complete
                    await page.waitForTimeout(500);

                    const results: Array<{ href: string; title: string }> = await page.evaluate((siteBase: string) => {
                        const anchors = Array.from(
                            document.querySelectorAll<HTMLAnchorElement>('a[href*="series/"]'),
                        );

                        const resolveUrl = (href: string) => {
                            if (!href) return '';
                            if (href.startsWith('http')) return href;
                            try {
                                return new URL(href, siteBase).href;
                            } catch {
                                return '';
                            }
                        };

                        return anchors
                            .map(anchor => {
                                const href = anchor.getAttribute('href') || '';
                                const url = resolveUrl(href);
                                // Prefer the card title span (block + font-bold), not the badge (e.g. MANHWA)
                                const titleSpan = anchor.querySelector<HTMLElement>('span.block.font-bold');
                                const title =
                                    titleSpan?.textContent?.trim() ||
                                    anchor.textContent?.trim() ||
                                    '';
                                return { href: url, title };
                            })
                            .filter(r => r.href && r.title);
                    }, SITE_BASE);

                    logger.info(
                        `[AsuraComic] Found ${results.length} result(s) for variant "${variant}"`,
                        { service: 'asuraComicScraper' },
                    );

                    if (results.length === 0) {
                        continue;
                    }

                    const scored = results
                        .map(r => ({
                            href: r.href,
                            title: r.title,
                            score: calculateTitleSimilarity(r.title, variant),
                        }))
                        .filter(r => r.score >= 70)
                        .sort((a, b) => b.score - a.score);

                    if (scored.length === 0) {
                        continue;
                    }

                    const bestForVariant = scored[0];
                    logger.info(
                        `[AsuraComic] Best match for variant "${variant}": "${bestForVariant.title}" (score=${bestForVariant.score})`,
                        { service: 'asuraComicScraper' },
                    );

                    if (!bestOverall || bestForVariant.score > bestOverall.score) {
                        bestOverall = bestForVariant;
                    }
                } catch (error: any) {
                    logger.debug(
                        `[AsuraComic] Search failed for variant "${variant}": ${error?.message || error}`,
                        { service: 'asuraComicScraper' },
                    );
                }
            }

            if (!bestOverall) {
                logger.warn(
                    `[AsuraComic] Could not find manga for "${mangaName}"`,
                    { service: 'asuraComicScraper' },
                );
                return undefined;
            }

            return bestOverall;
        } catch (error) {
            logger.error(
                `[AsuraComic] Search error: ${error}`,
                { service: 'asuraComicScraper' },
            );
            throw error;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await AsuraComicScraper.releaseBrowser(browser);
        }
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        const browser = await AsuraComicScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.asuraComic.userAgent,
        });
        const page = await context.newPage();

        try {
            const searchUrl = `${SITE_BASE}/series?page=1&name=${encodeURIComponent(q)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(500);

            const results: Array<{ href: string; title: string }> = await page.evaluate((siteBase: string) => {
                const anchors = Array.from(
                    document.querySelectorAll<HTMLAnchorElement>('a[href*="series/"]'),
                );

                const resolveUrl = (href: string) => {
                    if (!href) return '';
                    if (href.startsWith('http')) return href;
                    try {
                        return new URL(href, siteBase).href;
                    } catch {
                        return '';
                    }
                };

                return anchors
                    .map(anchor => {
                        const href = anchor.getAttribute('href') || '';
                        const url = resolveUrl(href);
                        // Prefer the card title span (block + font-bold), not the badge (e.g. MANHWA)
                        const titleSpan = anchor.querySelector<HTMLElement>('span.block.font-bold');
                        const title =
                            titleSpan?.textContent?.trim() ||
                            anchor.textContent?.trim() ||
                            '';
                        return { href: url, title };
                    })
                    .filter(r => r.href && r.title);
            }, SITE_BASE);

            const scored = results
                .map(r => ({
                    href: r.href,
                    title: r.title,
                    score: calculateTitleSimilarity(r.title, q),
                }))
                .filter(r => r.score >= 50)
                .sort((a, b) => b.score - a.score);

            return scored.slice(0, limit);
        } catch (error) {
            logger.error(`[AsuraComic] search() failed: ${error}`, { service: 'asuraComicScraper' });
            throw error;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await AsuraComicScraper.releaseBrowser(browser);
        }
    }

    /**
     * Scrape chapter list from the series page and yield each new chapter.
     *
     * Uses the chapter list block that renders anchors with "chapter/{number}" in the href.
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
        const browser = await AsuraComicScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.asuraComic.userAgent,
        });
        const page = await context.newPage();

        try {
            let pageUrl: string;

            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
                logger.info(
                    `[AsuraComic] Using saved URL for "${mangaName}"`,
                    { service: 'asuraComicScraper' },
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
                    const error = `Could not find manga link for "${mangaName}"`;
                    logger.error(
                        `[AsuraComic] ${error}`,
                        { service: 'asuraComicScraper' },
                    );
                    throw new Error(error);
                }

                pageUrl = bestMatch.href;
                logger.info(
                    `[AsuraComic] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                    { service: 'asuraComicScraper' },
                );
            }

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait briefly for chapter list to render
            await page.waitForTimeout(1000);

            const chapterRows: Array<{ url: string; title: string }> = await page.evaluate(() => {
                const anchors = Array.from(
                    document.querySelectorAll<HTMLAnchorElement>('a[href*="chapter/"]'),
                );

                const resolveUrl = (href: string) => {
                    if (!href) return '';
                    try {
                        return new URL(href, window.location.href).href;
                    } catch {
                        return '';
                    }
                };

                return anchors
                    .map(anchor => {
                        const href = anchor.getAttribute('href') || '';
                        const url = resolveUrl(href);
                        const titleElement = anchor.querySelector<HTMLElement>('h3');
                        const title =
                            titleElement?.textContent?.trim() ||
                            anchor.textContent?.trim() ||
                            '';
                        return { url, title };
                    })
                    .filter(ch => ch.url && ch.title)
                    .reverse(); // Oldest → newest
            });

            logger.info(
                `[AsuraComic] Found ${chapterRows.length} chapter(s)`,
                { service: 'asuraComicScraper' },
            );

            for (const chap of chapterRows) {
                const parsed = ChapterNumberParser.parse(chap.title);

                if (await checkExists(parsed.number)) {
                    logger.debug(
                        `[AsuraComic] Skipping chapter ${parsed.number} - already exists`,
                        { service: 'asuraComicScraper' },
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
            await AsuraComicScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        _mangaName: string,
        folderName: string,
    ): Promise<DownloadedChapter> {
        const browser = await AsuraComicScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.asuraComic.userAgent,
        });
        const page = await context.newPage();

        try {
            logger.info(
                `[AsuraComic] Downloading chapter ${chapterNumber} from ${url}`,
                { service: 'asuraComicScraper' },
            );

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

            // Allow content and lazy-loaded images to render
            await page.waitForTimeout(2000);

            // Scroll a bit to trigger lazy loading if needed
            try {
                const scrollAmount = await page.evaluate(() => window.innerHeight * 0.8);
                for (let i = 0; i < 3; i++) {
                    await page.evaluate((amount: number) => window.scrollBy(0, amount), scrollAmount);
                    await page.waitForTimeout(400);
                }
                await page.evaluate(() => window.scrollTo(0, 0));
            } catch (err) {
                logger.debug(
                    `[AsuraComic] Scroll interaction failed: ${err}`,
                    { service: 'asuraComicScraper' },
                );
            }

            const imageUrls: string[] = await page.evaluate((siteBase: string) => {
                const container = document.querySelector<HTMLElement>('div.py-8');
                const imgs = container
                    ? Array.from(container.querySelectorAll<HTMLImageElement>('img'))
                    : Array.from(document.querySelectorAll<HTMLImageElement>('img'));

                const resolveUrl = (src: string) => {
                    if (!src) return '';
                    if (src.startsWith('http')) return src;
                    try {
                        return new URL(src, siteBase).href;
                    } catch {
                        return '';
                    }
                };

                return imgs
                    .map(img => img.getAttribute('src') || '')
                    .map(src => resolveUrl(src))
                    .filter(src => !!src && !src.includes('/images/EndDesign.webp'));
            }, SITE_BASE);

            logger.info(
                `[AsuraComic] Found ${imageUrls.length} image(s) for chapter ${chapterNumber} (${folderName})`,
                { service: 'asuraComicScraper' },
            );

            if (imageUrls.length === 0) {
                throw new Error(`No images found for AsuraComic chapter at ${url}`);
            }

            const storagePrefix = await this.downloadImages(
                imageUrls,
                seriesId,
                chapterNumber,
                url,
            );

            return {
                storagePrefix,
                pageCount: imageUrls.length,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await AsuraComicScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download images to local filesystem with retry logic (parallel batches),
     * following the same performance patterns as other scrapers.
     */
    private async downloadImages(
        images: string[],
        seriesId: number,
        chapterNumber: string,
        referer: string,
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        await downloadAndStoreChapter({
            storagePrefix,
            images,
            scraperId: this.metadata.id,
            scraperName: this.metadata.name,
            chapterUrl: referer,
            client: AsuraComicScraper.axiosInstance,
            headers: {
                Referer: referer,
                'User-Agent': appConfig.scraper.asuraComic.userAgent,
            },
            maxRedirects: 5,
            batchDelayMs: 25,
            service: 'asuraComicScraper',
            isRetryable: isNetworkRetryableError,
        });

        return storagePrefix;
    }
}

