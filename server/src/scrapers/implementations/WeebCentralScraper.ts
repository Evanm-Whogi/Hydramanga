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

const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;

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
    private readonly metadata: ScraperMetadata = {
        id: 'weebcentral',
        name: 'WeebCentral',
        baseUrl: 'https://weebcentral.com',
        priority: appConfig.scraper.weebCentral.priority,
        enabled: appConfig.scraper.weebCentral.enabled,
    };

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

    async* scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        coverUrl?: string,
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        const page = await context.newPage();

        try {
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

            logger.info(
                `[WeebCentral] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                { service: 'weebCentralScraper' }
            );

            await page.goto(bestMatch.href, { waitUntil: 'domcontentloaded' });

            // Click "Show All" button if present
            const showAllBtnSelector = 'button[hx-get*="full-chapter-list"]';
            const btn = await page.$(showAllBtnSelector);
            if (btn) {
                await btn.click();
                await page.waitForSelector(showAllBtnSelector, {
                    state: 'detached',
                    timeout: 15000,
                });
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
            await browser.close().catch(() => {});
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        const page = await context.newPage();

        try {
            // Block ads, trackers, and heavy resources
            await page.route('**/*', route => {
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

            // Wait for images to load
            await page.waitForTimeout(1000);

            try {
                await page.waitForSelector('img[alt*="Page"]', { timeout: 5000 });
            } catch (err) {
                logger.warn(
                    `[WeebCentral] Image selector not found immediately for ${folderName}, continuing anyway`,
                    { service: 'weebCentralScraper' }
                );
            }

            await page.evaluate(() => window.scrollBy(0, 500));

            // Extract image URLs - Try primary selector
            let finalImages = await page
                .evaluate(() => {
                    return Array.from(document.querySelectorAll('img.maw-w-full'))
                        .map(
                            img =>
                                img.getAttribute('data-src') || img.getAttribute('src')
                        )
                        .filter(
                            (src): src is string =>
                                !!src &&
                                (src.includes('planeptune.us') ||
                                    src.includes('googleusercontent'))
                        );
                })
                .catch((err: any) => {
                    logger.warn(
                        `[WeebCentral] Primary selector failed for ${folderName}: ${err.message}`,
                        { service: 'weebCentralScraper' }
                    );
                    return [];
                });

            // Fallback selector
            if (finalImages.length === 0) {
                finalImages = await page
                    .evaluate(() => {
                        return Array.from(
                            document.querySelectorAll('img[alt*="Page"]')
                        )
                            .map(img => img.getAttribute('src'))
                            .filter(
                                (src): src is string => !!src && src.startsWith('http')
                            );
                    })
                    .catch((err: any) => {
                        logger.warn(
                            `[WeebCentral] Fallback selector failed for ${folderName}: ${err.message}`,
                            { service: 'weebCentralScraper' }
                        );
                        return [];
                    });
            }

            logger.info(
                `[WeebCentral] Found ${finalImages.length} images for ${folderName}`,
                { service: 'weebCentralScraper' }
            );

            if (finalImages.length === 0) {
                throw new Error(`No images found at ${url}`);
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
            await browser.close().catch(() => {});
        }
    }

    /**
     * Download images to local filesystem
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

        for (let i = 0; i < images.length; i++) {
            const filePath = path.join(
                dir,
                `${(i + 1).toString().padStart(2, '0')}.jpg`
            );

            try {
                const response = await axios.get(images[i], {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    headers: {
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
                    },
                });

                fs.writeFileSync(filePath, Buffer.from(response.data));
            } catch (err: any) {
                logger.error(
                    `[WeebCentral] Failed to download image ${i + 1}: ${err.message}`,
                    { service: 'weebCentralScraper' }
                );
                throw err;
            }
        }

        return storagePrefix;
    }
}
