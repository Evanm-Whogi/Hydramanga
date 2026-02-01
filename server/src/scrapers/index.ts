/**
 * Scraper Registry Initialization
 * 
 * Central registration point for all manga scrapers.
 * Automatically registers all scrapers with the ScraperManager on application startup.
 * 
 * To add a new scraper:
 * 1. Create scraper class implementing IChapterScraper
 * 2. Add configuration to appConfig.ts
 * 3. Import and register here
 */

import { scraperManager } from './ScraperManager';
import { WeebCentralScraper } from './implementations/WeebCentralScraper';
import { MangaForestScraper } from './implementations/MangaForestScraper';
import { NHentaiScraper } from './implementations/nHentaiScraper';
import { MangaDexScraper } from './implementations/MangaDexScraper';
import logger from '@/services/loggerService';

/**
 * Initialize all scrapers
 * Call this during application startup
 */
export function initializeScrapers(): void {
    logger.info('Initializing manga scrapers...', { service: 'scraperRegistry' });

    // Register WeebCentral scraper
    const weebCentralScraper = new WeebCentralScraper();
    scraperManager.registerScraper(weebCentralScraper);

    // Register MangaForest scraper
    const mangaForestScraper = new MangaForestScraper();
    scraperManager.registerScraper(mangaForestScraper);

    // Register nHentai scraper
    const nHentaiScraper = new NHentaiScraper();
    scraperManager.registerScraper(nHentaiScraper);

    // Register MangaDex scraper
    const mangaDexScraper = new MangaDexScraper();
    scraperManager.registerScraper(mangaDexScraper);

    // Log registration summary
    const stats = scraperManager.getStats();
    logger.info(
        `Scrapers initialized: ${stats.enabledScrapers}/${stats.totalScrapers} enabled`,
        { service: 'scraperRegistry' }
    );

    // Log each scraper's details
    for (const scraper of stats.scrapers) {
        logger.info(
            `  - ${scraper.name} (priority: ${scraper.priority}, enabled: ${scraper.enabled})`,
            { service: 'scraperRegistry' }
        );
    }
}

/**
 * Export scraper manager singleton for use in services
 */
export { scraperManager } from './ScraperManager';
