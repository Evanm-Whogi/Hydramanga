/**
 * MangaTaro Scraper Implementation
 * 
 * Scraper for mangataro.org manga source using their REST API for search.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - REST API-based search with JSON response
 * - Chapter list scraping via browser with tab interaction
 * - Lazy-loaded image extraction with scroll-to-load
 * - Image download with proper headers
 * - Robust error handling and logging
 * 
 * Site Structure:
 * - Base URL: https://mangataro.org
 * - Search API: https://mangataro.org/wp-json/manga/v1/load (POST)
 * - Manga URL: https://mangataro.org/manga/{slug}
 * - Chapter URL: https://mangataro.org/read/{slug}/ch{number}-{id}
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
const API_BASE = appConfig.scraper.mangaTaro.apiUrl;
const SITE_BASE = appConfig.scraper.mangaTaro.baseUrl;

/**
 * MangaTaro API Response Types
 */
interface MangaTaroSearchItem {
    id: number;
    title: string;
    slug: string;
    alt_titles: string[];
    authors: string[];
    permalink: string;
    thumbnail: string;
    description: string;
    type: string;
    status: string;
}

interface MangaTaroSearchResponse {
    success: boolean;
    query: string;
    count: number;
    results: MangaTaroSearchItem[];
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
 * Calculate title similarity (0-100)
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
    if (title1.toLowerCase() === title2.toLowerCase()) {
        return 100;
    }

    const normalize = (s: string) => {
        return s
            .replace(/[^\w\s]/g, '')
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 0);
    };

    const words1 = normalize(title1);
    const words2 = normalize(title2);

    if (words1.length === 0 || words2.length === 0) {
        return 0;
    }

    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
}

/**
 * MangaTaro Scraper
 * Uses REST API for search and Playwright for chapter/image extraction
 */
export class MangaTaroScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'mangataro',
        name: 'MangaTaro',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.mangaTaro.priority,
        enabled: appConfig.scraper.mangaTaro.enabled,
    };

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.mangaTaro.timeout,
        withCredentials: true, // Include cookies
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Priority': 'u=1, i',
            'Sec-Ch-Ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Linux"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // MangaTaro can handle all manga by default
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        try {
            logger.info(
                `[MangaTaro] Searching for "${mangaName}"`,
                { service: 'mangaTaroScraper' }
            );

            // Prepare search variants
            const variants = [
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                ...(options?.secondaryTitles || []),
            ].filter((v): v is string => !!v && v.length > 0);

            for (const variant of variants) {
                logger.debug(
                    `[MangaTaro] Trying variant: "${variant}"`,
                    { service: 'mangaTaroScraper' }
                );

                try {
                    const response = await MangaTaroScraper.axiosInstance.post(
                        `${SITE_BASE}/auth/search`,
                        {
                            query: variant,
                            limit: 20,
                        }
                    );

                    const data: MangaTaroSearchResponse = response.data;

                    if (!data.success || !Array.isArray(data.results) || data.results.length === 0) {
                        logger.debug(
                            `[MangaTaro] No results for variant "${variant}"`,
                            { service: 'mangaTaroScraper' }
                        );
                        continue;
                    }

                    logger.debug(
                        `[MangaTaro] Found ${data.results.length} results for variant "${variant}"`,
                        { service: 'mangaTaroScraper' }
                    );

                    // Score results by title similarity
                    const scored = data.results
                        .map(result => ({
                            href: result.permalink,
                            title: result.title,
                            score: calculateTitleSimilarity(result.title, variant),
                        }))
                        .filter(r => r.score >= 70)
                        .sort((a, b) => b.score - a.score);

                    if (scored.length > 0) {
                        const bestMatch = scored[0];
                        logger.info(
                            `[MangaTaro] Found match: "${bestMatch.title}" (score: ${bestMatch.score})`,
                            { service: 'mangaTaroScraper' }
                        );
                        return bestMatch;
                    }
                } catch (error: any) {
                    logger.debug(
                        `[MangaTaro] Search failed for variant "${variant}": ${error?.message || error}`,
                        { service: 'mangaTaroScraper' }
                    );
                    continue;
                }
            }

            logger.warn(
                `[MangaTaro] Could not find manga for "${mangaName}"`,
                { service: 'mangaTaroScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[MangaTaro] Search error: ${error}`,
                { service: 'mangaTaroScraper' }
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
            userAgent: appConfig.scraper.mangaTaro.userAgent,
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
                throw new Error(`Could not find manga link for "${mangaName}"`);
            }

            logger.info(
                `[MangaTaro] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                { service: 'mangaTaroScraper' }
            );

            // Navigate to manga page
            await page.goto(bestMatch.href, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Close welcome modal if it exists
            try {
                const closeBtn = await page.$('#close-welcome-modal');
                if (closeBtn) {
                    await closeBtn.click();
                    await page.waitForSelector('div#welcome-modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
                    logger.debug(
                        `[MangaTaro] Closed welcome modal`,
                        { service: 'mangaTaroScraper' }
                    );
                } else {
                    // Fallback: Remove modal via DOM manipulation
                    await page.evaluate(() => {
                        const modal = document.querySelector('div#welcome-modal');
                        if (modal) {
                            modal.remove();
                        }
                    });
                    logger.debug(
                        `[MangaTaro] Removed welcome modal by DOM manipulation`,
                        { service: 'mangaTaroScraper' }
                    );
                }
            } catch (e) {
                logger.debug(
                    `[MangaTaro] Welcome modal not found or already closed`,
                    { service: 'mangaTaroScraper' }
                );
            }

            // Click the Chapters tab
            const chaptersTabSelector = 'div.tabs-item[data-tab-target="#tab-chapters"]';
            const chaptersTab = await page.$(chaptersTabSelector);
            
            if (chaptersTab) {
                await chaptersTab.click();
                logger.debug(
                    `[MangaTaro] Clicked Chapters tab`,
                    { service: 'mangaTaroScraper' }
                );
            }

            // Wait for chapter list to load
            try {
                await page.waitForSelector('div.chapter-list', { timeout: 10000 });
                await page.waitForTimeout(2000); // Additional wait for chapters to fully load
            } catch (e) {
                logger.warn(
                    `[MangaTaro] Chapter list selector not found, proceeding anyway`,
                    { service: 'mangaTaroScraper' }
                );
            }

            // Extract chapter links
            const chapterRows = await page.evaluate(() => {
                const chapters = Array.from(
                    document.querySelectorAll('div.chapter-list a[href*="/read/"]')
                );

                return chapters
                    .map(link => {
                        const url = (link as HTMLAnchorElement).href;
                        const titleElement = link.querySelector('span.font-medium, span.text-sm');
                        const fullTitle = titleElement?.textContent?.trim() || '';
                        return { url, title: fullTitle };
                    })
                    .filter(ch => ch.url && ch.title);
            });

            logger.info(
                `[MangaTaro] Found ${chapterRows.length} chapters`,
                { service: 'mangaTaroScraper' }
            );

            // Process and yield chapters
            for (const chap of chapterRows) {
                const parsed = ChapterNumberParser.parse(chap.title);

                // Skip if chapter already exists
                if (await checkExists(parsed.number)) {
                    logger.debug(
                        `[MangaTaro] Skipping chapter ${parsed.number} - already exists`,
                        { service: 'mangaTaroScraper' }
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
            userAgent: appConfig.scraper.mangaTaro.userAgent,
        });
        const page = await context.newPage();

        try {
            // Navigate to chapter page
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });

            // Wait for chapter images container (reduced timeout)
            try {
                await page.waitForSelector('div#chapter-images-container', { timeout: 5000 });
            } catch (e) {
                throw new Error(`Could not find chapter images container at ${url}`);
            }

            // Scroll to load all lazy-loaded images - optimized fast pass
            const totalImageElements = await page.evaluate(() => {
                return document.querySelectorAll('div.comic-image-container img.comic-image').length;
            });

            // Fast single pass scroll
            await page.evaluate(() => {
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(100);

            const pageHeight = await page.evaluate(() => document.body.scrollHeight);
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            
            // Very fast scroll in full viewport increments
            const scrollStep = viewportHeight;
            let currentScroll = 0;
            
            while (currentScroll < pageHeight) {
                await page.evaluate((step) => window.scrollBy(0, step), scrollStep);
                currentScroll += scrollStep;
                await page.waitForTimeout(50); // Minimal 50ms between scrolls
            }

            // Final scroll to absolute bottom
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(200);

            // Extract image URLs with comprehensive attribute checking
            const imageUrls: any = await page.evaluate(() => {
                const images = Array.from(
                    document.querySelectorAll('div.comic-image-container img.comic-image')
                );

                const urls: string[] = [];
                const missingUrls: number[] = [];

                for (let i = 0; i < images.length; i++) {
                    const img = images[i] as HTMLImageElement;
                    const src = (img.src || '').trim();
                    const dataSrc = (img.dataset.src || (img as any)['data-src'] || '').trim();
                    const lazySrc = (img.dataset.lazySrc || '').trim();
                    const originalSrc = (img.dataset.original || '').trim();
                    
                    // Try multiple possible attributes
                    const possibleUrls = [dataSrc, lazySrc, originalSrc, src].filter(u => u && u.startsWith('http'));
                    
                    if (possibleUrls.length > 0) {
                        urls.push(possibleUrls[0]);
                    } else {
                        // Track which images failed to load
                        missingUrls.push(i + 1);
                    }
                }

                return { urls, missingUrls, totalElements: images.length };
            });

            // Only log debug info if images are missing
            if (imageUrls.missingUrls.length > 0) {
                logger.warn(
                    `[MangaTaro] Missing ${imageUrls.missingUrls.length} images at positions: ${imageUrls.missingUrls.slice(0, 10).join(', ')}${imageUrls.missingUrls.length > 10 ? '...' : ''}`,
                    { service: 'mangaTaroScraper' }
                );
            }

            // Remove duplicates
            const uniqueImageUrls: any = Array.from(new Set(imageUrls.urls));

            logger.debug(
                `[MangaTaro] Extracted ${uniqueImageUrls.length} unique URLs from ${imageUrls.totalElements} image elements`,
                { service: 'mangaTaroScraper' }
            );

            if (uniqueImageUrls.length === 0) {
                throw new Error(`No images found at ${url}`);
            }

            logger.info(
                `[MangaTaro] Found ${uniqueImageUrls.length} images for chapter ${chapterNumber}`,
                { service: 'mangaTaroScraper' }
            );

            // Download images
            const storagePrefix = await this.downloadImages(
                uniqueImageUrls,
                seriesId,
                chapterNumber,
                url
            );

            return {
                storagePrefix,
                pageCount: uniqueImageUrls.length,
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
                `${(i + 1).toString().padStart(3, '0')}.jpg`
            );

            try {
                const response = await MangaTaroScraper.axiosInstance.get(images[i], {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    headers: {
                        Referer: referer,
                        'User-Agent': appConfig.scraper.mangaTaro.userAgent,
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

                logger.debug(
                    `[MangaTaro] Downloaded image ${i + 1}/${images.length}`,
                    { service: 'mangaTaroScraper' }
                );
            } catch (err: any) {
                logger.error(
                    `[MangaTaro] Failed to download image ${i + 1}: ${err.message}`,
                    { service: 'mangaTaroScraper' }
                );
                throw err;
            }
        }

        return storagePrefix;
    }
}