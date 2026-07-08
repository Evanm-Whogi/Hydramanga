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
import { NHentaiScraper } from './implementations/nHentaiScraper';
import { MangaDexScraper } from './implementations/MangaDexScraper';
import { MangaTaroScraper } from './implementations/MangaTaroScraper';
import { ToonilyScraper } from './implementations/ToonilyScraper';
import { OnisagaScraper } from './implementations/OnisagaScraper';
import { AtsuMoeScraper } from './implementations/AtsuMoeScraper';
import { AsuraComicScraper } from './implementations/AsuraComicScraper';
import { ComixScraper } from './implementations/ComixScraper';
import { KaganeScraper } from './implementations/KaganeScraper';
import { MangagoScraper } from './implementations/MangagoScraper';
import logger from '@/services/loggerService';
import { MangaFireScraper } from './implementations/mangaFireScraper';

/**
 * Initialize all scrapers
 * Call this during application startup
 */
export function initializeScrapers(): void {
    logger.info('Initializing manga scrapers...', { service: 'scraperRegistry' });

    // Register WeebCentral scraper
    const weebCentralScraper = new WeebCentralScraper();
    scraperManager.registerScraper(weebCentralScraper);

    // Register AtsuMoe scraper
    const atsuMoeScraper = new AtsuMoeScraper();
    scraperManager.registerScraper(atsuMoeScraper);

    // Register AsuraComic scraper
    const asuraComicScraper = new AsuraComicScraper();
    scraperManager.registerScraper(asuraComicScraper);

    // Register MangaTaro scraper
    const mangaTaroScraper = new MangaTaroScraper();
    scraperManager.registerScraper(mangaTaroScraper);

    // Register nHentai scraper
    const nHentaiScraper = new NHentaiScraper();
    scraperManager.registerScraper(nHentaiScraper);

    // Register MangaDex scraper
    const mangaDexScraper = new MangaDexScraper();
    scraperManager.registerScraper(mangaDexScraper);

    // Register Toonily scraper
    const toonilyScraper = new ToonilyScraper();
    scraperManager.registerScraper(toonilyScraper);

    // Register Comix scraper
    // const comixScraper = new ComixScraper();
    // scraperManager.registerScraper(comixScraper);

    // Register Onisaga scraper
    // const onisagaScraper = new OnisagaScraper();
    // scraperManager.registerScraper(onisagaScraper);
    // onisagaScraper.startClearanceKeepAlive();

    // Register Kagane scraper
    // const kaganeScraper = new KaganeScraper();
    // scraperManager.registerScraper(kaganeScraper);

    // Register Mangago scraper
    const mangagoScraper = new MangagoScraper();
    scraperManager.registerScraper(mangagoScraper);
    mangagoScraper.startClearanceKeepAlive();

    // Register MangaFire scraper
    const mangaFireScraper = new MangaFireScraper();
    scraperManager.registerScraper(mangaFireScraper);

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
