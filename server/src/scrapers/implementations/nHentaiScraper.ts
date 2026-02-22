/**
 * nHentai Scraper Implementation
 * 
 * Scraper for nhentai.net manga/doujinshi source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - Gallery search via browser
 * - Page extraction (each page is a "chapter")
 * - Image download with retry logic
 * - Robust error handling and logging
 * 
 * Site Structure:
 * - Base URL: https://nhentai.net/
 * - Search: https://nhentai.net/search/?q=query
 * - Search results: div.gallery a.cover with href="/g/{id}/"
 * - Gallery pages: /g/{id}/{pageNumber}/
 * - Images: section#image-container img with src
 * - Image URLs: https://i{1-4}.nhentai.net/galleries/{galleryId}/{pageNumber}.{jpg|png}
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
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

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
 * nHentai Scraper
 */
export class NHentaiScraper implements IChapterScraper {
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 2;

    private readonly metadata: ScraperMetadata = {
        id: 'nhentai',
        name: 'nHentai',
        baseUrl: 'https://nhentai.net',
        priority: appConfig.scraper.nHentai.priority,
        enabled: appConfig.scraper.nHentai.enabled,
    };

    private static async getBrowser() {
        if (NHentaiScraper.browserPool.length > 0) {
            return NHentaiScraper.browserPool.pop();
        }
        logger.debug('[nHentai] Launching new browser for pool', { service: 'nHentaiScraper' });
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
            if (NHentaiScraper.browserPool.length < NHentaiScraper.MAX_BROWSERS) {
                NHentaiScraper.browserPool.push(browser);
                logger.debug(`[nHentai] Browser returned to pool (${NHentaiScraper.browserPool.length}/${NHentaiScraper.MAX_BROWSERS})`, { service: 'nHentaiScraper' });
            } else {
                await browser.close().catch(() => {});
                logger.debug('[nHentai] Browser closed (pool full)', { service: 'nHentaiScraper' });
            }
        } catch (error) {
            logger.warn(`[nHentai] Error releasing browser: ${error}`, { service: 'nHentaiScraper' });
            await browser.close().catch(() => {});
        }
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // nHentai can handle most queries
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        // Generate search variants
        const searchVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ].filter((v): v is string => !!v && v.trim().length > 0);

        logger.info(
            `[nHentai] Trying ${searchVariants.length} search variants`,
            { service: 'nHentaiScraper' }
        );

        const browser = await NHentaiScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
            // Try each search variant
            for (const variant of searchVariants) {
                logger.info(
                    `[nHentai] Searching for "${variant}"`,
                    { service: 'nHentaiScraper' }
                );

                const searchUrl = `https://nhentai.net/search/?q=${encodeURIComponent(variant)}`;
                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });

                await page.waitForSelector('.gallery', { timeout: 8000 }).catch(() => {});

                // Extract all gallery results and score them
                const results = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('div.gallery a.cover'))
                        .map(galleryDiv => {
                            const href = (galleryDiv as HTMLAnchorElement).href;
                            const match = href.match(/\/g\/(\d+)\//);
                            if (!match) return null;

                            const galleryId = match[1];
                            const caption = galleryDiv.querySelector('div.caption')?.textContent?.trim();
                            const title = caption || `Gallery ${galleryId}`;

                            return {
                                href: `https://nhentai.net/g/${galleryId}/`,
                                title,
                                galleryId,
                            };
                        })
                        .filter((r): r is any => r !== null);
                });

                if (results.length === 0) {
                    logger.debug(
                        `[nHentai] No galleries for variant "${variant}", trying next`,
                        { service: 'nHentaiScraper' }
                    );
                    continue;
                }

                // Score results based on title match
                const scored = results.map((result: { href: string; title: string; galleryId: string }) => {
                    const score = this.scoreMatch(result.title, variant);
                    return { ...result, score };
                }).sort((a: { score: number }, b: { score: number }) => b.score - a.score);

                const bestMatch = scored[0];
                if (bestMatch.score > 0) {
                    logger.info(
                        `[nHentai] Found ${results.length} galleries with variant "${variant}". Best match: "${bestMatch.title}" (score: ${bestMatch.score})`,
                        { service: 'nHentaiScraper' }
                    );

                    return {
                        href: bestMatch.href,
                        title: bestMatch.title,
                        score: bestMatch.score,
                    };
                }

                logger.debug(
                    `[nHentai] No good matches for variant "${variant}", trying next`,
                    { service: 'nHentaiScraper' }
                );
            }

            // No matches found after trying all variants
            logger.warn(
                `[nHentai] Could not find manga link for "${mangaName}". Variants: ${searchVariants.join(', ')}`,
                { service: 'nHentaiScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[nHentai] Search failed: ${error}`,
                { service: 'nHentaiScraper' }
            );
            return undefined;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await NHentaiScraper.releaseBrowser(browser);
        }
    }

    /**
     * Score a title based on match quality with search term
     * Higher scores = better matches
     * Prioritizes English translations
     */
    private scoreMatch(title: string, searchTerm: string): number {
        const titleLower = title.toLowerCase();
        const searchLower = searchTerm.toLowerCase().trim();

        // Check if this is an English translation (bonus: +25 points)
        const isEnglish = /\[english\]/i.test(title);
        const englishBonus = isEnglish ? 25 : 0;

        // 1. Exact match (100)
        if (titleLower === searchLower) {
            return 100 + englishBonus;
        }

        // 2. Word boundary match - search term matches as complete word(s)
        const wordBoundaryPattern = new RegExp(
            `\\b${searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
        );
        if (wordBoundaryPattern.test(titleLower)) {
            return 90 + englishBonus;
        }

        // 3. Contains search term anywhere (50)
        if (titleLower.includes(searchLower)) {
            return 50 + englishBonus;
        }

        // 4. Partial word match - search term appears as substring in title words
        const searchWords = searchLower.split(/[\s\-_]+/).filter(w => w.length > 0);
        const titleWords = titleLower.split(/[\s\-_\[\]\(\)]+/).filter(w => w.length > 0);
        
        const matchedWords = searchWords.filter(sw => 
            titleWords.some(tw => tw.includes(sw) || sw.includes(tw))
        );
        
        if (matchedWords.length > 0) {
            return 30 + (matchedWords.length * 5) + englishBonus; // 30-50+ depending on matches
        }

        // No match (0)
        return 0;
    }

    async* scrapeChapters(
        mangaName: string,
        checkExists: (num: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        coverUrl?: string
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await NHentaiScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
            // Find the gallery
            const bestMatch = await this.findBestMatch(mangaName, {
                seriesId,
                coverUrl,
                romanizedTitle,
                nativeTitle,
                secondaryTitles,
            });

            if (!bestMatch) {
                logger.error(`[nHentai] Could not find gallery for "${mangaName}"`);
                return;
            }

            const galleryMatch = bestMatch.href.match(/\/g\/(\d+)\//);
            if (!galleryMatch) {
                logger.error(`[nHentai] Invalid gallery URL: ${bestMatch.href}`);
                return;
            }

            const galleryId = galleryMatch[1];
            logger.info(
                `[nHentai] Starting scrape for gallery ${galleryId}: "${mangaName}"`,
                { service: 'nHentaiScraper' }
            );

            // Go to gallery index page (where thumbnails are displayed)
            await page.goto(bestMatch.href, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });

            await page.waitForTimeout(1500);

            // Wait for thumbnails container to be visible
            await page.waitForSelector('#thumbnail-container .thumb-container', {
                timeout: 10000,
            }).catch(() => {});

            // Click "Show all" button if it exists to load all thumbnails
            try {
                const showAllBtn = await page.$('#show-all-images-button');
                if (showAllBtn) {
                    await showAllBtn.click();
                    await page.waitForTimeout(2000); // Wait for all thumbnails to load
                }
            } catch (err) {
                // Silently continue if button not found
            }

            // Scroll page to load lazy-loaded thumbnails
            const pageCount = await page.evaluate(() => {
                return new Promise<number>((resolve) => {
                    let lastCount = 0;
                    let stableCount = 0;
                    const maxAttempts = 50;
                    let attempts = 0;

                    const scrollLoop = () => {
                        const currentCount = document.querySelectorAll('div.thumb-container').length;
                        
                        if (currentCount === lastCount) {
                            stableCount++;
                        } else {
                            stableCount = 0;
                            lastCount = currentCount;
                        }

                        if (stableCount >= 3 || attempts >= maxAttempts) {
                            // Done - count stabilized or max attempts reached
                            const finalCount = document.querySelectorAll('div.thumb-container').length;
                            resolve(finalCount);
                            return;
                        }

                        // Scroll window to trigger lazy-loading
                        window.scrollBy(0, 500);
                        attempts++;
                        setTimeout(scrollLoop, 100);
                    };

                    scrollLoop();
                });
            });

            if (pageCount === 0) {
                logger.error(`[nHentai] No pages found for gallery ${galleryId}`);
                return;
            }

            // Yield each page as a "chapter"
            for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
                const chapterNum = pageNum.toString();
                
                // Check if already exists
                if (await checkExists(chapterNum)) {
                    continue;
                }

                yield {
                    url: `${bestMatch.href}${pageNum}/`,
                    title: `Page ${pageNum}`,
                    number: chapterNum,
                    isSpecial: false,
                };
            }
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await NHentaiScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        chapterTitle: string
    ): Promise<DownloadedChapter> {
        const browser = await NHentaiScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
            logger.info(
                `[nHentai] Starting download for ${chapterTitle}`,
                { service: 'nHentaiScraper' }
            );

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });

            await page.waitForTimeout(1000);

            // Extract image URL from current page
            const imageUrl = await page.evaluate(() => {
                const img = document.querySelector('section#image-container img');
                if (!img) return null;

                const src = img.getAttribute('src');
                if (!src) return null;

                // Convert protocol-relative URL to full URL
                if (src.startsWith('//')) {
                    return `https:${src}`;
                }
                return src;
            });

            if (!imageUrl) {
                throw new Error(`No image found at ${url}`);
            }

            logger.info(
                `[nHentai] Found image for ${chapterTitle}: ${imageUrl}`,
                { service: 'nHentaiScraper' }
            );

            // Download the single image
            const storagePrefix = await this.downloadImages(
                [imageUrl],
                seriesId,
                chapterNumber,
                url
            );

            return {
                storagePrefix,
                pageCount: 1,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await NHentaiScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download images to local filesystem with retry logic (batched parallel, batch size 6)
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

        logger.info(
            `[nHentai] Starting download for chapter ${chapterNumber}: ${images.length} images to ${dir}`,
            { service: 'nHentaiScraper' }
        );

        const MAX_RETRIES = 3;
        const BASE_TIMEOUT = 20000;
        const RETRY_DELAYS = [500, 1500, 3000];
        const MIN_IMAGE_SIZE = 100;
        const batchSize = 6;
        const headers = {
            Referer: referer,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        };

        const downloadOne = async (imageUrl: string, i: number) => {
            const filePath = path.join(dir, `${(i + 1).toString().padStart(2, '0')}.webp`);
            let lastError: any;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await axios.get(imageUrl, {
                        responseType: 'stream',
                        timeout: BASE_TIMEOUT,
                        headers,
                    });
                    const dataLength = response.data.length;
                    const contentType = response.headers['content-type'] || '';
                    if (!contentType.includes('image')) {
                        throw new Error(`Received non-image content: ${contentType}`);
                    }
                    if (dataLength < MIN_IMAGE_SIZE) {
                        throw new Error(`Downloaded image too small: ${dataLength}/${MIN_IMAGE_SIZE} bytes`);
                    }
                    const buffer = Buffer.from(response.data);
                    const isJpeg = buffer.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));
                    const isWebP = buffer.slice(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) &&
                        buffer.slice(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));
                    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
                    if (!isJpeg && !isWebP && !isPng) {
                        const hex = buffer.slice(0, 10).toString('hex');
                        throw new Error(`Invalid image format. Got: ${hex}`);
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
                    return;
                } catch (err: any) {
                    lastError = err;
                    const errorCode = err.response?.status || err.code || 'UNKNOWN';
                    logger.warn(
                        `[nHentai] Attempt ${attempt}/${MAX_RETRIES} failed for image ${i + 1}: HTTP ${errorCode} - ${err.message}`,
                        { service: 'nHentaiScraper' }
                    );
                    if (attempt < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
                    }
                }
            }
            logger.error(
                `[nHentai] Failed to download image ${i + 1} after ${MAX_RETRIES} attempts: ${lastError?.message}`,
                { service: 'nHentaiScraper' }
            );
            throw lastError || new Error(`Failed to download image ${i + 1}`);
        };

        for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, images.length);
            const batch = images.slice(batchStart, batchEnd);
            await Promise.all(batch.map((imageUrl, j) => downloadOne(imageUrl, batchStart + j)));
            if (batchEnd < images.length) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }

        return storagePrefix;
    }
}
