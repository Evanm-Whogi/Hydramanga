/**
 * WeebCentral Scraper Implementation
 * 
 * Scraper for weebcentral.com manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - Chapter list scraping with Playwright
 * - Image download with retry logic
 * - Search API integration via WeebCentralSearcher
 * - Robust error handling and logging
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import {
    IChapterScraper,
    ScrapedChapter,
    DownloadedChapter,
    MangaSearchResult,
    SearchOptions,
    ScraperMetadata,
} from '../interfaces/IChapterScraper';
import { WeebCentralSearcher } from '@/services/weebCentralSearcher';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;
const PLACEHOLDER_FILENAME = '_placeholder.webp';
const PLACEHOLDER_PATH = path.join(STORAGE_ROOT, PLACEHOLDER_FILENAME);

/** One-time creation of shared placeholder image (no duplication on disk). */
async function ensurePlaceholderExists(): Promise<void> {
    if (fs.existsSync(PLACEHOLDER_PATH)) return;
    try {
        if (!fs.existsSync(STORAGE_ROOT)) {
            fs.mkdirSync(STORAGE_ROOT, { recursive: true });
        }
        const buffer = await sharp({
            create: {
                width: 400,
                height: 600,
                channels: 3,
                background: { r: 45, g: 45, b: 48 },
            },
        })
            .webp({ quality: 80, effort: 1 })
            .toBuffer();
        fs.writeFileSync(PLACEHOLDER_PATH, buffer);
        logger.info('[WeebCentral] Created shared placeholder image for missing pages', { service: 'weebCentralScraper' });
    } catch (err: any) {
        logger.warn(`[WeebCentral] Could not create placeholder image: ${err.message}`, { service: 'weebCentralScraper' });
    }
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
 * WeebCentral Scraper
 */
export class WeebCentralScraper implements IChapterScraper {
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 5; // match queue concurrency so multiple chapters can run in parallel

    private readonly metadata: ScraperMetadata = {
        id: 'weebcentral',
        name: 'WeebCentral',
        baseUrl: 'https://weebcentral.com',
        priority: appConfig.scraper.weebCentral.priority,
        enabled: appConfig.scraper.weebCentral.enabled,
    };

    private static async getBrowser() {
        if (WeebCentralScraper.browserPool.length > 0) {
            return WeebCentralScraper.browserPool.pop();
        }
        logger.debug('[WeebCentral] Launching new browser for pool', { service: 'weebCentralScraper' });
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
            if (WeebCentralScraper.browserPool.length < WeebCentralScraper.MAX_BROWSERS) {
                WeebCentralScraper.browserPool.push(browser);
                logger.debug(`[WeebCentral] Browser returned to pool (${WeebCentralScraper.browserPool.length}/${WeebCentralScraper.MAX_BROWSERS})`, { service: 'weebCentralScraper' });
            } else {
                await browser.close().catch(() => {});
                logger.debug('[WeebCentral] Browser closed (pool full)', { service: 'weebCentralScraper' });
            }
        } catch (error) {
            logger.warn(`[WeebCentral] Error releasing browser: ${error}`, { service: 'weebCentralScraper' });
            await browser.close().catch(() => {});
        }
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // WeebCentral can handle all manga by default
        // Override this if there are specific restrictions
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        try {
            logger.info(
                `[WeebCentral] Searching for "${mangaName}"`,
                { service: 'weebCentralScraper' }
            );

            const result = await WeebCentralSearcher.findBestMatch(
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                options?.secondaryTitles,
                {
                    seriesId: options?.seriesId,
                    coverUrl: options?.coverUrl,
                    secondaryTitles: options?.secondaryTitles,
                }
            );

            if (result) {
                return {
                    href: result.href,
                    title: result.title,
                    score: result.score,
                };
            }

            return undefined;
        } catch (error) {
            logger.error(
                `[WeebCentral] Search failed for "${mangaName}": ${error}`,
                { service: 'weebCentralScraper' }
            );
            throw error;
        }
    }

    async search(query: string, options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        try {
            const results = await WeebCentralSearcher.queryAPI((query || '').trim());
            return results
                .filter((r) => r.score > 0)
                .slice(0, limit)
                .map((r) => ({ href: r.href, title: r.title, score: r.score }));
        } catch (error) {
            logger.error(`[WeebCentral] search() failed: ${error}`, { service: 'weebCentralScraper' });
            return [];
        }
    }

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
        const browser = await WeebCentralScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        const page = await context.newPage();

        try {
            let pageUrl: string;

            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
                logger.info(
                    `[WeebCentral] Using saved URL for "${mangaName}"`,
                    { service: 'weebCentralScraper' }
                );
            } else {
                // Find best manga series match
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
                        `[WeebCentral] ${error}`,
                        { service: 'weebCentralScraper' }
                    );
                    throw new Error(error);
                }

                pageUrl = bestMatch.href;
                logger.info(
                    `[WeebCentral] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                    { service: 'weebCentralScraper' }
                );
            }

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

            // Capture initial chapter count before potentially expanding the list
            const initialChapterCount = await page.evaluate(() => {
                return document.querySelectorAll('#chapter-list a[href*="/chapters/"]').length;
            });

            // Click "Show All" button if present and wait for chapter list to grow
            const showAllBtnSelector = 'button[hx-get*="full-chapter-list"]';
            const btn = await page.$(showAllBtnSelector);
            if (btn) {
                logger.debug(
                    `[WeebCentral] Clicking "Show All" button (initial chapters: ${initialChapterCount})`,
                    { service: 'weebCentralScraper' }
                );

                await btn.click();

                try {
                    await page.waitForFunction(
                        (prevCount: number) =>
                            document.querySelectorAll('#chapter-list a[href*="/chapters/"]').length > prevCount,
                        initialChapterCount,
                        { timeout: 15000 }
                    );
                } catch (err: any) {
                    logger.warn(
                        `[WeebCentral] Chapter list did not grow after "Show All" within timeout: ${err?.message ?? err}`,
                        { service: 'weebCentralScraper' }
                    );
                }
            }

            // Extract chapter list
            const chapterRows = await page.evaluate(() => {
                const links = Array.from(
                    document.querySelectorAll('#chapter-list a[href*="/chapters/"]')
                );
                return links
                    .map(anchor => {
                        const url = (anchor as HTMLAnchorElement).href;
                        const textElement = anchor.querySelector('span.grow span:not([x-show])');
                        const fullTitle = textElement?.textContent?.trim() || '';
                        return { url, title: fullTitle };
                    })
                    .reverse();
            });

            logger.info(
                `[WeebCentral] Scraper found ${chapterRows.length} total chapters`,
                { service: 'weebCentralScraper' }
            );

            // Process and yield chapters
            for (const chap of chapterRows) {
                const parsed = ChapterNumberParser.parse(chap.title);

                // Skip if chapter already exists
                if (await checkExists(parsed.number)) {
                    logger.debug(
                        `[WeebCentral] Skipping chapter ${parsed.number} - already exists`,
                        { service: 'weebCentralScraper' }
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
            await WeebCentralScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const browser = await WeebCentralScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        const page = await context.newPage();

        try {
            // Block ads, trackers, and heavy resources
            await page.route('**/*', (route: any) => {
                const request = route.request();
                const resourceType = request.resourceType();

                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    route.continue();
                } else if (['script'].includes(resourceType)) {
                    // Allow critical scripts but block ad/tracker scripts
                    const requestUrl = request.url();
                    if (
                        requestUrl.includes('google') ||
                        requestUrl.includes('facebook') ||
                        requestUrl.includes('ad') ||
                        requestUrl.includes('tracker')
                    ) {
                        route.abort();
                    } else {
                        route.continue();
                    }
                } else {
                    route.continue();
                }
            });

            // Retry logic for navigation
            let lastError: any;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    logger.info(
                        `[WeebCentral] Navigating to ${folderName} (attempt ${attempt}/3)`,
                        { service: 'weebCentralScraper' }
                    );

                    // Use domcontentloaded to avoid timeout; networkidle often never fires on ad-heavy pages
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 45000,
                    });

                    logger.info(
                        `[WeebCentral] Successfully navigated to ${folderName}`,
                        { service: 'weebCentralScraper' }
                    );

                    break; // Success
                } catch (err: any) {
                    lastError = err;
                    if (
                        err.message.includes('ERR_ABORTED') ||
                        err.message.includes('net::')
                    ) {
                        logger.warn(
                            `[WeebCentral] Navigation error on attempt ${attempt}: ${err.message}`,
                            { service: 'weebCentralScraper' }
                        );

                        if (attempt < 3) {
                            await page.waitForTimeout(2000 * attempt); // Exponential backoff
                            // Try with a fresh page context
                            await page.close().catch(() => {});
                            const newPage = await context.newPage();
                            Object.assign(page, newPage);
                        }
                    } else {
                        throw err;
                    }
                }
            }

            if (lastError && lastError.message.includes('ERR_ABORTED')) {
                throw new Error(
                    `Failed to load chapter page after 3 attempts: ${lastError.message}`
                );
            }

            // Prefer dedicated /images endpoint (same as other WeebCentral tools) — more reliable than reader DOM
            const imagesUrl = `${url.replace(/\/$/, '')}/images?reading_style=long_strip`;
            let finalImages: string[] = [];

 try {
                await page.goto(imagesUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 25000,
                });
                
                // Short timeout: if /images doesn't show imgs quickly, fall back to reader
                await page.waitForSelector('img', { timeout: 5000, state: 'attached' });
                await page.waitForTimeout(1500);

                finalImages = await page.evaluate((base: string) => {
                    const resolve = (href: string) => {
                        if (!href || href.includes('broken_image')) return '';
                        if (href.startsWith('http')) return href;
                        try {
                            return new URL(href, base).href;
                        } catch {
                            return '';
                        }
                    };
                    return Array.from(document.querySelectorAll('img'))
                        .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
                        .map(src => resolve(src || ''))
                        .filter((href): href is string => !!href && href.startsWith('http'));
                }, imagesUrl);
                if (finalImages.length > 0) {
                    logger.debug(
                        `[WeebCentral] Got ${finalImages.length} images from /images endpoint`,
                        { service: 'weebCentralScraper' }
                    );
                }
            } catch (err: any) {
                 logger.debug(
                    `[WeebCentral] /images endpoint unavailable (${err?.message?.split('\n')[0] ?? err}), using reader page`,
                    { service: 'weebCentralScraper' }
                );
            }

            // Fallback: extract from reader page with retry and progressive loading
            let extractAttempt = 0;
            const maxExtractAttempts = 4;

            while (finalImages.length === 0 && extractAttempt < maxExtractAttempts) {
                extractAttempt++;

                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 45000,
                });

                logger.info(
                    `[WeebCentral] Attempting to extract images from reader (attempt ${extractAttempt}/${maxExtractAttempts})`,
                    { service: 'weebCentralScraper' }
                );

                const initialWait = 2000 + (extractAttempt - 1) * 1500;
                await page.waitForTimeout(initialWait);

                // Progressive scrolling to trigger lazy loading
                try {
                    const scrollSteps = 3;
                    const scrollAmount = await page.evaluate(() => window.innerHeight * 0.8);
                    for (let i = 0; i < scrollSteps; i++) {
                        await page.evaluate((amount: number) => window.scrollBy(0, amount), scrollAmount);
                        await page.waitForTimeout(400);
                    }
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.waitForTimeout(300);
                } catch (err) {
                    logger.warn(
                        `[WeebCentral] Scroll action failed: ${err}`,
                        { service: 'weebCentralScraper' }
                    );
                }

                const imageSelector = 'img[alt*="Page"], img.maw-w-full, img[data-src][src*="http"], main img[src^="http"]';
                try {
                    await page.waitForSelector(imageSelector, {
                        timeout: 12000,
                        state: 'visible',
                    });
                    await page.waitForTimeout(1200);
                } catch (err) {
                    logger.warn(
                        `[WeebCentral] Image selector wait timed out on attempt ${extractAttempt}`,
                        { service: 'weebCentralScraper' }
                    );
                    if (extractAttempt < maxExtractAttempts) {
                        await page.waitForTimeout(2000 * extractAttempt);
                        continue;
                    }
                }

                // Primary: reader img.maw-w-full / known CDNs
                finalImages = await page
                    .evaluate(() => {
                        const imgs = document.querySelectorAll('img.maw-w-full, img[alt*="Page"], main img');
                        return Array.from(imgs)
                            .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
                            .filter(
                                (src): src is string =>
                                    !!src &&
                                    src.startsWith('http') &&
                                    !src.includes('broken_image') &&
                                    (src.includes('planeptune.us') ||
                                        src.includes('googleusercontent') ||
                                        src.includes('lh3.google') ||
                                        /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src))
                            );
                    })
                    .catch(() => []);

                // Fallback: any img in main with http src
                if (finalImages.length === 0) {
                    finalImages = await page
                        .evaluate(() => {
                            const imgs = document.querySelectorAll('img[src^="http"], img[data-src^="http"]');
                            return Array.from(imgs)
                                .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
                                .filter(
                                    (src): src is string =>
                                        !!src &&
                                        src.startsWith('http') &&
                                        !src.includes('broken_image')
                                );
                        })
                        .catch(() => []);
                }

                if (finalImages.length === 0 && extractAttempt < maxExtractAttempts) {
                    logger.warn(
                        `[WeebCentral] No images on attempt ${extractAttempt}, retrying...`,
                        { service: 'weebCentralScraper' }
                    );
                    await page.waitForTimeout(2000 * extractAttempt);
                }
            }

            logger.info(
                `[WeebCentral] Found ${finalImages.length} images for ${folderName} after ${extractAttempt} attempt(s)`,
                { service: 'weebCentralScraper' }
            );

            if (finalImages.length === 0) {
                throw new Error(`No images found at ${url} after ${maxExtractAttempts} attempts`);
            }

            // Download images
            const storagePrefix = await this.downloadImages(
                finalImages,
                seriesId,
                chapterNumber,
                url
            );

            return {
                storagePrefix,
                pageCount: finalImages.length,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await WeebCentralScraper.releaseBrowser(browser);
        }
    }

    /**
     * Write a symlink to the shared placeholder for a given page slot (avoids duplicating the image on disk).
     * Removes any existing file at the path first (e.g. partial/corrupt file from a failed download attempt).
     */
    private async writePlaceholderSlot(dir: string, pageIndex: number): Promise<void> {
        await ensurePlaceholderExists();
        const filePath = path.join(dir, `${(pageIndex + 1).toString().padStart(2, '0')}.webp`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (!fs.existsSync(PLACEHOLDER_PATH)) {
            logger.warn('[WeebCentral] Placeholder image missing; page slot will be empty', { service: 'weebCentralScraper' });
            return;
        }
        const relativeTarget = path.relative(dir, PLACEHOLDER_PATH);
        fs.symlinkSync(relativeTarget, filePath);
        logger.debug(`[WeebCentral] Using placeholder for page ${pageIndex + 1}`, { service: 'weebCentralScraper' });
    }

    /**
     * Download images to local filesystem (batched parallel, short delay between batches to avoid CDN rate limits).
     * When the provider uses a broken/fallback image or download fails, a symlink to a shared placeholder is used instead of failing the chapter.
     */
    private async downloadImages(
        images: string[], seriesId: number, chapterNumber: string, referer: string): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        const dir = path.join(STORAGE_ROOT, storagePrefix);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const batchSize = 10;
        const headers = {
            Referer: referer,
            'User-Agent': appConfig.scraper.weebCentral.userAgent,
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            Pragma: 'no-cache',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
        };

        const maxDownloadRetries = 3;
        const retryDelayMs = 1000;

        const downloadOne = async (imageUrl: string, i: number) => {
            if (imageUrl.includes('broken_image')) {
                await this.writePlaceholderSlot(dir, i);
                return;
            }

            const filePath = path.join(dir, `${(i + 1).toString().padStart(2, '0')}.webp`);
            let lastError: Error | undefined;

            for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
                try {
                    const response = await axios.get(imageUrl, {
                        responseType: 'stream',
                        timeout: 15000,
                        headers,
                    });

                    const transformer = sharp({ failOn: 'none' })
                        .resize({
                            width: 2500,
                            height: 16383,
                            fit: 'inside',
                            withoutEnlargement: true,
                            fastShrinkOnLoad: true,
                        })
                        .webp({
                            quality: 75,
                            effort: 2,
                            smartSubsample: true,
                        });

                    await pipeline(
                        response.data,
                        transformer,
                        createWriteStream(filePath)
                    );
                    return; // success
                } catch (err: any) {
                    lastError = err;
                    if (attempt < maxDownloadRetries) {
                        const delay = retryDelayMs * Math.pow(2, attempt - 1);
                        logger.warn(
                            `[WeebCentral] Image ${i + 1} attempt ${attempt}/${maxDownloadRetries} failed: ${err.message}. Retrying in ${delay}ms…`,
                            { service: 'weebCentralScraper' }
                        );
                        await new Promise((resolve) => setTimeout(resolve, delay));
                    }
                }
            }

            logger.warn(
                `[WeebCentral] Failed to download image ${i + 1} after ${maxDownloadRetries} attempts, using placeholder: ${lastError?.message}`,
                { service: 'weebCentralScraper' }
            );
            await this.writePlaceholderSlot(dir, i);
        };

        for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, images.length);
            const batch = images.slice(batchStart, batchEnd);
            await Promise.all(
                batch.map((imageUrl, j) => downloadOne(imageUrl, batchStart + j))
            );
            if (batchEnd < images.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return storagePrefix;
    }
}