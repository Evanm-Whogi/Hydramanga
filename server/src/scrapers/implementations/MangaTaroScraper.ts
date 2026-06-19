/**
 * MangaTaro Scraper Implementation
 * 
 * Scraper for mangataro.org manga source using their REST API for search and chapter content.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - REST API-based search with JSON response
 * - Chapter list scraping via browser with tab interaction
 * - Chapter images via auth/chapter-content API (no page open/scroll)
 * - Image download with proper headers
 * - Robust error handling and logging
 * 
 * Site Structure:
 * - Base URL: https://mangataro.org
 * - Search API: https://mangataro.org/auth/search (POST)
 * - Chapter content API: https://mangataro.org/auth/chapter-content?chapter_id={id}
 * - Manga URL: https://mangataro.org/manga/{slug}
 * - Chapter URL: https://mangataro.org/read/{slug}/ch{number}-{id}
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

interface MangaTaroChapterContentResponse {
    success: boolean;
    chapter_id: number;
    chapter_type: string;
    images: string[];
    total: number;
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
 * Extract chapter ID from MangaTaro chapter URL.
 * e.g. https://mangataro.org/read/.../ch456-636003 -> 636003
 * e.g. https://mangataro.org/read/.../ch23-2-611614 -> 611614 (Chapter 23.2)
 */
function extractChapterIdFromUrl(url: string): number | null {
    const match = url.match(/ch[\d-]+-(\d+)(?:\?|$)/);
    return match ? parseInt(match[1], 10) : null;
}

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

    // Browser pool for reusing browser instances
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 6; // Match default chapter download concurrency
    private static browserPoolLock = false;

    private static readonly httpAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50, // Increased from 10 to 50 for parallel downloads
        maxFreeSockets: 10, // Increased from 5 to 10
        timeout: 30000,
    });

    private static readonly httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50, // Increased from 10 to 50 for parallel downloads
        maxFreeSockets: 10, // Increased from 5 to 10
        timeout: 30000,
    });

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.mangaTaro.timeout,
        withCredentials: true, // Include cookies
        httpAgent: MangaTaroScraper.httpAgent,
        httpsAgent: MangaTaroScraper.httpsAgent,
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

    /**
     * Normalize a title/search string so minor punctuation/connector differences
     * (e.g. ":" vs "-" or multiple spaces) don't affect matching.
     */
    private static normalizeForSearch(value?: string): string {
        if (!value) return '';
        return value
            .replace(/[-_.]+/g, ' ')                // treat dashes/underscores/dots as spaces
            .replace(/[^\p{L}\p{N}\s]/gu, '')       // drop other punctuation (unicode-aware)
            .replace(/\s+/g, ' ')                   // collapse multiple spaces
            .trim();
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    /**
     * Get a browser from the pool or create a new one
     */
    private static async getBrowser() {
        // Try to get an existing browser from pool
        if (MangaTaroScraper.browserPool.length > 0) {
            return MangaTaroScraper.browserPool.pop();
        }

        // Create new browser if pool is not at max
        logger.debug('[MangaTaro] Launching new browser for pool', { service: 'mangaTaroScraper' });
        const browser = await chromium.launch({ 
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'] // Better for Docker/containerized environments
        });
        return browser;
    }

    /**
     * Return a browser to the pool or close it if pool is full
     */
    private static async releaseBrowser(browser: any) {
        if (!browser) return;

        try {
            // Check if browser is still connected
            if (!browser.isConnected()) {
                await browser.close().catch(() => {});
                return;
            }

            // Return to pool if not full
            if (MangaTaroScraper.browserPool.length < MangaTaroScraper.MAX_BROWSERS) {
                MangaTaroScraper.browserPool.push(browser);
                logger.debug(`[MangaTaro] Browser returned to pool (${MangaTaroScraper.browserPool.length}/${MangaTaroScraper.MAX_BROWSERS})`, { service: 'mangaTaroScraper' });
            } else {
                // Pool is full, close the browser
                await browser.close().catch(() => {});
                logger.debug('[MangaTaro] Browser closed (pool full)', { service: 'mangaTaroScraper' });
            }
        } catch (error) {
            logger.warn(`[MangaTaro] Error releasing browser: ${error}`, { service: 'mangaTaroScraper' });
            await browser.close().catch(() => {});
        }
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
            // Prepare search variants (raw + normalized forms)
            const baseVariants = [
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                ...(options?.secondaryTitles || []),
            ].filter((v): v is string => !!v && v.length > 0);

            const normalizedExtras = baseVariants
                .map((v) => MangaTaroScraper.normalizeForSearch(v))
                .filter((v) => v && !baseVariants.includes(v));

            const variants = [...baseVariants, ...normalizedExtras];

            logger.info(
                `[MangaTaro] Trying ${variants.length} search variants`,
                { service: 'mangaTaroScraper' }
            );

            for (const variant of variants) {
                logger.info(
                    `[MangaTaro] Searching for "${variant}"`,
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

                    logger.info(
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

    async search(query: string, options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        try {
            const response = await MangaTaroScraper.axiosInstance.post(
                `${SITE_BASE}/auth/search`,
                { query: q, limit: Math.max(limit, 20) }
            );

            const data: MangaTaroSearchResponse = response.data;
            if (!data.success || !Array.isArray(data.results) || data.results.length === 0) {
                return [];
            }

            const scored = data.results
                .map((result) => ({
                    href: result.permalink,
                    title: result.title,
                    score: calculateTitleSimilarity(result.title, q),
                }))
                .filter((r) => r.score >= 70)
                .sort((a, b) => b.score - a.score);

            return scored.slice(0, limit);
        } catch (error) {
            logger.error(`[MangaTaro] search() failed: ${error}`, { service: 'mangaTaroScraper' });
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
        mangaPageUrl?: string,
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const browser = await MangaTaroScraper.getBrowser(); // Use pool instead of launching new
        const context = await browser.newContext({
            userAgent: appConfig.scraper.mangaTaro.userAgent,
        });
        const page = await context.newPage();

        try {
            let pageUrl: string;

            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
                logger.info(
                    `[MangaTaro] Using saved URL for "${mangaName}"`,
                    { service: 'mangaTaroScraper' }
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
                    throw new Error(`Could not find manga link for "${mangaName}"`);
                }

                pageUrl = bestMatch.href;
                logger.info(
                    `[MangaTaro] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                    { service: 'mangaTaroScraper' }
                );
            }

            // Navigate to manga page
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
                await page.waitForTimeout(500); // Reduced from 2000ms to 500ms
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
            await MangaTaroScraper.releaseBrowser(browser); // Return to pool instead of closing
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const chapterId = extractChapterIdFromUrl(url);
        if (chapterId == null) {
            throw new Error(`Could not extract chapter ID from URL: ${url}`);
        }

        const contentUrl = `${SITE_BASE}/auth/chapter-content?chapter_id=${chapterId}`;
        const response = await MangaTaroScraper.axiosInstance.get<MangaTaroChapterContentResponse>(contentUrl);

        const data = response.data;
        if (!data?.success || !Array.isArray(data.images) || data.images.length === 0) {
            throw new Error(
                data?.success === false
                    ? `Chapter content API failed for chapter_id=${chapterId}`
                    : `No images in chapter content response for ${url}`
            );
        }

        const imageUrls = data.images;
        logger.info(
            `[MangaTaro] Fetched ${imageUrls.length} image URLs for chapter ${chapterNumber} (chapter_id=${chapterId})`,
            { service: 'mangaTaroScraper' }
        );

        const storagePrefix = await this.downloadImages(
            imageUrls,
            seriesId,
            chapterNumber,
            url
        );

        return {
            storagePrefix,
            pageCount: imageUrls.length,
        };
    }

    /**
     * Download images to local filesystem with retry logic (parallel)
     */
    private async downloadImages(
        images: string[],
        seriesId: number,
        chapterNumber: string,
        referer: string
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        await downloadAndStoreChapter({
            storagePrefix,
            images,
            scraperId: this.metadata.id,
            scraperName: this.metadata.name,
            chapterUrl: referer,
            client: MangaTaroScraper.axiosInstance,
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
            maxRedirects: 5,
            batchDelayMs: 25,
            service: 'mangaTaroScraper',
            isRetryable: isNetworkRetryableError,
        });

        return storagePrefix;
    }
}