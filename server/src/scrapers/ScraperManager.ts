/**
 * Scraper Manager
 * 
 * Central orchestrator for all manga scrapers. Manages multiple scraper
 * implementations with priority-based fallback.
 * 
 * Features:
 * - Priority-based scraper selection
 * - Automatic fallback to lower priority scrapers on failure
 * - Dynamic scraper registration
 * - Health tracking and circuit breaking
 * - Comprehensive error handling and logging
 * 
 * Architecture:
 * - Services call ScraperManager instead of individual scrapers
 * - ScraperManager tries scrapers in priority order (1 = highest)
 * - If highest priority fails, automatically tries next available
 * - All scraper implementations follow IChapterScraper interface
 */

import {
    IChapterScraper,
    ScrapedChapter,
    DownloadedChapter,
    MangaSearchResult,
    SearchOptions,
} from './interfaces/IChapterScraper';
import logger from '@/services/loggerService';
import { titleSearchSemaphore } from '@/services/titleSearchSemaphore';
import { cacheService } from '@/services/cacheService';

/**
 * Scraper attempt result (for logging and debugging)
 */
interface ScraperAttempt {
    scraperId: string;
    scraperName: string;
    priority: number;
    success: boolean;
    error?: string;
    timestamp: Date;
}

/**
 * Scraper Manager
 * Manages all registered scrapers and handles fallback logic
 */
export class ScraperManager {
    private scrapers: IChapterScraper[] = [];
    private attemptHistory: Map<string, ScraperAttempt[]> = new Map();

    /**
     * Register a new scraper
     * Scrapers are automatically sorted by priority after registration
     * 
     * @param scraper - Scraper instance to register
     */
    registerScraper(scraper: IChapterScraper): void {
        const metadata = scraper.getMetadata();
        
        // Check for duplicate IDs
        const existing = this.scrapers.find(s => s.getMetadata().id === metadata.id);
        if (existing) {
            logger.warn(
                `Scraper with ID "${metadata.id}" already registered, skipping duplicate`,
                { service: 'scraperManager' }
            );
            return;
        }

        this.scrapers.push(scraper);
        
        // Sort by priority (1 = highest priority)
        this.scrapers.sort((a, b) => {
            const priorityA = a.getMetadata().priority;
            const priorityB = b.getMetadata().priority;
            return priorityA - priorityB;
        });

        logger.info(
            `Registered scraper: ${metadata.name} (ID: ${metadata.id}, Priority: ${metadata.priority}, Enabled: ${metadata.enabled})`,
            { service: 'scraperManager' }
        );
    }

    /**
     * Get all registered scrapers (sorted by priority)
     */
    getScrapers(): IChapterScraper[] {
        return [...this.scrapers];
    }

    /**
     * Get enabled scrapers only (sorted by priority)
     */
    getEnabledScrapers(): IChapterScraper[] {
        return this.scrapers.filter(s => s.getMetadata().enabled);
    }

    /**
     * Get scraper by ID
     */
    getScraperById(id: string): IChapterScraper | undefined {
        return this.scrapers.find(s => s.getMetadata().id === id);
    }

    /**
     * Find best match for a manga across all scrapers
     * Tries ALL enabled scrapers and picks the one with the highest score
     * 
     * @param mangaName - Name of the manga to search for
     * @param options - Search options (romanized title, series ID, etc.)
     * @returns Best match result with scraper info
     */
    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<{ scraper: IChapterScraper; result: MangaSearchResult } | undefined> {
        // Check cache first
        const cacheKey = `titleSearch:${mangaName.toLowerCase()}`;
        const cached = await cacheService.get<{ scraperId: string; result: MangaSearchResult }>(cacheKey);
        if (cached) {
            const scraper = this.getScraperById(cached.scraperId);
            if (scraper) {
                logger.debug(`Cache hit for title search: "${mangaName}"`, { service: 'scraperManager' });
                return { scraper, result: cached.result };
            }
        }

        // Lock to prevent concurrent title searches (rate limiting protection)
        return await titleSearchSemaphore.lock(async () => {
            const enabledScrapers = this.getEnabledScrapers();

            if (enabledScrapers.length === 0) {
                logger.error('No enabled scrapers available', { service: 'scraperManager' });
                return undefined;
            }

            logger.info(
                `Searching for "${mangaName}" across ${enabledScrapers.length} scrapers`,
                { service: 'scraperManager' }
            );

            // Store all successful matches with their scores
            const matches: Array<{
                scraper: IChapterScraper;
                result: MangaSearchResult;
                scraperName: string;
                priority: number;
            }> = [];

            // Try ALL scrapers concurrently and collect matches
            const scraperPromises = enabledScrapers.map(async (scraper) => {
                const metadata = scraper.getMetadata();
                
                try {
                    // Check if scraper can handle this manga
                    const canHandle = await scraper.canHandle(mangaName, options?.seriesId);
                    if (!canHandle) {
                        logger.debug(
                            `Scraper ${metadata.name} cannot handle "${mangaName}", skipping`,
                            { service: 'scraperManager' }
                        );
                        return null;
                    }

                    logger.info(
                        `Attempting search with ${metadata.name} (priority ${metadata.priority})`,
                        { service: 'scraperManager' }
                    );

                    const result = await scraper.findBestMatch(mangaName, options);

                    if (result) {
                        logger.info(
                            `✓ Found match using ${metadata.name}: "${result.title}" (score: ${result.score})`,
                            { service: 'scraperManager' }
                        );

                        this.recordAttempt(mangaName, metadata.id, metadata.name, metadata.priority, true);

                        return {
                            scraper,
                            result,
                            scraperName: metadata.name,
                            priority: metadata.priority,
                        };
                    } else {
                        logger.warn(
                            `Scraper ${metadata.name} found no match for "${mangaName}"`,
                            { service: 'scraperManager' }
                        );
                        return null;
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    const stack = error instanceof Error ? error.stack : undefined;
                    logger.error(
                        `Scraper ${metadata.name} failed during download: ${errorMessage}${stack ? `\n${stack}` : ''}`,
                        { service: 'scraperManager', error: error instanceof Error ? error : undefined }
                    );

                    this.recordAttempt(
                        mangaName,
                        metadata.id,
                        metadata.name,
                        metadata.priority,
                        false,
                        errorMessage
                    );

                    return null;
                }
            });

            // Wait for all scrapers to complete
            const results = await Promise.all(scraperPromises);
            
            matches.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));

            if (matches.length === 0) {
                logger.error(
                    `Failed to find "${mangaName}" using any available scraper`,
                    { service: 'scraperManager' }
                );
                return undefined;
            }

            // Sort by score (highest first), then by priority (lowest number = highest priority)
            // Special handling for nHentai: heavily deprioritize when main sources have reasonable matches
            // This prevents nHentai doujinshi/collections from overriding actual manga series
            matches.sort((a, b) => {
                // FIRST: Check if this is nHentai vs a main source (deprioritization override)
                const aIsNHentai = a.scraper.getMetadata().id === 'nhentai';
                const bIsNHentai = b.scraper.getMetadata().id === 'nhentai';
                
                // If one is nHentai and the other is a main source (WeebCentral, MangaDex, MangaTaro)
                if (aIsNHentai !== bIsNHentai) {
                    const mainSource = aIsNHentai ? b : a;
                    const nHentaiMatch = aIsNHentai ? a : b;
                    
                    // Main sources: WebCentral (1), MangaTaro (2), MangaDex (4)
                    // If main source has a reasonable score, strongly prefer it over nHentai
                    // unless nHentai is doing SIGNIFICANTLY better
                    if (mainSource.result.score >= 70) {
                        logger.debug(
                            `Preferring ${mainSource.scraperName} (${mainSource.result.score}) over nHentai (${nHentaiMatch.result.score}) ` +
                            `because main source has reasonable match score`,
                            { service: 'scraperManager' }
                        );
                        return aIsNHentai ? 1 : -1; // Prefer main source
                    }
                    
                    // If main source has a moderate score (50-69), prefer it unless nHentai is significantly better (40+ points)
                    if (mainSource.result.score >= 50) {
                        const scoreDiff = nHentaiMatch.result.score - mainSource.result.score;
                        if (scoreDiff < 40) {
                            logger.debug(
                                `Preferring ${mainSource.scraperName} (${mainSource.result.score}) over nHentai (${nHentaiMatch.result.score}) ` +
                                `because main source has decent match`,
                                { service: 'scraperManager' }
                            );
                            return aIsNHentai ? 1 : -1; // Prefer main source
                        }
                    }
                }
                
                // SECOND: Exact match bonus - if one result has a perfect/near-perfect score (95+),
                // heavily prioritize it over lower scores
                const aIsNearPerfect = a.result.score >= 95;
                const bIsNearPerfect = b.result.score >= 95;
                
                if (aIsNearPerfect !== bIsNearPerfect) {
                    // One is near-perfect, the other isn't - prefer the near-perfect one
                    return aIsNearPerfect ? -1 : 1;
                }
                
                // If both are near-perfect, score difference matters more
                if (aIsNearPerfect && bIsNearPerfect) {
                    const scoreDiff = Math.abs(a.result.score - b.result.score);
                    if (scoreDiff > 0) {
                        return b.result.score - a.result.score; // Higher score wins
                    }
                    // If same score, use priority
                    return a.priority - b.priority;
                }
                
                // THIRD: Standard scoring logic
                if (b.result.score !== a.result.score) {
                    return b.result.score - a.result.score;
                }
                return a.priority - b.priority;
            });

            const bestMatch = matches[0];

            // Cache the result (30 minute TTL)
            await cacheService.set(cacheKey, {
                scraperId: bestMatch.scraper.getMetadata().id,
                result: bestMatch.result,
            }, 1800);

            return { scraper: bestMatch.scraper, result: bestMatch.result };
        });
    }

    /**
     * Scrape chapters using best match selection
     * Finds the best manga match across ALL scrapers, then scrapes its chapters
     * 
     * @param mangaName - Name of the manga
     * @param checkExists - Function to check if chapter already exists
     * @param seriesId - Series ID from database
     * @param romanizedTitle - Romanized title for search
     * @param coverUrl - Cover URL for notifications
     * @returns Async generator yielding chapters
     */
    async* scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        coverUrl?: string,
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        logger.info(
            `Scraping chapters for "${mangaName}"`,
            { service: 'scraperManager' }
        );

        try {
            // First, find the best manga match across ALL scrapers using the new selection logic
            const bestMatchResult = await this.findBestMatch(mangaName, {
                seriesId,
                romanizedTitle,
                nativeTitle,
                secondaryTitles,
                coverUrl,
            });

            if (!bestMatchResult) {
                throw new Error(`Failed to find "${mangaName}" using any available scraper`);
            }

            const { scraper, result } = bestMatchResult;
            const metadata = scraper.getMetadata();

            logger.info(
                `Using ${metadata.name} for "${mangaName}" (score: ${result.score})`,
                { service: 'scraperManager' }
            );

            try {
                let chapterCount = 0;

                // Scrape chapters from the selected scraper
                for await (const chapter of scraper.scrapeChapters(
                    mangaName,
                    checkExists,
                    seriesId,
                    romanizedTitle,
                    nativeTitle,
                    secondaryTitles,
                    coverUrl,
                )) {
                    chapterCount++;
                    // Attach scraper ID to chapter before yielding
                    yield {
                        ...chapter,
                        scraperId: metadata.id,
                    };
                }

                logger.info(
                    `✓ Successfully scraped ${chapterCount} chapters using ${metadata.name}`,
                    { service: 'scraperManager' }
                );

                this.recordAttempt(mangaName, metadata.id, metadata.name, metadata.priority, true);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(
                    `Scraper ${metadata.name} failed during chapter scraping: ${errorMessage}`,
                    { service: 'scraperManager' }
                );

                this.recordAttempt(
                    mangaName,
                    metadata.id,
                    metadata.name,
                    metadata.priority,
                    false,
                    errorMessage
                );

                throw error;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(
                `Chapter scraping failed for "${mangaName}": ${errorMessage}`,
                { service: 'scraperManager' }
            );

            // Discord notification is sent by the queue layer only when all retries are exhausted
            throw error;
        }
    }

    /**
     * Download chapter using priority fallback
     * Tries scrapers in priority order until successful
     * 
     * @param url - Chapter URL
     * @param seriesId - Series ID from database
     * @param chapterNumber - Chapter number
     * @param mangaName - Manga name (for logging/notifications)
     * @param folderName - Folder name for this chapter (for logging, usually chapter title)
     * @returns Downloaded chapter info with storage prefix
     */
    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const enabledScrapers = this.getEnabledScrapers();

        if (enabledScrapers.length === 0) {
            throw new Error('No enabled scrapers available');
        }

        logger.info(
            `Downloading chapter ${chapterNumber} for series ${seriesId} from ${url}`,
            { service: 'scraperManager' }
        );

        // Try each scraper in priority order
        for (const scraper of enabledScrapers) {
            const metadata = scraper.getMetadata();

            try {
                // Check if this URL belongs to this scraper's domain
                if (!url.includes(new URL(metadata.baseUrl).hostname)) {
                    logger.debug(
                        `URL ${url} doesn't match ${metadata.name} domain, skipping`,
                        { service: 'scraperManager' }
                    );
                    continue;
                }

                logger.info(
                    `Attempting download with ${metadata.name}`,
                    { service: 'scraperManager' }
                );

                const result = await scraper.downloadChapter(url, seriesId, chapterNumber, mangaName, folderName);

                logger.info(
                    `✓ Successfully downloaded ${result.pageCount} pages using ${metadata.name}`,
                    { service: 'scraperManager' }
                );

                this.recordAttempt(`download:${url}`, metadata.id, metadata.name, metadata.priority, true);

                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(
                    `Scraper ${metadata.name} failed during download: ${errorMessage}`,
                    { service: 'scraperManager' }
                );

                this.recordAttempt(
                    `download:${url}`,
                    metadata.id,
                    metadata.name,
                    metadata.priority,
                    false,
                    errorMessage
                );

                // Continue to next scraper (fallback behavior)
                continue;
            }
        }

        // All scrapers failed
        throw new Error(`Failed to download chapter from ${url} using any available scraper`);
    }

    /**
     * Record scraper attempt for analytics and debugging
     */
    private recordAttempt(
        key: string,
        scraperId: string,
        scraperName: string,
        priority: number,
        success: boolean,
        error?: string
    ): void {
        const attempt: ScraperAttempt = {
            scraperId,
            scraperName,
            priority,
            success,
            error,
            timestamp: new Date(),
        };

        const history = this.attemptHistory.get(key) || [];
        history.push(attempt);

        // Keep only last 100 attempts per key
        if (history.length > 100) {
            history.shift();
        }

        this.attemptHistory.set(key, history);
    }

    /**
     * Get attempt history for a manga (for debugging)
     */
    getAttemptHistory(key: string): ScraperAttempt[] {
        return this.attemptHistory.get(key) || [];
    }

    /**
     * Get scraper statistics
     */
    getStats(): {
        totalScrapers: number;
        enabledScrapers: number;
        scrapers: Array<{
            id: string;
            name: string;
            priority: number;
            enabled: boolean;
        }>;
    } {
        return {
            totalScrapers: this.scrapers.length,
            enabledScrapers: this.getEnabledScrapers().length,
            scrapers: this.scrapers.map(s => {
                const metadata = s.getMetadata();
                return {
                    id: metadata.id,
                    name: metadata.name,
                    priority: metadata.priority,
                    enabled: metadata.enabled,
                };
            }),
        };
    }
}

// Singleton instance
export const scraperManager = new ScraperManager();
