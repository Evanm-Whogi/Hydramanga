/**
 * AtsuMoe Scraper Implementation
 *
 * Scraper for atsu.moe manga source.
 * Uses Typesense search API, allChapters API for chapter lists, and read/chapter API for page URLs.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
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
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;
const API_BASE = appConfig.scraper.atsuMoe.apiUrl;
const SITE_BASE = appConfig.scraper.atsuMoe.baseUrl;

/**
 * AtsuMoe search API response types
 * The API is Typesense-like and returns hits with embedded documents.
 */
interface AtsuMoeDocument {
    id: string;
    title: string;
    englishTitle?: string;
    otherNames?: string[];
    authors?: string[];
    isAdult?: boolean;
    status?: string;
    year?: number;
    poster?: string;
    posterMedium?: string;
    posterSmall?: string;
    type?: string;
}

interface AtsuMoeHit {
    document: AtsuMoeDocument;
}

interface AtsuMoeSearchResponse {
    hits: AtsuMoeHit[];
}

/** allChapters API response (https://atsu.moe/api/manga/allChapters?mangaId=...) */
interface AtsuMoeChapterItem {
    id: string;
    scanlationMangaId: string;
    title: string;
    number: number;
    createdAt: number;
    index: number;
    pageCount: number;
    progress: unknown;
}

interface AtsuMoeAllChaptersResponse {
    chapters: AtsuMoeChapterItem[];
}

/** read/chapter API response (https://atsu.moe/api/read/chapter?mangaId=...&chapterId=...) */
interface AtsuMoeReadChapterPage {
    id: string;
    image: string;
    number: number;
}

interface AtsuMoeReadChapterResponse {
    readChapter: {
        id: string;
        title: string;
        scanlationMangaId: string;
        pages: AtsuMoeReadChapterPage[];
    };
}

/** Manga page URL with ?filter=all so the full chapter list is shown (and stored for rescans). */
function mangaListUrl(pathOrUrl: string): string {
    const u = new URL(pathOrUrl, SITE_BASE);
    u.searchParams.set('filter', 'all');
    return u.href;
}

function parseChapterUrl(url: string): { mangaId: string; chapterId: string } {
    const u = new URL(url, SITE_BASE);
    const segments = u.pathname.split('/').filter(Boolean);
    const readIdx = segments.indexOf('read');
    if (readIdx < 0 || segments.length < readIdx + 3) {
        throw new Error(`Invalid AtsuMoe chapter URL: ${url}`);
    }
    return {
        mangaId: segments[readIdx + 1],
        chapterId: segments[readIdx + 2],
    };
}

function absoluteImageUrl(imagePath: string): string {
    return new URL(imagePath, SITE_BASE).href;
}

/**
 * Calculate title similarity (0-100)
 * Reused approach from MangaTaro scraper for consistent scoring.
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
 * Normalize a title/search string so minor punctuation/connector differences
 * (e.g. ":" vs "-" or multiple spaces) don't affect matching.
 * Mirrors MangaTaroScraper behavior for consistency.
 */
function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value
        .replace(/[-_.]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * AtsuMoe Scraper
 * Uses JSON search API, allChapters API, and read/chapter API for downloads.
 */
export class AtsuMoeScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'atsumoe',
        name: 'AtsuMoe',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.atsuMoe.priority,
        enabled: appConfig.scraper.atsuMoe.enabled,
    };

    private static readonly httpAgent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 30000,
    });

    private static readonly httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 30000,
    });

    private static readonly axiosInstance = axios.create({
        timeout: appConfig.scraper.atsuMoe.timeout,
        httpAgent: AtsuMoeScraper.httpAgent,
        httpsAgent: AtsuMoeScraper.httpsAgent,
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': appConfig.scraper.atsuMoe.userAgent,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        // AtsuMoe can handle all manga by default
        return true;
    }

    /**
     * Core search helper calling AtsuMoe Typesense-like API.
     */
    private async searchApi(query: string, limit: number): Promise<AtsuMoeSearchResponse | null> {
        const q = (query || '').trim();
        if (!q) return null;

        try {
            const params = new URLSearchParams({
                filter_by: '',
                q,
                limit: String(limit),
                query_by: 'title,englishTitle,otherNames,authors',
                query_by_weights: '4,3,2,1',
                include_fields:
                    'id,title,englishTitle,poster,posterSmall,posterMedium,type,isAdult,status,year,otherNames,authors',
            });

            const response = await AtsuMoeScraper.axiosInstance.get<AtsuMoeSearchResponse>(
                `${API_BASE}?${params.toString()}`
            );

            if (!response.data || !Array.isArray(response.data.hits)) {
                return null;
            }

            return response.data;
        } catch (error: any) {
            logger.debug(
                `[AtsuMoe] searchApi failed for "${query}": ${error?.message || error}`,
                { service: 'atsuMoeScraper' }
            );
            return null;
        }
    }

    async findBestMatch(
        mangaName: string,
        options?: SearchOptions
    ): Promise<MangaSearchResult | undefined> {
        try {
            const baseVariants = [
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                ...(options?.secondaryTitles || []),
            ].filter((v): v is string => !!v && v.length > 0);

            const normalizedExtras = baseVariants
                .map(v => normalizeForSearch(v))
                .filter(v => v && !baseVariants.includes(v));

            const variants = [...baseVariants, ...normalizedExtras];

            logger.info(
                `[AtsuMoe] Trying ${variants.length} search variants`,
                { service: 'atsuMoeScraper' }
            );

            for (const variant of variants) {
                logger.info(
                    `[AtsuMoe] Searching for "${variant}"`,
                    { service: 'atsuMoeScraper' }
                );

                const data = await this.searchApi(variant, 12);
                if (!data || data.hits.length === 0) {
                    logger.debug(
                        `[AtsuMoe] No results for variant "${variant}"`,
                        { service: 'atsuMoeScraper' }
                    );
                    continue;
                }

                const scored = data.hits
                    .map(hit => {
                        const doc = hit.document;
                        const title =
                            doc.englishTitle ||
                            doc.title ||
                            (doc.otherNames && doc.otherNames[0]) ||
                            '';
                        const score = title ? calculateTitleSimilarity(title, variant) : 0;
                        return {
                            href: mangaListUrl(`${SITE_BASE}/manga/${doc.id}`),
                            title,
                            score,
                        };
                    })
                    .filter(r => r.title && r.score >= 70)
                    .sort((a, b) => b.score - a.score);

                if (scored.length > 0) {
                    const best = scored[0];
                    logger.info(
                        `[AtsuMoe] Found match: "${best.title}" (score: ${best.score})`,
                        { service: 'atsuMoeScraper' }
                    );
                    return best;
                }
            }

            logger.warn(
                `[AtsuMoe] Could not find manga for "${mangaName}"`,
                { service: 'atsuMoeScraper' }
            );
            return undefined;
        } catch (error) {
            logger.error(
                `[AtsuMoe] Search error: ${error}`,
                { service: 'atsuMoeScraper' }
            );
            throw error;
        }
    }

    async search(query: string, options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        try {
            const data = await this.searchApi(q, Math.max(limit, 20));
            if (!data || data.hits.length === 0) return [];

            const results = data.hits
                .map(hit => {
                    const doc = hit.document;
                    const title =
                        doc.englishTitle ||
                        doc.title ||
                        (doc.otherNames && doc.otherNames[0]) ||
                        '';
                    const score = title ? calculateTitleSimilarity(title, q) : 0;
                    return {
                        href: mangaListUrl(`${SITE_BASE}/manga/${doc.id}`),
                        title,
                        score,
                    };
                })
                .filter(r => r.title && r.score >= 50)
                .sort((a, b) => b.score - a.score);

            return results.slice(0, limit);
        } catch (error) {
            logger.error(
                `[AtsuMoe] search() failed: ${error}`,
                { service: 'atsuMoeScraper' }
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
        mangaPageUrl?: string,
    ): AsyncGenerator<ScrapedChapter, void, undefined> {
        let pageUrl: string;

        if (mangaPageUrl) {
            pageUrl = mangaPageUrl;
            logger.info(
                `[AtsuMoe] Using saved URL for "${mangaName}"`,
                { service: 'atsuMoeScraper' }
            );
        } else {
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
                    `[AtsuMoe] ${error}`,
                    { service: 'atsuMoeScraper' }
                );
                throw new Error(error);
            }

            pageUrl = bestMatch.href;
            logger.info(
                `[AtsuMoe] Found series page: ${bestMatch.href} (${bestMatch.title})`,
                { service: 'atsuMoeScraper' }
            );
        }

        const mangaId = (() => {
            const pathname = new URL(pageUrl, SITE_BASE).pathname;
            const segments = pathname.split('/').filter(Boolean);
            const mangaIdx = segments.indexOf('manga');
            if (mangaIdx >= 0 && mangaIdx < segments.length - 1) {
                return segments[mangaIdx + 1];
            }
            return segments[segments.length - 1] || '';
        })();

        if (!mangaId) {
            throw new Error(`Could not extract mangaId from URL: ${pageUrl}`);
        }

        const apiUrl = `${SITE_BASE}/api/manga/allChapters?mangaId=${encodeURIComponent(mangaId)}`;
        const response = await AtsuMoeScraper.axiosInstance.get<AtsuMoeAllChaptersResponse>(apiUrl);
        const data = response.data;

        if (!data?.chapters || !Array.isArray(data.chapters)) {
            throw new Error(`Invalid allChapters response for mangaId=${mangaId}`);
        }

        const chapterRows = [...data.chapters].reverse();

        logger.info(
            `[AtsuMoe] Found ${chapterRows.length} chapters (API)`,
            { service: 'atsuMoeScraper' }
        );

        for (const ch of chapterRows) {
            const title = ch.title || `Chapter ${ch.number}`;
            const parsed = ChapterNumberParser.parse(title);

            if (await checkExists(parsed.number)) {
                logger.debug(
                    `[AtsuMoe] Skipping chapter ${parsed.number} - already exists`,
                    { service: 'atsuMoeScraper' }
                );
                continue;
            }

            const chapterUrl = new URL(`${SITE_BASE}/read/${mangaId}/${ch.id}`);
            chapterUrl.searchParams.set('pageCount', String(ch.pageCount));

            yield {
                url: chapterUrl.href,
                title: parsed.title,
                number: parsed.number,
                isSpecial: parsed.isSpecial,
                specialType: parsed.specialType,
            };
        }
    }

    private async fetchReadChapter(
        mangaId: string,
        chapterId: string
    ): Promise<AtsuMoeReadChapterResponse['readChapter']> {
        const apiUrl = `${SITE_BASE}/api/read/chapter?mangaId=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chapterId)}`;
        const response = await AtsuMoeScraper.axiosInstance.get<AtsuMoeReadChapterResponse>(apiUrl);
        const readChapter = response.data?.readChapter;
        if (!readChapter?.pages?.length) {
            throw new Error(`Invalid read/chapter response for mangaId=${mangaId}, chapterId=${chapterId}`);
        }
        return readChapter;
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        mangaName: string,
        folderName: string
    ): Promise<DownloadedChapter> {
        const { mangaId, chapterId } = parseChapterUrl(url);
        const readChapter = await this.fetchReadChapter(mangaId, chapterId);
        const imageUrls = [...readChapter.pages]
            .sort((a, b) => a.number - b.number)
            .map((page) => absoluteImageUrl(page.image));

        logger.info(
            `[AtsuMoe] Downloading ${imageUrls.length} pages for chapter ${chapterNumber} (read/chapter API)`,
            { service: 'atsuMoeScraper' }
        );

        const referer = `${SITE_BASE}/read/${mangaId}/${chapterId}`;
        const storagePrefix = await this.downloadImages(
            imageUrls,
            seriesId,
            chapterNumber,
            referer
        );

        return {
            storagePrefix,
            pageCount: imageUrls.length,
        };
    }

    /**
     * Download images to local filesystem with retry logic (batched parallel).
     * Mirrors MangaTaro/WeebCentral behavior for performance and robustness.
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

        const maxRetries = 3;
        const retryDelayMs = 1000;
        const batchSize = 10;

        const downloadImage = async (imageUrl: string, i: number) => {
            const filePath = path.join(
                dir,
                `${(i + 1).toString().padStart(2, '0')}.webp`
            );

            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await AtsuMoeScraper.axiosInstance.get(imageUrl, {
                        responseType: 'stream',
                        timeout: 15000,
                        maxRedirects: 5,
                        headers: {
                            Referer: referer,
                            'User-Agent': appConfig.scraper.atsuMoe.userAgent,
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

                    const transformer = sharp({ failOn: 'none' })
                        .resize({
                            width: 2500,
                            height: 16383,
                            fit: 'inside',
                            withoutEnlargement: true,
                            fastShrinkOnLoad: true,
                        })
                        .webp({
                            quality: 75,
                            effort: 2,
                            smartSubsample: true,
                        });

                    await pipeline(
                        response.data,
                        transformer,
                        createWriteStream(filePath)
                    );

                    logger.debug(
                        `[AtsuMoe] Downloaded image ${i + 1}/${images.length}`,
                        { service: 'atsuMoeScraper' }
                    );

                    return;
                } catch (err: any) {
                    lastError = err;
                    const errorMsg = err.message || String(err);

                    const isRetryable =
                        errorMsg.includes('stream has been aborted') ||
                        errorMsg.includes('ERR_HTTP2_STREAM_CANCEL') ||
                        errorMsg.includes('ECONNRESET') ||
                        errorMsg.includes('ECONNABORTED') ||
                        errorMsg.includes('ETIMEDOUT') ||
                        err.code === 'ERR_HTTP2_STREAM_CANCEL' ||
                        err.code === 'ECONNRESET' ||
                        err.code === 'ECONNABORTED' ||
                        err.code === 'ETIMEDOUT';

                    if (isRetryable && attempt < maxRetries) {
                        const delayMs = retryDelayMs * Math.pow(2, attempt - 1);
                        logger.warn(
                            `[AtsuMoe] Image ${i + 1} download failed (attempt ${attempt}/${maxRetries}): ${errorMsg}. Retrying in ${delayMs}ms...`,
                            { service: 'atsuMoeScraper' }
                        );
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue;
                    } else {
                        logger.error(
                            `[AtsuMoe] Failed to download image ${i + 1} after ${attempt} attempt(s): ${errorMsg}`,
                            { service: 'atsuMoeScraper' }
                        );
                        throw lastError;
                    }
                }
            }
        };

        const delayBetweenBatchesMs = 25;
        for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, images.length);
            const batch = images.slice(batchStart, batchEnd);

            await Promise.all(
                batch.map((imageUrl, localIndex) =>
                    downloadImage(imageUrl, batchStart + localIndex)
                )
            );
            if (batchEnd < images.length && delayBetweenBatchesMs > 0) {
                await new Promise(r => setTimeout(r, delayBetweenBatchesMs));
            }
        }

        return storagePrefix;
    }
}

