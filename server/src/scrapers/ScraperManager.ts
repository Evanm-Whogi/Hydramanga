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
     * Tries scrapers in priority order until finding a match
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

        // Try each scraper in priority order
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

                    this.recordAttempt(mangaName, metadata.id, metadata.name, metadata.priority, true);
                    return { scraper, result };
                }

                logger.warn(
                    `Scraper ${metadata.name} found no match for "${mangaName}"`,
                    { service: 'scraperManager' }
                );
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

                // Continue to next scraper (fallback behavior)
                continue;
            }
        }

        // No scrapers found a match
        logger.error(
            `Failed to find "${mangaName}" using any available scraper`,
            { service: 'scraperManager' }
        );

        return undefined;
    }

    /**
     * Scrape chapters using priority fallback
     * Tries scrapers in priority order until successful
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
        coverUrl?: string
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        const enabledScrapers = this.getEnabledScrapers();

        if (enabledScrapers.length === 0) {
            throw new Error('No enabled scrapers available');
        }

        logger.info(
            `Scraping chapters for "${mangaName}" using ${enabledScrapers.length} available scrapers`,
            { service: 'scraperManager' }
        );

        // Try each scraper in priority order
        for (const scraper of enabledScrapers) {
            const metadata = scraper.getMetadata();

            try {
                // Check if scraper can handle this manga
                const canHandle = await scraper.canHandle(mangaName, seriesId);
                if (!canHandle) {
                    logger.debug(
                        `Scraper ${metadata.name} cannot handle "${mangaName}", trying next`,
                        { service: 'scraperManager' }
                    );
                    continue;
                }

                logger.info(
                    `Attempting chapter scrape with ${metadata.name} (priority ${metadata.priority})`,
                    { service: 'scraperManager' }
                );

                let chapterCount = 0;

                // Delegate to scraper's chapter scraping implementation
                for await (const chapter of scraper.scrapeChapters(
                    mangaName,
                    checkExists,
                    seriesId,
                    romanizedTitle,
                    coverUrl
                )) {
                    chapterCount++;
                    yield chapter;
                }

                logger.info(
                    `✓ Successfully scraped ${chapterCount} chapters using ${metadata.name}`,
                    { service: 'scraperManager' }
                );

                this.recordAttempt(mangaName, metadata.id, metadata.name, metadata.priority, true);

                // Success - stop trying other scrapers
                return;
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

                // Continue to next scraper (fallback behavior)
                continue;
            }
        }

        // All scrapers failed - notify Discord before throwing error
        if (seriesId) {
            logger.error(
                `All ${enabledScrapers.length} scrapers failed for "${mangaName}". Notifying Discord.`,
                { service: 'scraperManager' }
            );
            
            await discordService.notifyScraperFailed(
                mangaName,
                seriesId,
                [], // No search results to show since all scrapers failed
                coverUrl
            );
        }
        
        throw new Error(`Failed to scrape chapters for "${mangaName}" using any available scraper`);
    }

    /**
     * Download chapter using priority fallback
     * Tries scrapers in priority order until successful
     * 
     * @param url - Chapter URL
     * @param mangaName - Manga name
     * @param folderName - Local folder name
     * @returns Downloaded chapter info
     */
    async downloadChapter(
        url: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const enabledScrapers = this.getEnabledScrapers();

        if (enabledScrapers.length === 0) {
            throw new Error('No enabled scrapers available');
        }

        logger.info(
            `Downloading chapter from ${url}`,
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

                const result = await scraper.downloadChapter(url, mangaName, folderName);

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
