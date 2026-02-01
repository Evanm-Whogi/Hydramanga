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
    private readonly metadata: ScraperMetadata = {
        id: 'nhentai',
        name: 'nHentai',
        baseUrl: 'https://nhentai.net',
        priority: appConfig.scraper.nHentai.priority,
        enabled: appConfig.scraper.nHentai.enabled,
    };

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
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
            logger.info(
                `[nHentai] Searching for "${mangaName}"`,
                { service: 'nHentaiScraper' }
            );

            const searchUrl = `https://nhentai.net/search/?q=${encodeURIComponent(mangaName)}`;
            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });

            await page.waitForTimeout(2000);

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
                logger.warn(
                    `[nHentai] No galleries found for "${mangaName}"`,
                    { service: 'nHentaiScraper' }
                );
                return undefined;
            }

            // Score results based on title match
            const scored = results.map(result => {
                const score = this.scoreMatch(result.title, mangaName);
                return { ...result, score };
            }).sort((a, b) => b.score - a.score);

            const bestMatch = scored[0];
            logger.info(
                `[nHentai] Found ${results.length} galleries. Best match: "${bestMatch.title}" (score: ${bestMatch.score})`,
                { service: 'nHentaiScraper' }
            );

            return {
                href: bestMatch.href,
                title: bestMatch.title,
                score: bestMatch.score,
            };
        } catch (error) {
            logger.error(
                `[nHentai] Search failed: ${error}`,
                { service: 'nHentaiScraper' }
            );
            return undefined;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
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
        coverUrl?: string
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
            // Find the gallery
            const bestMatch = await this.findBestMatch(mangaName, {
                seriesId,
                coverUrl,
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
            await browser.close().catch(() => {});
        }
    }

    async downloadChapter(
        url: string,
        mangaName: string,
        chapterTitle: string,
        seriesId?: number,
        coverUrl?: string
    ): Promise<DownloadedChapter> {
        const browser = await chromium.launch({ headless: true });
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
            const localPath = await this.downloadImages(
                [imageUrl],
                mangaName,
                chapterTitle,
                url
            );

            return {
                path: localPath,
                pageCount: 1,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
        }
    }

    /**
     * Download images to local filesystem with retry logic
     */
    private async downloadImages(
        images: string[],
        mangaName: string,
        folderName: string,
        referer: string
    ): Promise<string> {
        const dir = path.join(STORAGE_ROOT, safeName(mangaName), safeName(folderName));

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`[DOWNLOAD] Starting download for ${folderName}: ${images.length} images`);
        logger.info(
            `[nHentai] Starting download for ${folderName}: ${images.length} images to ${dir}`,
            { service: 'nHentaiScraper' }
        );

        const MAX_RETRIES = 3;
        const BASE_TIMEOUT = 20000;
        const RETRY_DELAYS = [500, 1500, 3000];
        const MIN_IMAGE_SIZE = 100;

        for (let i = 0; i < images.length; i++) {
            const filePath = path.join(
                dir,
                `image${(i + 1).toString().padStart(3, '0')}.jpg`
            );

            console.log(`[DOWNLOAD] Image ${i + 1}/${images.length}: URL = ${images[i].substring(0, 80)}...`);
            let lastError: any;
            let success = false;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[DOWNLOAD] Image ${i + 1}: Attempt ${attempt}/${MAX_RETRIES}`);
                    logger.debug(
                        `[nHentai] Downloading image ${i + 1}/${images.length} (attempt ${attempt}/${MAX_RETRIES})`,
                        { service: 'nHentaiScraper' }
                    );

                    const startTime = Date.now();
                    const response = await axios.get(images[i], {
                        responseType: 'arraybuffer',
                        timeout: BASE_TIMEOUT,
                        headers: {
                            Referer: referer,
                            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                    });
                    const fetchTime = Date.now() - startTime;

                    const dataLength = response.data.length;

                    const contentType = response.headers['content-type'] || '';

                    if (!contentType.includes('image')) {
                        throw new Error(`Received non-image content: ${contentType}`);
                    }

                    if (dataLength < MIN_IMAGE_SIZE) {
                        throw new Error(`Downloaded image too small: ${dataLength}/${MIN_IMAGE_SIZE} bytes`);
                    }

                    // Check for valid image format (JPEG, WebP, or PNG)
                    const buffer = Buffer.from(response.data);
                    const isJpeg = buffer.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));
                    const isWebP = buffer.slice(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) &&
                                   buffer.slice(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));
                    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

                    if (!isJpeg && !isWebP && !isPng) {
                        const hex = buffer.slice(0, 10).toString('hex');
                        throw new Error(`Invalid image format. Got: ${hex}`);
                    }

                    const format = isJpeg ? 'JPEG' : isWebP ? 'WebP' : 'PNG';

                    fs.writeFileSync(filePath, buffer);

                    const fileSize = fs.statSync(filePath).size;

                    success = true;
                    break;
                } catch (err: any) {
                    lastError = err;
                    const errorCode = err.response?.status || err.code || 'UNKNOWN';
                    console.log(`[DOWNLOAD] Image ${i + 1}: Failed - ${errorCode} (${err.message})`);

                    logger.warn(
                        `[nHentai] Attempt ${attempt}/${MAX_RETRIES} failed for image ${i + 1}: HTTP ${errorCode} - ${err.message}`,
                        { service: 'nHentaiScraper' }
                    );

                    if (attempt < MAX_RETRIES) {
                        const delayMs = RETRY_DELAYS[attempt - 1];
                        console.log(`[DOWNLOAD] Image ${i + 1}: Retrying after ${delayMs}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }

            if (!success) {
                console.log(`[DOWNLOAD] Image ${i + 1}: FAILED after ${MAX_RETRIES} attempts`);
                logger.error(
                    `[nHentai] Failed to download image ${i + 1} in ${folderName} after ${MAX_RETRIES} attempts: ${lastError?.message}`,
                    { service: 'nHentaiScraper' }
                );
                throw lastError || new Error(`Failed to download image ${i + 1}`);
            }
        }

        return dir;
    }
}
