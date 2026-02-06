/**
 * Comix Scraper Implementation
 * 
 * Scraper for comix.to manga source using their exposed API.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - Chapter list scraping via Comix API with pagination support
 * - Image download with proper headers
 * - HTML-based search with relevance ranking
 * - Robust error handling and logging
 * 
 * Site Structure:
 * - Base URL: https://comix.to
 * - Search: https://comix.to/browser?keyword={query}&order=relevance:desc&genres_mode=and
 * - Chapter API: https://comix.to/api/v2/manga/{slug}/chapters?limit=100&page={page}
 * - Chapter URL: https://comix.to/title/{slug}/{chapter_id}
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
const API_BASE = appConfig.scraper.comix.apiUrl;
const SITE_BASE = appConfig.scraper.comix.baseUrl;

/**
 * Comix API Response Types
 */
interface ComixChapterItem {
    chapter_id: number;
    manga_id: number;
    scanlation_group_id: number;
    is_official: boolean;
    number: number;
    name: string;
    language: string;
    volume: number;
    votes: number;
    created_at: number;
    updated_at: number;
    scanlation_group: {
        scanlation_group_id: number;
        name: string;
        slug: string;
    };
}

interface ComixChaptersResponse {
    status: number;
    result: {
        items: ComixChapterItem[];
        pagination: {
            count: number;
            total: number;
            per_page: number;
            current_page: number;
            last_page: number;
            from: number;
            to: number;
        };
    };
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
 * Comix Scraper
 * Uses the Comix.to API for chapter discovery and Playwright for image extraction
 */
export class ComixScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'comix',
        name: 'Comix',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.comix.priority,
        enabled: appConfig.scraper.comix.enabled,
    };

    // Rate limiting: delay between requests in milliseconds
    private static readonly REQUEST_DELAY_MS = 1000; // 1 second between requests
    private static lastRequestTime = 0;

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.comix.timeout,
        headers: {
            'User-Agent': appConfig.scraper.comix.userAgent,
            Accept: 'application/json',
        },
    });

    /**
     * Sleep for specified milliseconds
     */
    private static async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Rate-limited HTTP request
     */
    private static async rateLimitedRequest(
        url: string,
        config?: any
    ): Promise<any> {
        // Enforce minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.REQUEST_DELAY_MS) {
            await this.sleep(this.REQUEST_DELAY_MS - timeSinceLastRequest);
        }

        this.lastRequestTime = Date.now();
        return await this.axiosInstance.get(url, config);
    }

    /**
     * Calculate similarity between two strings (0-100)
     * NOTE: title1 = result from search, title2 = what we're searching for
     */
    private calculateTitleSimilarity(title1: string, title2: string): number {
        const t1Lower = title1.toLowerCase().trim();
        const t2Lower = title2.toLowerCase().trim();
        
        // Exact match
        if (t1Lower === t2Lower) {
            return 100;
        }

        // Check if search term (title2) is at the start of the result title (title1)
        // e.g., Search: "Overflow", Result: "Overflow - Atsuku Majiwaru Shimai no Taboo" => 95
        // But Search: "Overflow - Atsuku", Result: "Overflow" => lower score (not a prefix match)
        // This prevents short results from matching long search terms
        if (t1Lower.startsWith(t2Lower + ' ') || t1Lower.startsWith(t2Lower + '-')) {
            return 95; // Very strong match - search term is exact prefix of result
        }

        // Normalize strings for comparison - remove special chars and split into words
        const normalize = (s: string) => {
            return s
                .replace(/[^\w\s]/g, '') // Remove special characters
                .toLowerCase()
                .split(/\s+/)
                .filter(word => word.length > 2); // Filter out short words
        };

        const words1 = normalize(t1Lower);
        const words2 = normalize(t2Lower);

        if (words1.length === 0 || words2.length === 0) {
            return 0;
        }

        // Count matching words (bidirectional)
        const matches1 = words1.filter(word => words2.includes(word)).length;
        const matches2 = words2.filter(word => words1.includes(word)).length;
        
        // Calculate percentage based on both directions
        const score1 = (matches1 / words1.length) * 100;
        const score2 = (matches2 / words2.length) * 100;
        
        // Use the lower score to be more conservative
        return Math.round(Math.min(score1, score2));
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // Comix can handle all manga by default
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        // Generate base variants (full titles only)
        const baseVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ].filter((v): v is string => !!v && v.trim().length > 0);

        // Generate shortened variants (before comma, colon, or pipe)
        // e.g., "Top Tier Providence, Secretly Cultivate for a Thousand Years" -> "Top Tier Providence"
        const shortenedVariants: string[] = [];
        for (const variant of baseVariants) {
            const shortened = variant
                .split(/[,:|]/)[0]
                .trim();
            if (shortened && shortened !== variant && !baseVariants.includes(shortened)) {
                shortenedVariants.push(shortened);
            }
        }

        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: appConfig.scraper.comix.userAgent,
            // Disable storage to prevent genre filters from being injected
            storageState: undefined,
        });
        const page = await context.newPage();

        try {
            // Phase 1: Try full title variants first
            console.log(`[Comix] Phase 1: Trying ${baseVariants.length} full title variants`);
            for (const variant of baseVariants) {
                console.log(`[Comix] Searching for "${variant}"`);
                const searchUrl = `${SITE_BASE}/browser?keyword=${encodeURIComponent(variant)}&order=relevance:desc&genres_mode=and`;

                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });

                // Set filter options in sessionStorage with empty genres to prevent stored filters
                await page.evaluate((query) => {
                    const filterOptions = {
                        keyword: query,
                        order: 'relevance:desc',
                        types: [],
                        genres: [], // Empty genres array to prevent filtering
                    };
                    sessionStorage.setItem('filter_options', JSON.stringify(filterOptions));
                }, variant);

                // Wait for search results to render
                try {
                    await page.waitForSelector('.comic .item a.title[href]', { timeout: 10000 });
                } catch (e) {
                    continue;
                }

                // Extract search results from Comix's structure
                const results = await page.evaluate(() => {
                    const items = Array.from(
                        document.querySelectorAll('.comic .item')
                    );

                    return items.map((item: any) => {
                        const titleLink = item.querySelector('a.title[href]');
                        if (!titleLink) return null;

                        const href = titleLink.href;
                        const title = titleLink.textContent?.trim() || '';

                        return { href, title };
                    }).filter((r: any) => r !== null && r.href && r.title);
                });

                if (results.length === 0) {
                    console.log(`[Comix] No results found for "${variant}"`);
                    continue;
                }

                console.log(`[Comix] Found ${results.length} results for "${variant}"`);

                // Score and sort results based on title similarity
                const scored = results
                    .map((result: any) => {
                        const similarity = this.calculateTitleSimilarity(result.title, variant);
                        return {
                            href: result.href,
                            title: result.title,
                            score: similarity,
                        };
                    })
                    .filter((r: any) => r.score >= 70) // Require at least 70% match
                    .sort((a: any, b: any) => b.score - a.score);

                if (scored.length > 0) {
                    const bestMatch = scored[0];
                    console.log(`[Comix] Found match with full title variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`);
                    logger.info(
                        `[Comix] Found match for "${mangaName}" with variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`,
                        { service: 'comixScraper' }
                    );
                    return bestMatch; // Found match with full title
                }
                console.log(`[Comix] No matches above threshold for "${variant}"`);
            }

            // Phase 2: Only if no full title match, try shortened variants as fallback
            if (shortenedVariants.length > 0) {
                console.log(`[Comix] Phase 2: No full title match found, trying ${shortenedVariants.length} shortened variants as fallback`);
                for (const variant of shortenedVariants) {
                    console.log(`[Comix] Searching for shortened variant "${variant}"`);
                    const searchUrl = `${SITE_BASE}/browser?keyword=${encodeURIComponent(variant)}&order=relevance:desc&genres_mode=and`;

                    await page.goto(searchUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });

                    await page.evaluate((query) => {
                        const filterOptions = {
                            keyword: query,
                            order: 'relevance:desc',
                            types: [],
                            genres: [],
                        };
                        sessionStorage.setItem('filter_options', JSON.stringify(filterOptions));
                    }, variant);

                    try {
                        await page.waitForSelector('.comic .item a.title[href]', { timeout: 10000 });
                    } catch (e) {
                        continue;
                    }

                    const results = await page.evaluate(() => {
                        const items = Array.from(
                            document.querySelectorAll('.comic .item')
                        );

                        return items.map((item: any) => {
                            const titleLink = item.querySelector('a.title[href]');
                            if (!titleLink) return null;

                            const href = titleLink.href;
                            const title = titleLink.textContent?.trim() || '';

                            return { href, title };
                        }).filter((r: any) => r !== null && r.href && r.title);
                    });

                    if (results.length === 0) {
                        console.log(`[Comix] No results found for shortened variant "${variant}"`);
                        continue;
                    }

                    console.log(`[Comix] Found ${results.length} results for shortened variant "${variant}"`);

                    const scored = results
                        .map((result: any) => {
                            const similarity = this.calculateTitleSimilarity(result.title, variant);
                            return {
                                href: result.href,
                                title: result.title,
                                score: similarity,
                            };
                        })
                        .filter((r: any) => r.score >= 70)
                        .sort((a: any, b: any) => b.score - a.score);

                    if (scored.length > 0) {
                        const bestMatch = scored[0];
                        console.log(`[Comix] Found match with shortened variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`);
                        logger.info(
                            `[Comix] Found match for "${mangaName}" with shortened variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`,
                            { service: 'comixScraper' }
                        );
                        return bestMatch; // Found match with shortened variant
                    }
                    console.log(`[Comix] No matches above threshold for shortened variant "${variant}"`);
                }
            }

            // No matches found after trying all variants
            const allVariants = [...baseVariants, ...shortenedVariants];
            logger.warn(
                `[Comix] Could not find manga link for "${mangaName}". Variants: ${allVariants.join(', ')}`,
                { service: 'comixScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[Comix] Search failed: ${error}`,
                { service: 'comixScraper' }
            );
            throw error;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await browser.close().catch(() => {});
        }
    }

    /**
     * Fetch all chapters for a manga with pagination support
     */
    private async fetchAllChapters(mangaId: string): Promise<ComixChapterItem[]> {
        const allChapters: ComixChapterItem[] = [];
        let currentPage = 1;
        let totalPages = 1;

        while (currentPage <= totalPages) {
            try {
                const response = await ComixScraper.rateLimitedRequest(
                    `${API_BASE}/manga/${mangaId}/chapters`,
                    {
                        params: {
                            limit: 100,
                            page: currentPage,
                        },
                    }
                );

                const data: ComixChaptersResponse = response.data;

                if (data.status !== 200 || !data.result || !data.result.items) {
                    logger.error(
                        `[Comix] Invalid API response for manga "${mangaId}" page ${currentPage}`,
                        { service: 'comixScraper' }
                    );
                    break;
                }

                // Filter for English chapters only
                const englishChapters = data.result.items.filter(
                    chapter => chapter.language === 'en'
                );

                allChapters.push(...englishChapters);

                // Update pagination info
                totalPages = data.result.pagination.last_page;
                currentPage++;
            } catch (error) {
                logger.error(
                    `[Comix] Failed to fetch chapters page ${currentPage}: ${error}`,
                    { service: 'comixScraper' }
                );
                break;
            }
        }

        // Sort chapters by number (ascending)
        allChapters.sort((a, b) => a.number - b.number);

        return allChapters;
    }

    async* scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        coverUrl?: string,
        includeGenres?: string[]
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
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
                    `[Comix] ${error}`,
                    { service: 'comixScraper' }
                );
                throw new Error(error);
            }

            // Extract manga ID from URL
            // URL format: https://comix.to/title/nyne-what-happens-inside-the-dungeon
            // API uses only the ID before the first hyphen: nyne
            const mangaIdMatch = bestMatch.href.match(/\/title\/([^-]+)/);
            if (!mangaIdMatch) {
                throw new Error(`Could not extract manga ID from URL: ${bestMatch.href}`);
            }

            const mangaId = mangaIdMatch[1];

            // Fetch all chapters with pagination
            const chapters = await this.fetchAllChapters(mangaId);

            let yieldedCount = 0;

            // Process and yield chapters
            for (const chapter of chapters) {
                const chapterNumber = chapter.number.toString();
                
                // Create chapter title
                let chapterTitle = `Chapter ${chapterNumber}`;
                if (chapter.name && chapter.name.trim().length > 0) {
                    chapterTitle += `: ${chapter.name}`;
                }

                // Determine if special chapter
                const isSpecial = chapterNumber.includes('.') || chapter.name.toLowerCase().includes('special');

                // Skip if chapter already exists
                if (await checkExists(chapterNumber)) {
                    continue;
                }

                // Build chapter URL using the ID and chapter ID
                const chapterUrl = `${SITE_BASE}/title/${mangaId}/${chapter.chapter_id}`;

                yieldedCount++;

                yield {
                    url: chapterUrl,
                    title: chapterTitle,
                    number: chapterNumber,
                    isSpecial: isSpecial,
                    specialType: isSpecial ? 'extra' : undefined,
                };
            }
        } catch (error) {
            logger.error(
                `[Comix] Chapter scraping failed for "${mangaName}": ${error}`,
                { service: 'comixScraper' }
            );
            throw error;
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
            userAgent: appConfig.scraper.comix.userAgent,
        });
        const page = await context.newPage();

        try {
            // Navigate to chapter page and wait for network to be idle
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 60000,
            });

            // Wait for the reader to load
            await page.waitForSelector('.read-viewer', { timeout: 10000 });
            await page.waitForTimeout(3000);

            // Get total number of pages (divs are pre-rendered)
            const totalPages = await page.evaluate(() => {
                return document.querySelectorAll('.read-viewer .page').length;
            });

            if (totalPages === 0) {
                throw new Error('No pages found in chapter');
            }

            // Scroll to load all images
            let loadedImages = 0;
            let noProgressCount = 0;
            let attempt = 0;
            const maxAttempts = 200;

            while (attempt < maxAttempts && loadedImages < totalPages) {
                attempt++;
                
                // Count images that have actually loaded (have src attribute)
                const previousLoaded = loadedImages;
                try {
                    loadedImages = await page.evaluate(() => {
                        return document.querySelectorAll('.read-viewer .page img[src]').length;
                    });
                } catch (evalError) {
                    logger.error(
                        `[Comix] Error evaluating page: ${evalError}`,
                        { service: 'comixScraper' }
                    );
                    break;
                }

                if (loadedImages === previousLoaded) {
                    noProgressCount++;
                    // If no progress for 5 attempts, we might be stuck
                    if (noProgressCount >= 5 && loadedImages >= totalPages * 0.9) {
                        // Close enough, probably got them all
                        break;
                    }
                } else {
                    noProgressCount = 0;
                }

                if (loadedImages >= totalPages) {
                    break;
                }

                // Scroll the viewer container itself, not the window
                await page.evaluate(() => {
                    const viewer = document.querySelector('.read-viewer');
                    if (viewer) {
                        viewer.scrollIntoView({ behavior: 'auto', block: 'end' });
                    }
                    // Also try scrolling by page height to trigger lazy loading
                    window.scrollBy(0, window.innerHeight * 2);
                });

                await page.waitForTimeout(500);
            }

            // Extract image URLs from the read-viewer container
            const finalImages = await page.evaluate(() => {
                const images = Array.from(
                    document.querySelectorAll('.read-viewer .page img')
                );
                
                return images
                    .map(img => img.getAttribute('src'))
                    .filter((src): src is string => !!src && src.startsWith('http'));
            });

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
                        'User-Agent': appConfig.scraper.comix.userAgent,
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
                    `[Comix] Failed to download image ${i + 1}: ${err.message}`,
                    { service: 'comixScraper' }
                );
                throw err;
            }
        }

        return storagePrefix;
    }
}
