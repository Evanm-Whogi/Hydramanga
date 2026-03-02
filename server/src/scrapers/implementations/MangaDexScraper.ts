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
import sharp from 'sharp';
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
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

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
    private static readonly REQUEST_DELAY_MS = 2500;
    private static lastRequestTime = 0;

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.mangaDex.timeout,
        headers: {
            'User-Agent': appConfig.scraper.mangaDex.userAgent,
            Accept: 'application/json',
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
        // Generate search variants (raw + normalized forms)
        const baseVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ]
            .filter((v): v is string => !!v && v.trim().length > 0);

        const normalizedExtras = baseVariants
            .map((v) => MangaDexScraper.normalizeForSearch(v))
            .filter((v) => v && !baseVariants.includes(v));

        const searchVariants = [...baseVariants, ...normalizedExtras];

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
                            contentRating: ['safe', 'suggestive', 'erotica', 'pornographic'],
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

    async search(query: string, options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        try {
            const response = await MangaDexScraper.rateLimitedRequest(
                `${MANGA_ENDPOINT}`,
                {
                    params: {
                        title: q,
                        limit: Math.min(limit, 20),
                        offset: 0,
                        includes: ['author', 'artist', 'cover_art'],
                        contentRating: ['safe', 'suggestive', 'erotica', 'pornographic'],
                    },
                }
            );

            const mangas = response.data.data || [];
            const results: MangaSearchResult[] = [];

            for (const manga of mangas) {
                const mangaId = manga.id;
                let title =
                    manga.attributes?.title?.[ENGLISH_LANG_CODE] ||
                    manga.attributes?.title?.['ja'] ||
                    manga.attributes?.title?.['ko'] ||
                    (manga.attributes?.title && Object.values(manga.attributes.title)[0]) ||
                    '';
                if (typeof title !== 'string') title = '';
                title = (title as string).trim();
                if (!title) continue;

                const similarity = this.calculateTitleSimilarity(title.toLowerCase(), q.toLowerCase());
                if (similarity < 50) continue;

                results.push({
                    href: `${SITE_BASE}/title/${mangaId}`,
                    title,
                    score: Math.max(Math.round(similarity), 50),
                });
            }

            results.sort((a, b) => b.score - a.score);
            return results.slice(0, limit);
        } catch (error) {
            logger.error(`[MangaDex] search() failed: ${error}`, { service: 'mangaDexScraper' });
            return [];
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
        try {
            let mangaId: string;

            if (mangaPageUrl) {
                const match = mangaPageUrl.match(/\/title\/([a-f0-9-]+)/);
                if (!match) {
                    throw new Error(`Could not extract manga ID from URL: ${mangaPageUrl}`);
                }
                mangaId = match[1];
                logger.info(
                    `[MangaDex] Using saved URL for manga ID: ${mangaId}`,
                    { service: 'mangaDexScraper' }
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
                mangaId = mangaIdMatch[1];
            }

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
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        try {
            logger.info(
                `[MangaDex] Downloading chapter: ${folderName} for series ${seriesId}`,
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
            const storagePrefix = await this.downloadImages(
                images,
                seriesId,
                chapterNumber,
                url
            );

            return {
                storagePrefix,
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
                            contentRating: ['safe', 'suggestive', 'erotica', 'pornographic'],
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
        seriesId: number,
        chapterNumber: string,
        referer: string
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        const dir = path.join(STORAGE_ROOT, storagePrefix);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        logger.info(
            `[MangaDex] Starting download of ${images.length} images to ${dir}`,
            { service: 'mangaDexScraper' }
        );

        const batchSize = 4;
        // Delay between batches to avoid rate limits on at-home/CDN (images are not api.mangadex.org but nodes can still throttle)
        const BATCH_DELAY_MS = 1200;
        const imageHeaders = {
            Referer: referer,
            'User-Agent': appConfig.scraper.mangaDex.userAgent,
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        };

        const downloadOne = async (imageUrl: string, i: number) => {
            const filePath = path.join(dir, `${(i + 1).toString().padStart(2, '0')}.webp`);
            const response = await axios.get(imageUrl, {
                responseType: 'stream',
                timeout: appConfig.scraper.mangaDex.timeout,
                headers: imageHeaders,
            });

                const transformer = sharp({ failOn: 'none' })
                    .resize({ 
                        width: 2500,               // Cap width at a reasonable manga standard
                        height: 16383,             // Allow for long-strip vertical webtoons
                        fit: 'inside', 
                        withoutEnlargement: true,
                        fastShrinkOnLoad: true     // BIG WIN: Shrinks while reading, saves massive CPU
                    })
                    .webp({ 
                        quality: 75,               // Slightly lower quality (80 to 75) saves ~20% size
                        effort: 2,                 // BIG WIN: 2 is much faster than the default 4 or 6
                        smartSubsample: true       // Keeps text sharp in manga
                    });

                    await pipeline(
                        response.data,
                        transformer,
                        createWriteStream(filePath)
                    );
        };

        for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, images.length);
            const batch = images.slice(batchStart, batchEnd);
            await Promise.all(
                batch.map((imageUrl, j) =>
                    downloadOne(imageUrl, batchStart + j).catch((err: any) => {
                        logger.error(`[MangaDex] Failed to download image ${batchStart + j + 1} from ${imageUrl}: ${err.message}`, { service: 'mangaDexScraper' });
                        throw err;
                    })
                )
            );
            if (batchEnd < images.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        logger.info(
            `[MangaDex] Successfully downloaded and saved ${images.length} images`,
            { service: 'mangaDexScraper' }
        );

        return storagePrefix;
    }
}
