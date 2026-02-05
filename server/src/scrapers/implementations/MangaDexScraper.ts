/**
 * MangaDex Scraper Implementation
 * 
 * Scraper for MangaDex.org manga source using their public API.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 * 
 * Features:
 * - Chapter list scraping via MangaDex API
 * - Image download with proper headers
 * - Search API integration
 * - Support for multiple languages (filters to English)
 * - Volume-based chapter organization
 * - Robust error handling and logging
 */

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
const API_BASE = appConfig.scraper.mangaDex.apiUrl;
const SITE_BASE = appConfig.scraper.mangaDex.baseUrl;

// MangaDex API constants
const MANGA_ENDPOINT = `${API_BASE}/manga`;
const CHAPTER_ENDPOINT = `${API_BASE}/chapter`;
const COVER_ENDPOINT = `${API_BASE}/cover`;

// Language code for English
const ENGLISH_LANG_CODE = 'en';

// Covers API for chapter pages
const COVERS_API = `${API_BASE}/manga/{id}/feed`;

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
 * MangaDex Scraper
 * Uses the official MangaDex API for reliable chapter discovery
 */
export class MangaDexScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'mangadex',
        name: 'MangaDex',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.mangaDex.priority,
        enabled: appConfig.scraper.mangaDex.enabled,
    };

    // Rate limiting: delay between requests in milliseconds
    // MangaDex has strict rate limits; use conservative delays
    private static readonly REQUEST_DELAY_MS = 1500;  // 1.5 seconds between requests
    private static lastRequestTime = 0;

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.mangaDex.timeout,
        headers: {
            'User-Agent': appConfig.scraper.mangaDex.userAgent,
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
     * Calculate similarity between two strings (0-100)
     * Uses a simple approach: check for common substrings and character overlap
     */
    private calculateTitleSimilarity(title1: string, title2: string): number {
        // Exact match
        if (title1 === title2) {
            return 100;
        }

        // Remove common words and punctuation for comparison
        const normalize = (s: string) => {
            return s
                .replace(/[^\w\s]/g, '') // Remove special characters
                .toLowerCase()
                .split(/\s+/)
                .filter(word => word.length > 0);
        };

        const words1 = normalize(title1);
        const words2 = normalize(title2);

        if (words1.length === 0 || words2.length === 0) {
            return 0;
        }

        // Count matching words
        const matches = words1.filter(word => words2.includes(word)).length;
        const totalWords = Math.max(words1.length, words2.length);
        
        return Math.round((matches / totalWords) * 100);
    }

    /**
     * Rate-limited HTTP request with retry logic for 429 errors
     */
    private static async rateLimitedRequest(
        url: string,
        config?: any,
        retries = 3
    ): Promise<any> {
        let lastError: any;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Enforce minimum delay between requests
                const timeSinceLastRequest = Date.now() - this.lastRequestTime;
                if (timeSinceLastRequest < this.REQUEST_DELAY_MS) {
                    await this.sleep(this.REQUEST_DELAY_MS - timeSinceLastRequest);
                }

                this.lastRequestTime = Date.now();
                return await this.axiosInstance.get(url, config);
            } catch (error: any) {
                lastError = error;
                
                // Handle rate limiting (429) with exponential backoff
                if (error.response?.status === 429) {
                    const retryAfter = error.response.headers['retry-after'] || Math.pow(2, attempt);
                    const waitMs = parseInt(retryAfter) * 1000;
                    
                    logger.warn(
                        `[MangaDex] Rate limited (429). Attempt ${attempt}/${retries}. Waiting ${waitMs}ms before retry...`,
                        { service: 'mangaDexScraper' }
                    );

                    if (attempt < retries) {
                        await this.sleep(waitMs);
                        continue;
                    }
                }
                
                // For non-429 errors or final retry, throw immediately
                throw error;
            }
        }
        
        // Should never reach here, but throw last error if we do
        throw lastError || new Error('Request failed after all retries');
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // MangaDex can handle all manga by default
        return true;
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        // Generate search variants
        const searchVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ].filter((v): v is string => !!v && v.trim().length > 0);

        logger.info(
            `[MangaDex] Trying ${searchVariants.length} search variants`,
            { service: 'mangaDexScraper' }
        );

        try {
            // Try each search variant
            for (const variant of searchVariants) {
                logger.info(
                    `[MangaDex] Searching for "${variant}"`,
                    { service: 'mangaDexScraper' }
                );

                // Search using MangaDex API
                const response = await MangaDexScraper.rateLimitedRequest(
                    `${MANGA_ENDPOINT}`,
                    {
                        params: {
                            title: variant,
                            limit: 10,
                            offset: 0,
                            includes: ['author', 'artist', 'cover_art'],
                        },
                    }
                );

                const mangas = response.data.data || [];

                if (mangas.length === 0) {
                    logger.debug(
                        `[MangaDex] No results for variant "${variant}", trying next`,
                        { service: 'mangaDexScraper' }
                    );
                    continue;
                }

                // Get the first (most relevant) result
                const manga = mangas[0];
                const mangaId = manga.id;
                
                // Extract title: prefer English, then Japanese, then any available language
                let title = manga.attributes.title[ENGLISH_LANG_CODE] || 
                           manga.attributes.title['ja'] || 
                           manga.attributes.title['ko'] || 
                           Object.values(manga.attributes.title)[0] || 
                           '';

                // Validate that we got a non-empty title
                if (!title || title.trim().length === 0) {
                    logger.debug(
                        `[MangaDex] Skipping result with empty title for variant "${variant}"`,
                        { service: 'mangaDexScraper' }
                    );
                    continue;
                }

                // Calculate similarity score to ensure it's actually a match
                const titleLower = title.toLowerCase();
                const variantLower = variant.toLowerCase();
                const similarity = this.calculateTitleSimilarity(titleLower, variantLower);
                
                // Only accept if similarity is reasonable (at least 50% match)
                if (similarity < 50) {
                    logger.debug(
                        `[MangaDex] Result "${title}" has low similarity (${similarity}%) to variant "${variant}", trying next`,
                        { service: 'mangaDexScraper' }
                    );
                    continue;
                }

                const mangaUrl = `${SITE_BASE}/title/${mangaId}`;

                logger.info(
                    `[MangaDex] Found manga with variant "${variant}": "${title}" (ID: ${mangaId}, similarity: ${similarity}%)`,
                    { service: 'mangaDexScraper' }
                );

                return {
                    href: mangaUrl,
                    title,
                    score: Math.max(Math.round(similarity), 50),
                };
            }

            // No matches found after trying all variants
            logger.warn(
                `[MangaDex] Could not find manga link for "${mangaName}". Variants: ${searchVariants.join(', ')}`,
                { service: 'mangaDexScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[MangaDex] Search failed: ${error}`,
                { service: 'mangaDexScraper' }
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
                    `[MangaDex] ${error}`,
                    { service: 'mangaDexScraper' }
                );
                throw new Error(error);
            }

            // Extract manga ID from URL
            const mangaIdMatch = bestMatch.href.match(/\/title\/([a-f0-9-]+)/);
            if (!mangaIdMatch) {
                throw new Error(`Could not extract manga ID from URL: ${bestMatch.href}`);
            }

            const mangaId = mangaIdMatch[1];

            logger.info(
                `[MangaDex] Fetching chapters for manga ID: ${mangaId}`,
                { service: 'mangaDexScraper' }
            );

            // Fetch all chapters with pagination
            const chapters = await this.fetchAllChapters(mangaId);

            logger.info(
                `[MangaDex] Found ${chapters.length} total chapters`,
                { service: 'mangaDexScraper' }
            );

            let yieldedCount = 0;
            let processedCount = 0;

            // Process and yield chapters
            for (const chapter of chapters) {
                processedCount++;
                // Use the chapter number directly from the API, don't try to parse it from the title
                const chapterNumber = chapter.number;
                const isSpecial = chapterNumber.includes('.') || isNaN(parseFloat(chapterNumber));

                logger.debug(
                    `[MangaDex] Processing chapter ${processedCount}/176: Title="${chapter.title}" -> Number="${chapterNumber}"`,
                    { service: 'mangaDexScraper' }
                );

                // Skip if chapter already exists
                if (await checkExists(chapterNumber)) {
                    logger.debug(
                        `[MangaDex] Skipping chapter ${chapterNumber} - already exists`,
                        { service: 'mangaDexScraper' }
                    );
                    continue;
                }

                yieldedCount++;
                logger.debug(
                    `[MangaDex] Yielding chapter ${yieldedCount}: ${chapterNumber} - ${chapter.title}`,
                    { service: 'mangaDexScraper' }
                );

                yield {
                    url: chapter.url,
                    title: chapter.title,
                    number: chapterNumber,
                    isSpecial: isSpecial,
                    specialType: isSpecial ? 'extra' : undefined,
                };
            }

            logger.info(
                `[MangaDex] Finished yielding ${yieldedCount} new chapters`,
                { service: 'mangaDexScraper' }
            );
        } catch (error) {
            logger.error(
                `[MangaDex] Chapter scraping failed for "${mangaName}": ${error}`,
                { service: 'mangaDexScraper' }
            );
            throw error;
        }
    }

    async downloadChapter(
        url: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        try {
            logger.info(
                `[MangaDex] Downloading chapter: ${folderName}`,
                { service: 'mangaDexScraper' }
            );

            // Extract chapter ID from URL
            const chapterIdMatch = url.match(/\/chapter\/([a-f0-9-]+)/);
            if (!chapterIdMatch) {
                throw new Error(`Could not extract chapter ID from URL: ${url}`);
            }

            const chapterId = chapterIdMatch[1];

            logger.info(
                `[MangaDex] Fetching chapter data from API: ${chapterId}`,
                { service: 'mangaDexScraper' }
            );

            // Use MangaDex API to get chapter pages
            const response = await MangaDexScraper.rateLimitedRequest(
                `${API_BASE}/at-home/server/${chapterId}`
            );

            logger.debug(
                `[MangaDex] API response keys: ${Object.keys(response.data).join(', ')}`,
                { service: 'mangaDexScraper' }
            );

            const chapterData = response.data.chapter;
            if (!chapterData || !chapterData.data) {
                logger.error(
                    `[MangaDex] Invalid chapter data structure. Response: ${JSON.stringify(response.data).substring(0, 500)}`,
                    { service: 'mangaDexScraper' }
                );
                throw new Error(`No chapter data found for chapter ID: ${chapterId}`);
            }

            // Build full image URLs from the API response
            const baseUrl = response.data.baseUrl;
            const chapterHash = chapterData.hash;
            const imageFilenames: string[] = chapterData.data; // Array of image filenames

            logger.info(
                `[MangaDex] Chapter hash: ${chapterHash}`,
                { service: 'mangaDexScraper' }
            );
            
            logger.info(
                `[MangaDex] First 3 filenames: ${imageFilenames.slice(0, 3).join(', ')}`,
                { service: 'mangaDexScraper' }
            );

            const images = imageFilenames.map(
                (filename: string) => `${baseUrl}/data/${chapterHash}/${filename}`
            );

            logger.info(
                `[MangaDex] Built ${images.length} image URLs.`,
                { service: 'mangaDexScraper' }
            );
            
            logger.info(
                `[MangaDex] First image URL: ${images[0]}`,
                { service: 'mangaDexScraper' }
            );

            logger.info(
                `[MangaDex] Found ${images.length} images for ${folderName}`,
                { service: 'mangaDexScraper' }
            );

            if (images.length === 0) {
                throw new Error(`No images found for chapter ${chapterId}`);
            }

            // Download images
            const localPath = await this.downloadImages(
                images,
                mangaName,
                folderName,
                url
            );

            return {
                path: localPath,
                pageCount: images.length,
            };
        } catch (error) {
            logger.error(
                `[MangaDex] Error downloading chapter: ${error}`,
                { service: 'mangaDexScraper' }
            );
            throw error;
        }
    }

    /**
     * Fetch all chapters for a manga with pagination
     */
    private async fetchAllChapters(mangaId: string): Promise<Array<{ title: string; url: string; number: string }>> {
        const chapters: Array<{ title: string; url: string; number: string }> = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await MangaDexScraper.rateLimitedRequest(
                    `${CHAPTER_ENDPOINT}`,
                    {
                        params: {
                            manga: mangaId,
                            translatedLanguage: [ENGLISH_LANG_CODE],
                            limit,
                            offset,
                            order: {
                                chapter: 'asc',
                            },
                            includes: ['manga', 'scanlation_group', 'user'],
                        },
                    }
                );

                const chapterData = response.data.data || [];

                if (chapterData.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const chapter of chapterData) {
                    const chapterNum = chapter.attributes.chapter || '0';
                    const title = chapter.attributes.title || `Chapter ${chapterNum}`;
                    const chapterId = chapter.id;

                    if (offset < 10) {  // Only log first 10 for brevity
                        logger.info(
                            `[MangaDex] API chapter: num="${chapterNum}", title="${title}"`,
                            { service: 'mangaDexScraper' }
                        );
                    }

                    // Build chapter URL
                    const chapterUrl = `${SITE_BASE}/chapter/${chapterId}`;

                    chapters.push({
                        title,
                        url: chapterUrl,
                        number: chapterNum,  // Store the chapter number from the API
                    });
                }

                offset += limit;

                // Check if we got fewer results than requested (last page)
                if (chapterData.length < limit) {
                    hasMore = false;
                }
            } catch (error) {
                logger.error(
                    `[MangaDex] Error fetching chapters (offset: ${offset}): ${error}`,
                    { service: 'mangaDexScraper' }
                );
                throw error;
            }
        }

        logger.info(
            `[MangaDex] Fetched ${chapters.length} chapters total from API`,
            { service: 'mangaDexScraper' }
        );
        
        // Show a sample of what we got
        if (chapters.length > 0) {
            logger.info(
                `[MangaDex] First chapter: "${chapters[0].title}", Last chapter: "${chapters[chapters.length - 1].title}"`,
                { service: 'mangaDexScraper' }
            );
        }

        // Reverse to get newest chapters first
        return chapters.reverse();
    }

    /**
     * Download images to local filesystem
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

        logger.info(
            `[MangaDex] Starting download of ${images.length} images to ${dir}`,
            { service: 'mangaDexScraper' }
        );

        for (let i = 0; i < images.length; i++) {
            const filePath = path.join(
                dir,
                `image${(i + 1).toString().padStart(3, '0')}.jpg`
            );

            try {
                logger.debug(
                    `[MangaDex] Downloading image ${i + 1}/${images.length} from: ${images[i]}`,
                    { service: 'mangaDexScraper' }
                );

                const response = await MangaDexScraper.rateLimitedRequest(images[i], {
                    responseType: 'arraybuffer',
                    headers: {
                        Referer: referer,
                        'User-Agent': appConfig.scraper.mangaDex.userAgent,
                        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                });

                const buffer = Buffer.from(response.data);
                
                if (buffer.length === 0) {
                    logger.warn(
                        `[MangaDex] Image ${i + 1} returned empty buffer from: ${images[i]}`,
                        { service: 'mangaDexScraper' }
                    );
                }

                fs.writeFileSync(filePath, buffer);

                const fileSizeKb = (buffer.length / 1024).toFixed(2);
                logger.debug(
                    `[MangaDex] Successfully wrote image ${i + 1} (${fileSizeKb}KB) to ${filePath}`,
                    { service: 'mangaDexScraper' }
                );
            } catch (err: any) {
                logger.error(
                    `[MangaDex] Failed to download image ${i + 1} from ${images[i]}: ${err.message}`,
                    { service: 'mangaDexScraper' }
                );
                throw err;
            }
        }

        logger.info(
            `[MangaDex] Successfully downloaded and saved ${images.length} images for ${folderName}`,
            { service: 'mangaDexScraper' }
        );

        return dir;
    }
}
