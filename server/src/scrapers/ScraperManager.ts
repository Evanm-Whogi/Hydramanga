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
import { discordService } from '@/services/discordService';

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

        // Try ALL scrapers and collect matches
        for (const scraper of enabledScrapers) {
            const metadata = scraper.getMetadata();
            
            try {
                // Check if scraper can handle this manga
                const canHandle = await scraper.canHandle(mangaName, options?.seriesId);
                if (!canHandle) {
                    logger.debug(
                        `Scraper ${metadata.name} cannot handle "${mangaName}", skipping`,
                        { service: 'scraperManager' }
                    );
                    continue;
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

                    matches.push({
                        scraper,
                        result,
                        scraperName: metadata.name,
                        priority: metadata.priority,
                    });

                    this.recordAttempt(mangaName, metadata.id, metadata.name, metadata.priority, true);
                } else {
                    logger.warn(
                        `Scraper ${metadata.name} found no match for "${mangaName}"`,
                        { service: 'scraperManager' }
                    );
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(
                    `Scraper ${metadata.name} failed: ${errorMessage}`,
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

                // Continue to next scraper
                continue;
            }
        }

        // No scrapers found a match
        if (matches.length === 0) {
            logger.error(
                `Failed to find "${mangaName}" using any available scraper`,
                { service: 'scraperManager' }
            );
            return undefined;
        }

        // Sort by score (highest first), then by priority (lowest number = highest priority)
        // Special case: if scores are within 20 points, prefer higher priority scraper
        // This handles cases where a complete source (Comix: 95) should beat a partial source (nHentai: 115)
        matches.sort((a, b) => {
            const scoreDiff = Math.abs(a.result.score - b.result.score);
            
            // If scores are close (within 20 points), use priority as primary sort
            if (scoreDiff <= 20) {
                return a.priority - b.priority; // Lower priority number wins
            }
            
            // Otherwise, higher score wins
            if (b.result.score !== a.result.score) {
                return b.result.score - a.result.score;
            }
            
            // Exact tie: use priority
            return a.priority - b.priority;
        });

        const bestMatch = matches[0];

        logger.info(
            `🎯 Best match: "${bestMatch.result.title}" from ${bestMatch.scraperName} (score: ${bestMatch.result.score})`,
            { service: 'scraperManager' }
        );

        // Log all other candidates for comparison
        if (matches.length > 1) {
            logger.info(
                `Other candidates: ${matches.slice(1).map(m => `${m.scraperName}="${m.result.title}" (${m.result.score})`).join(', ')}`,
                { service: 'scraperManager' }
            );
        }

        return { scraper: bestMatch.scraper, result: bestMatch.result };
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

            // Notify Discord of failure if we have a series ID
            if (seriesId) {
                await discordService.notifyScraperFailed(
                    mangaName,
                    seriesId,
                    [],
                    coverUrl
                );
            }

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
