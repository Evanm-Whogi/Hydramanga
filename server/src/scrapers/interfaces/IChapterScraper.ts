/**
 * Chapter Scraper Interface
 * 
 * Defines the contract that all manga scrapers must implement.
 * This interface enables a pluggable scraper architecture where multiple
 * sources can be added without modifying core business logic.
 * 
 * Design Principles:
 * - Each scraper is responsible for a single manga source
 * - Scrapers are stateless and can be used concurrently
 * - Each scraper has a priority for fallback ordering
 * - Each scraper can indicate if it supports a particular manga
 */

/**
 * Chapter metadata returned from scraping
 */
export interface ScrapedChapter {
    /** Absolute URL to the chapter page */
    url: string;
    /** Human-readable chapter title (e.g., "Chapter 42.5: Beach Episode") */
    title: string;
    /** Chapter number as string (supports decimals like "42.5") */
    number: string;
    /** Whether this is a special chapter (bonus, extra, etc.) */
    isSpecial: boolean;
    /** Type of special chapter (bonus, extra, omake, etc.) */
    specialType?: string;
}

/**
 * Downloaded chapter result
 */
export interface DownloadedChapter {
    /** Local filesystem path where chapter images are stored */
    path: string;
    /** Number of pages (images) in the chapter */
    pageCount: number;
}

/**
 * Search result from manga lookup
 */
export interface MangaSearchResult {
    /** URL to the manga's main page */
    href: string;
    /** Title of the manga as shown on the source site */
    title?: string;
    /** Confidence score (0-100, higher is better match) */
    score: number;
}

/**
 * Options for manga search
 */
export interface SearchOptions {
    /** Series ID from our database */
    seriesId?: number;
    /** URL to manga cover image (for notifications) */
    coverUrl?: string;
    /** Romanized version of the title (alternative search term) */
    romanizedTitle?: string;
}

/**
 * Scraper metadata and configuration
 */
export interface ScraperMetadata {
    /** Unique identifier for this scraper */
    id: string;
    /** Human-readable name */
    name: string;
    /** Base URL of the manga source */
    baseUrl: string;
    /** Priority (1 = highest, higher numbers = lower priority) */
    priority: number;
    /** Whether this scraper is currently enabled */
    enabled: boolean;
}

/**
 * Main Chapter Scraper Interface
 * 
 * Each scraper must implement:
 * 1. Chapter discovery (scanning for available chapters)
 * 2. Chapter download (downloading images for a specific chapter)
 * 3. Manga search (finding the correct manga page on the source)
 * 4. Support checking (determining if this scraper can handle a manga)
 */
export interface IChapterScraper {
    /**
     * Get scraper metadata
     */
    getMetadata(): ScraperMetadata;

    /**
     * Check if this scraper can handle a specific manga
     * 
     * This method allows scrapers to opt-out of handling certain manga.
     * Useful for source-specific restrictions or regional availability.
     * 
     * @param mangaName - Name of the manga
     * @param seriesId - Series ID from database
     * @returns Promise<boolean> - true if this scraper can handle the manga
     */
    canHandle(mangaName: string, seriesId?: number): Promise<boolean>;

    /**
     * Search for a manga and return the best match
     * 
     * Implementations should:
     * - Query the source's search API/page
     * - Score results by relevance
     * - Return the highest confidence match
     * - Return undefined if no good match found
     * 
     * @param mangaName - Primary manga name to search for
     * @param options - Additional search options (romanized title, series ID, etc.)
     * @returns Promise<MangaSearchResult | undefined> - Best match or undefined
     */
    findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined>;

    /**
     * Scrape chapter list from manga page
     * 
     * This is an async generator that yields chapters as they're discovered.
     * Using a generator allows processing chapters incrementally without
     * loading the entire list into memory.
     * 
     * Implementations should:
     * - Navigate to the manga's main page
     * - Extract all chapter links
     * - Parse chapter numbers and titles
     * - Filter out chapters that already exist (via checkExists)
     * - Yield chapters one at a time
     * 
     * @param mangaName - Name of the manga to scrape
     * @param checkExists - Async function to check if a chapter already exists
     * @param seriesId - Series ID from database
     * @param romanizedTitle - Romanized title for better search results
     * @param coverUrl - Cover image URL (for error notifications)
     * @yields ScrapedChapter - Chapter metadata for each discovered chapter
     */
    scrapeChapters(
        mangaName: string,
        checkExists: (chapterNumber: string) => Promise<boolean>,
        seriesId?: number,
        romanizedTitle?: string,
        coverUrl?: string
    ): AsyncGenerator<ScrapedChapter, void, undefined>;

    /**
     * Download chapter images and store locally
     * 
     * Implementations should:
     * - Navigate to the chapter page
     * - Extract all image URLs
     * - Download images with proper headers (referer, user-agent, etc.)
     * - Save images to local filesystem with consistent naming
     * - Return local path and page count
     * 
     * @param url - URL to the chapter page
     * @param mangaName - Name of the manga (for folder structure)
     * @param folderName - Folder name for this chapter (usually chapter title)
     * @returns Promise<DownloadedChapter> - Local path and page count
     */
    downloadChapter(
        url: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter>;
}
