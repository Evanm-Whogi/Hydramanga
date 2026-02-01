/**
 * MangaForest Scraper Implementation
 * 
 * Scraper for mangaforest.me manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * Built as a direct adaptation of WeebCentralScraper with MangaForest-specific selectors.
 * 
 * Features:
 * - Chapter list scraping with Playwright
 * - Image download with retry logic
 * - Search functionality via browser
 * - Robust error handling and logging
 * 
 * Site Structure:
 * - Base URL: https://mangaforest.me/
 * - Search: https://mangaforest.com/search?q=query
 * - Search results: div.book-item a with href
 * - Chapter pages: /title-slug/chapter-number
 * - Chapter list: ul.chapter-list li a
 * - Images: div.chapter-image img with src/data-src attributes
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
 * MangaForest Scraper
 */
export class MangaForestScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'mangaforest',
        name: 'MangaForest',
        baseUrl: 'https://mangaforest.me',
        priority: appConfig.scraper.mangaForest.priority,
        enabled: appConfig.scraper.mangaForest.enabled,
    };

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // MangaForest can handle all manga by default
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.mangaForest.userAgent,
        });
        const page = await context.newPage();

        try {
            logger.info(
                `[MangaForest] Searching for "${mangaName}"`,
                { service: 'mangaForestScraper' }
            );

            const searchUrl = `https://mangaforest.com/search?q=${encodeURIComponent(mangaName)}`;
            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });

            await page.waitForTimeout(2000);

            // Extract search results from MangaForest's structure
            const results = await page.evaluate(() => {
                // Target the search result structure from book-item divs
                const items = Array.from(
                    document.querySelectorAll('div.book-item a[href]')
                );

                return items
                    .map((link: any) => {
                        const href = link.href;
                        const title = link.getAttribute('title') || link.textContent?.trim() || '';

                        if (!title || !href || !href.includes('mangaforest.me')) return null;

                        return { href, title };
                    })
                    .filter((r: any) => r !== null);
            });

            if (results.length === 0) {
                logger.warn(
                    `[MangaForest] No results found for "${mangaName}"`,
                    { service: 'mangaForestScraper' }
                );
                return undefined;
            }

            // Score and sort results
            const scored = results
                .map((result: any) => ({
                    href: result.href,
                    title: result.title,
                    score: this.scoreMatch(result.title, result.href, mangaName),
                }))
                .filter((r: any) => r.score > 0)
                .sort((a: any, b: any) => b.score - a.score);

            if (scored.length === 0) {
                logger.warn(
                    `[MangaForest] No matching results for "${mangaName}"`,
                    { service: 'mangaForestScraper' }
                );
                return undefined;
            }

            const bestMatch = scored[0];
            logger.info(
                `[MangaForest] Found match: "${bestMatch.title}" (score: ${bestMatch.score})`,
                { service: 'mangaForestScraper' }
            );

            return bestMatch;
        } catch (error) {
            logger.error(
                `[MangaForest] Search failed for "${mangaName}": ${error}`,
                { service: 'mangaForestScraper' }
            );
            throw error;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
        }
    }

    /**
     * Score search results based on relevance
     */
    private scoreMatch(title: string, url: string, searchTerm: string): number {
        const titleLower = title.toLowerCase().trim();
        const urlLower = url.toLowerCase();
        const searchLower = searchTerm.toLowerCase().trim();

        const normalizeForMatching = (text: string) => {
            return text
                .replace(/[,\-:]/g, ' ')
                .replace(/\s+/g, ' ')
                .toLowerCase()
                .trim();
        };

        const titleNormalized = normalizeForMatching(titleLower);
        const searchNormalized = normalizeForMatching(searchLower);

        // Exact match
        if (titleLower === searchLower || titleNormalized === searchNormalized) {
            return 100;
        }

        // Word boundary match
        const wordBoundaryPattern = new RegExp(
            `\\b${searchNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
        );
        if (wordBoundaryPattern.test(titleNormalized)) {
            return 95;
        }

        // URL slug match
        const searchSlug = searchLower.replace(/\s+/g, '-');
        if (urlLower.includes(`/${searchSlug}`) || urlLower.endsWith(searchSlug)) {
            return 85;
        }

        // Starts with
        if (titleNormalized.startsWith(searchNormalized)) {
            return 75;
        }

        // Contains
        if (titleNormalized.includes(searchNormalized)) {
            return 60;
        }

        return 0;
    }

    async* scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        coverUrl?: string
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.mangaForest.userAgent,
        });
        const page = await context.newPage();

        try {
            // Find best manga series match
            const bestMatch = await this.findBestMatch(mangaName, {
                seriesId,
                romanizedTitle,
                coverUrl,
            });

            if (!bestMatch) {
                const error = `Could not find manga link for "${mangaName}"`;
                logger.error(
                    `[MangaForest] ${error}`,
                    { service: 'mangaForestScraper' }
                );
                throw new Error(error);
            }

            logger.info(
                `[MangaForest] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                { service: 'mangaForestScraper' }
            );

            await page.goto(bestMatch.href, { waitUntil: 'domcontentloaded' });

            // Wait for initial chapter list to load
            await page.waitForTimeout(1500);

            // Click "Show More" button multiple times until all chapters are loaded
            let totalClicksAttempted = 0;
            const maxClicks = 50;
            
            try {
                while (totalClicksAttempted < maxClicks) {
                    await page.waitForTimeout(300);
                    
                    // Scroll to button and click
                    const result = await page.evaluate(() => {
                        const allReadmoreButtons = Array.from(document.querySelectorAll('div.readmore span'));
                        const getChaptersBtn = allReadmoreButtons.find(btn => {
                            const onclick = btn.getAttribute('onclick');
                            return onclick && onclick.includes('getChapters');
                        });

                        if (!getChaptersBtn) {
                            return { exists: false, countBefore: document.querySelectorAll('ul.chapter-list li a').length };
                        }

                        const countBefore = document.querySelectorAll('ul.chapter-list li a').length;
                        getChaptersBtn.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        (getChaptersBtn as any).click();
                        
                        return { exists: true, countBefore };
                    });

                    if (!result.exists) {
                        logger.info(
                            `[MangaForest] All chapters loaded (Show More button not found after ${totalClicksAttempted} clicks)`,
                            { service: 'mangaForestScraper' }
                        );
                        break;
                    }

                    totalClicksAttempted++;
                    await page.waitForTimeout(2000);

                    // Verify new chapters were added
                    const countAfter = await page.evaluate(() => {
                        return document.querySelectorAll('ul.chapter-list li a').length;
                    });

                    // If no new chapters were added, we're done
                    if (countAfter === result.countBefore && totalClicksAttempted > 2) {
                        break;
                    }
                }
            } catch (err) {
                logger.warn(
                    `[MangaForest] Error during Show More clicks: ${err}`,
                    { service: 'mangaForestScraper' }
                );
            }

            // Extract chapter list
            const chapterRows = await page.evaluate(() => {
                const links = Array.from(
                    document.querySelectorAll('ul.chapter-list li a')
                );
                return links
                    .map(anchor => {
                        const url = (anchor as HTMLAnchorElement).href;
                        // Try to get the clean chapter title from the strong.chapter-title element first
                        let fullTitle = anchor.querySelector('strong.chapter-title')?.textContent?.trim() || '';
                        // Fallback to full text if strong element doesn't exist
                        if (!fullTitle) {
                            fullTitle = anchor.textContent?.trim() || '';
                            // Extract just the chapter part, removing dates
                            fullTitle = fullTitle.split(/[\-\n]/)[0].trim();
                        }
                        return { url, title: fullTitle };
                    })
                    .reverse(); // Oldest first
            });

            // Deduplicate chapters - keep first occurrence of each chapter number
            const seenChapters = new Set<string>();
            const deduplicatedChapters = chapterRows.filter(chap => {
                const parsed = ChapterNumberParser.parse(chap.title);
                if (seenChapters.has(parsed.number)) {
                    return false;
                }
                seenChapters.add(parsed.number);
                return true;
            });

            logger.info(
                `[MangaForest] Found ${deduplicatedChapters.length} unique chapters`,
                { service: 'mangaForestScraper' }
            );

            // Process and yield chapters
            for (const chap of deduplicatedChapters) {
                const parsed = ChapterNumberParser.parse(chap.title);

                // Skip if chapter already exists
                if (await checkExists(parsed.number)) {
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
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.mangaForest.userAgent,
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
                        `[MangaForest] Navigating to ${folderName} (attempt ${attempt}/3)`,
                        { service: 'mangaForestScraper' }
                    );

                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 45000,
                    });

                    logger.info(
                        `[MangaForest] Successfully navigated to ${folderName}`,
                        { service: 'mangaForestScraper' }
                    );

                    break; // Success
                } catch (err: any) {
                    lastError = err;
                    if (
                        err.message.includes('ERR_ABORTED') ||
                        err.message.includes('net::')
                    ) {
                        logger.warn(
                            `[MangaForest] Navigation error on attempt ${attempt}: ${err.message}`,
                            { service: 'mangaForestScraper' }
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
                await page.waitForSelector('div.chapter-image img', { timeout: 5000 });
            } catch (err) {
                logger.warn(
                    `[MangaForest] Image selector not found immediately for ${folderName}, continuing anyway`,
                    { service: 'mangaForestScraper' }
                );
            }

            // Scroll through the entire page to trigger lazy loading for all images
            try {
                logger.info(
                    `[MangaForest] Starting scroll to load lazy images for ${folderName}`,
                    { service: 'mangaForestScraper' }
                );

                // Scroll incrementally to trigger lazy loading
                let previousHeight = await page.evaluate(() => document.body.scrollHeight);
                let scrollAttempts = 0;
                const maxScrollAttempts = 25;

                while (scrollAttempts < maxScrollAttempts) {
                    await page.evaluate(() => {
                        window.scrollBy(0, window.innerHeight * 1.5);
                    });
                    await page.waitForTimeout(250);

                    const newHeight = await page.evaluate(() => document.body.scrollHeight);
                    if (newHeight === previousHeight) {
                        scrollAttempts++;
                        if (scrollAttempts >= 3) {
                            break;
                        }
                    } else {
                        scrollAttempts = 0;
                    }
                    previousHeight = newHeight;
                }

                // Scroll to absolute bottom
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await page.waitForTimeout(1500);

                // Quick final scrolls to trigger any remaining images
                for (let i = 0; i < 3; i++) {
                    await page.evaluate(() => {
                        window.scrollBy(0, 300);
                    });
                    await page.waitForTimeout(300);
                }

                // Wait for all images to have valid src attributes
                await page.waitForFunction(
                    () => {
                        const images = Array.from(document.querySelectorAll('div.chapter-image img'));
                        return images.every(img => {
                            const src = img.getAttribute('src') || img.getAttribute('data-src');
                            return src && src.startsWith('http');
                        });
                    },
                    { timeout: 8000 }
                ).catch(() => {
                    logger.warn(
                        `[MangaForest] Some images may still be loading for ${folderName}`,
                        { service: 'mangaForestScraper' }
                    );
                });

                // Final brief wait
                await page.waitForTimeout(1000);

                // Additional wait to ensure all lazy-loaded images are loaded
                // MangaForest uses loading.svg placeholders that need to be replaced
                await page.waitForFunction(
                    () => {
                        const images = Array.from(document.querySelectorAll('div.chapter-image img'));
                        // Check that no images still have loading.svg as src
                        return images.every(img => {
                            const src = img.getAttribute('src') || img.getAttribute('data-src');
                            return src && 
                                   src.startsWith('http') && 
                                   !src.includes('loading.svg') &&
                                   !src.includes('placeholder');
                        });
                    },
                    { timeout: 12000 }
                ).catch(() => {
                    logger.warn(
                        `[MangaForest] Some images may still be loading placeholders for ${folderName}`,
                        { service: 'mangaForestScraper' }
                    );
                });

                await page.waitForTimeout(2000); // Final wait for any stragglers
            } catch (err) {
                logger.debug(
                    `[MangaForest] Scroll error (non-critical): ${err}`,
                    { service: 'mangaForestScraper' }
                );
            }

            // Extract image URLs - Try primary selector for MangaForest
            let finalImages = await page
                .evaluate(() => {
                    return Array.from(document.querySelectorAll('div.chapter-image img'))
                        .map(
                            img =>
                                img.getAttribute('src') || img.getAttribute('data-src')
                        )
                        .filter(
                            (src): src is string =>
                                !!src && 
                                (src.includes('mbcdn') || src.includes('http')) &&
                                !src.includes('loading.svg') &&
                                !src.includes('placeholder')
                        );
                })
                .catch((err: any) => {
                    logger.warn(
                        `[MangaForest] Primary selector failed for ${folderName}: ${err.message}`,
                        { service: 'mangaForestScraper' }
                    );
                    return [];
                });

            // Fallback selector - target all img tags in the chapter container
            if (finalImages.length === 0) {
                finalImages = await page
                    .evaluate(() => {
                        return Array.from(
                            document.querySelectorAll('div#chapter-images img, div.container#chapter-images img')
                        )
                            .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
                            .filter(
                                (src): src is string => !!src && src.startsWith('http') && !src.includes('loading.svg') && !src.includes('placeholder')
                            );
                    })
                    .catch((err: any) => {
                        logger.warn(
                            `[MangaForest] Fallback selector 1 failed for ${folderName}: ${err.message}`,
                            { service: 'mangaForestScraper' }
                        );
                        return [];
                    });
            }

            // Second fallback - any img with mbcdn in src
            if (finalImages.length === 0) {
                finalImages = await page
                    .evaluate(() => {
                        return Array.from(
                            document.querySelectorAll('img[src*="mbcdn"]')
                        )
                            .map(img => img.getAttribute('src'))
                            .filter(
                                (src): src is string => !!src && src.startsWith('http') && !src.includes('loading.svg') && !src.includes('placeholder')
                            );
                    })
                    .catch((err: any) => {
                        logger.warn(
                            `[MangaForest] Fallback selector 2 failed for ${folderName}: ${err.message}`,
                            { service: 'mangaForestScraper' }
                        );
                        return [];
                    });
            }

            logger.info(
                `[MangaForest] Found ${finalImages.length} images for ${folderName}`,
                { service: 'mangaForestScraper' }
            );

            if (finalImages.length === 0) {
                throw new Error(`No images found at ${url}`);
            }

            // Download images
            const localPath = await this.downloadImages(
                finalImages,
                mangaName,
                folderName,
                url
            );

            return {
                path: localPath,
                pageCount: finalImages.length,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
        }
    }

    /**
     * Download images to local filesystem with retry logic
     * 
     * MangaForest image servers can be flaky, especially for certain images (like image 2).
     * This implements exponential backoff retry logic to handle transient failures.
     * Also validates image data to detect corrupted/incomplete downloads.
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

        const MAX_RETRIES = 3;
        const BASE_TIMEOUT = 20000; // Increased from 15000ms
        const RETRY_DELAYS = [500, 1500, 3000]; // ms to wait between retries
        const MIN_IMAGE_SIZE = 100; // Very low minimum - just ensure not empty (valid JPEG headers are the main validation)
        const downloadResults: Array<{ index: number; url: string; success: boolean; error?: string }> = [];

        for (let i = 0; i < images.length; i++) {
            const filePath = path.join(
                dir,
                `image${(i + 1).toString().padStart(3, '0')}.jpg`
            );

            let lastError: any;
            let success = false;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const startTime = Date.now();
                    const response = await axios.get(images[i], {
                        responseType: 'arraybuffer',
                        timeout: BASE_TIMEOUT,
                        headers: {
                            Referer: referer,
                            'User-Agent': appConfig.scraper.mangaForest.userAgent,
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
                    const fetchTime = Date.now() - startTime;

                    const dataLength = response.data.length;
                    
                    // Check Content-Type header
                    const contentType = response.headers['content-type'] || '';
                    
                    // Validate that we got actual image data
                    if (!contentType.includes('image')) {
                        // Show first 500 chars of response for debugging
                        const preview = response.data.slice(0, 500).toString('utf8');
                        throw new Error(`Received non-image content: ${contentType}`);
                    }

                    // Check for minimum file size (corrupted/incomplete detection)
                    if (dataLength < MIN_IMAGE_SIZE) {
                        const preview = response.data.slice(0, 100).toString('utf8', 0, 100);
                        throw new Error(`Downloaded image too small: ${dataLength}/${MIN_IMAGE_SIZE} bytes (likely corrupted)`);
                    }

                    // Check for image magic bytes
                    const buffer = Buffer.from(response.data);
                    const isJpeg = buffer.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));
                    const isWebP = buffer.slice(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && 
                                   buffer.slice(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50])); // RIFF...WEBP
                    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])); // PNG magic bytes
                    
                    if (!isJpeg && !isWebP && !isPng) {
                        const hex = buffer.slice(0, 10).toString('hex');
                        throw new Error(`Invalid image format. Got: ${hex} (expected JPEG, PNG, or WebP)`);
                    }

                    const format = isJpeg ? 'JPEG' : isPng ? 'PNG' : 'WebP';

                    fs.writeFileSync(filePath, buffer);
                    
                    const fileSize = fs.statSync(filePath).size;
                    
                    success = true;
                    downloadResults.push({ index: i + 1, url: images[i], success: true });
                    break; // Success, move to next image
                } catch (err: any) {
                    lastError = err;
                    const errorCode = err.response?.status || err.code || 'UNKNOWN';
                    
                    logger.warn(
                        `[MangaForest] Attempt ${attempt}/${MAX_RETRIES} failed for image ${i + 1}: HTTP ${errorCode} - ${err.message}`,
                        { service: 'mangaForestScraper' }
                    );

                    // Don't retry on last attempt
                    if (attempt < MAX_RETRIES) {
                        const delayMs = RETRY_DELAYS[attempt - 1];
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }

            if (!success) {
                downloadResults.push({ 
                    index: i + 1, 
                    url: images[i], 
                    success: false,
                    error: lastError?.message || 'Unknown error'
                });
                logger.error(
                    `[MangaForest] Failed to download image ${i + 1} in ${folderName} after ${MAX_RETRIES} attempts: ${lastError?.message}`,
                    { service: 'mangaForestScraper' }
                );
                throw lastError || new Error(`Failed to download image ${i + 1}`);
            }
        }
        
        return dir;
    }
}
