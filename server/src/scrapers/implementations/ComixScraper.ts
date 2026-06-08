import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import http from 'http';
import https from 'https';
import {IChapterScraper, ScrapedChapter, DownloadedChapter, MangaSearchResult, SearchOptions, ScraperMetadata} from '../interfaces/IChapterScraper';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;
const SITE_BASE = appConfig.scraper.comix.baseUrl;
const SEARCH_API = appConfig.scraper.comix.searchApiUrl;

function calculateTitleSimilarity(title1: string, title2: string): number {
    if (title1.toLowerCase() === title2.toLowerCase()) {
        return 100;
    }

    const normalize = (s: string) =>
        s
            .replace(/[^\w\s]/g, '')
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 0);

    const words1 = normalize(title1);
    const words2 = normalize(title2);

    if (words1.length === 0 || words2.length === 0) {
        return 0;
    }

    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
}

function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value
        .replace(/[-_.]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

interface ComixSearchItem {
    title: string;
    url: string;
}

interface ComixSearchResponse {
    status?: string;
    result?: {
        items?: ComixSearchItem[];
    };
}

interface GroupStats {
    href: string;
    name: string;
    chapterCount: number;
}

interface ComixPageAsset {
    page: number;
    imageUrl?: string;
    dataUrl?: string;
    width?: number;
    height?: number;
    source?: 'url' | 'canvas' | 'canvas-screenshot';
}

export class ComixScraper implements IChapterScraper {
    /** Full-size canvas elements in the reader (portrait-oriented pages). */
    private static readonly MIN_CAPTURE_WIDTH = 700;
    private static readonly MIN_CAPTURE_HEIGHT = 900;
    /** Accepts landscape pages (e.g. 1024×768) — long/short edge, not both ≥ portrait mins. */
    private static readonly MIN_CHAPTER_LONG_EDGE = 650;
    private static readonly MIN_CHAPTER_SHORT_EDGE = 400;
    /** DOM readiness threshold (lower than capture min — reader thumbs load before full decode). */
    private static readonly MIN_IMAGE_NATURAL_WIDTH = 320;
    private static readonly MIN_IMAGE_NATURAL_HEIGHT = 400;
    /** Placeholder/spinner assets from Comix CDN are ~1–2 KB; real chapter pages are much larger. */
    private static readonly MIN_IMAGE_DOWNLOAD_BYTES = 10_000;
    private static readonly SCREENSHOT_TIMEOUT_MS = 15_000;

    private static isValidChapterImageDimensions(width: number, height: number): boolean {
        if (width <= 0 || height <= 0) return false;
        const longEdge = Math.max(width, height);
        const shortEdge = Math.min(width, height);
        return longEdge >= ComixScraper.MIN_CHAPTER_LONG_EDGE && shortEdge >= ComixScraper.MIN_CHAPTER_SHORT_EDGE;
    }

    /** Comix serves 3 direct CDN pages, then 1 scrambled page that must be browser-captured. */
    private static isScrambledCdnPage(pageNum: number): boolean {
        return pageNum > 0 && (pageNum - 1) % 4 === 3;
    }

    private static describeDownloadBuffer(buffer: Buffer): string {
        if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
            return `webp (${buffer.length} bytes)`;
        }
        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
            return `jpeg (${buffer.length} bytes)`;
        }
        if (buffer.length >= 8 && buffer.slice(0, 8).toString('ascii') === '\x89PNG\r\n\x1a\n') {
            return `png (${buffer.length} bytes)`;
        }
        const preview = buffer.slice(0, 120).toString('utf8').replace(/[^\x20-\x7E]/g, '.');
        if (/^\s*<(!DOCTYPE|html|body|head|svg)/i.test(preview)) {
            return `likely HTML error page (${buffer.length} bytes): ${preview.slice(0, 80)}`;
        }
        return `unknown payload (${buffer.length} bytes): ${preview.slice(0, 60)}`;
    }

    private static summarizeAssetUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const pathTail = parsed.pathname.split('/').slice(-2).join('/');
            return `${parsed.hostname}/.../${pathTail}`;
        } catch {
            return url.slice(0, 80);
        }
    }

    private logAssetCollectionSummary(assets: ComixPageAsset[], chapterNumber: string, contextLabel: string): void {
        const withDataUrl = assets.filter(a => !!a.dataUrl).length;
        const withImageUrl = assets.filter(a => !!a.imageUrl).length;
        const urlOnly = assets.filter(a => a.imageUrl && !a.dataUrl).length;
        const samples = assets.slice(0, 3).map(a => ({
            page: a.page,
            source: a.dataUrl ? (a.source || 'canvas') : a.imageUrl ? 'url' : 'none',
            url: a.imageUrl ? ComixScraper.summarizeAssetUrl(a.imageUrl) : undefined,
            dataUrlBytes: a.dataUrl ? Math.max(0, a.dataUrl.length - (a.dataUrl.indexOf(',') + 1)) : undefined,
            width: a.width,
            height: a.height,
        }));
        logger.info(
            `[Comix] [${contextLabel}] Asset summary for chapter ${chapterNumber}: total=${assets.length}, dataUrl=${withDataUrl}, imageUrl=${withImageUrl}, urlOnly=${urlOnly}`,
            { service: 'comixScraper', samples },
        );
    }

    private static readonly readerDefaultState = {
        readingDirection: 'ttb',
        pageLayout: 'single',
        preload: 'all',
        progressBar: 'left',
        doubleOffset: false,
        stripMargin: 0,
        greyscale: false,
        dim: false,
        dimAmount: 30,
        maxImgWidth: 0,
        stretch: false,
    };

    private readonly metadata: ScraperMetadata = {
        id: 'comix',
        name: 'Comix',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.comix.priority,
        enabled: appConfig.scraper.comix.enabled,
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
        timeout: appConfig.scraper.comix.timeout,
        httpAgent: ComixScraper.httpAgent,
        httpsAgent: ComixScraper.httpsAgent,
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': appConfig.scraper.comix.userAgent,
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    private static async getBrowser() {
        logger.debug('[Comix] Launching new browser', { service: 'comixScraper' });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            await browser.close().catch(() => {});
        } catch (error) {
            logger.warn(`[Comix] Error releasing browser: ${error}`, { service: 'comixScraper' });
            await browser.close().catch(() => {});
        }
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return true;
    }

    async findBestMatch(mangaName: string, options?: SearchOptions): Promise<MangaSearchResult | undefined> {
        const baseVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ].filter((v): v is string => !!v && v.trim().length > 0);

        const normalizedExtras = baseVariants
            .map(v => normalizeForSearch(v))
            .filter(v => v && !baseVariants.includes(v));

        const variants = [...baseVariants, ...normalizedExtras];
        let bestOverall: MangaSearchResult | undefined;

        logger.info(
            `[Comix] Trying ${variants.length} search variant(s) for "${mangaName}"`,
            { service: 'comixScraper' },
        );

        for (const variant of variants) {
            try {
                const response = await ComixScraper.axiosInstance.get<ComixSearchResponse>(SEARCH_API, {
                    params: {
                        keyword: variant,
                        limit: 6,
                    },
                });

                const items = response.data?.result?.items || [];
                if (!items.length) {
                    continue;
                }

                const scored = items
                    .map(item => {
                        const href = item.url?.startsWith('http')
                            ? item.url
                            : new URL(item.url || '', SITE_BASE).href;
                        return {
                            href,
                            title: item.title || '',
                            score: calculateTitleSimilarity(item.title || '', variant),
                        };
                    })
                    .filter(r => r.href && r.title && r.score >= 50)
                    .sort((a, b) => b.score - a.score);

                if (!scored.length) {
                    continue;
                }

                const best = scored[0];
                logger.info(
                    `[Comix] Best for variant "${variant}": "${best.title}" (${best.score})`,
                    { service: 'comixScraper' },
                );

                if (!bestOverall || best.score > bestOverall.score) {
                    bestOverall = best;
                }
            } catch (error: any) {
                logger.debug(
                    `[Comix] Search failed for variant "${variant}": ${error?.message || error}`,
                    { service: 'comixScraper' },
                );
            }
        }

        return bestOverall;
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        try {
            const response = await ComixScraper.axiosInstance.get<ComixSearchResponse>(SEARCH_API, {
                params: {
                    keyword: q,
                    limit: Math.min(Math.max(limit, 1), 20),
                },
            });

            const items = response.data?.result?.items || [];
            return items
                .map(item => ({
                    href: item.url?.startsWith('http') ? item.url : new URL(item.url || '', SITE_BASE).href,
                    title: item.title || '',
                    score: calculateTitleSimilarity(item.title || '', q),
                }))
                .filter(r => r.href && r.title && r.score >= 50)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        } catch (error) {
            logger.error(`[Comix] search() failed: ${error}`, { service: 'comixScraper' });
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
        const browser = await ComixScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.comix.userAgent,
            // Higher render resolution helps when we must capture rendered pages.
            viewport: { width: 1800, height: 2600 },
            deviceScaleFactor: 1,
        });
        await this.applyReaderDefaults(context);
        const page = await context.newPage();

        try {
            let pageUrl: string;
            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
            } else {
                const match = await this.findBestMatch(mangaName, {
                    seriesId,
                    romanizedTitle,
                    nativeTitle,
                    secondaryTitles,
                    coverUrl,
                });

                if (!match) {
                    throw new Error(`[Comix] Could not find manga link for "${mangaName}"`);
                }
                pageUrl = match.href;
            }

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 20000 });

            const groupStats = await this.extractGroupStats(page);
            const expectedMaxChapter = await this.extractHighestChapterNumberFromCurrentPage(page);
            logger.info(
                `[Comix] Baseline expected max chapter from all-groups first page: ${expectedMaxChapter}`,
                { service: 'comixScraper' },
            );

            let deduped: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> = [];

            if (!groupStats.length) {
                logger.warn('[Comix] No group stats found on first page; collecting all groups without filtering', {
                    service: 'comixScraper',
                });
                const chapters = await this.collectPaginatedChapters(page);
                deduped = this.dedupeAndSortChapters(chapters);
            } else {
                const orderedGroups = [...groupStats].sort((a, b) => b.chapterCount - a.chapterCount);
                let bestFallback: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> = [];

                for (const group of orderedGroups) {
                    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await page.waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 20000 });
                    await this.selectGroupFilter(page, group.name);

                    const chapters = await this.collectPaginatedChapters(page);
                    const currentDeduped = this.dedupeAndSortChapters(chapters);

                    logger.info(
                        `[Comix] Group "${group.name}" yielded ${currentDeduped.length} unique chapters`,
                        { service: 'comixScraper' },
                    );

                    if (currentDeduped.length > bestFallback.length) {
                        bestFallback = currentDeduped;
                    }

                    if (expectedMaxChapter <= 0 || this.hasCompleteChapterRange(currentDeduped, expectedMaxChapter)) {
                        deduped = currentDeduped;
                        logger.info(
                            `[Comix] Group "${group.name}" covers chapters 1..${expectedMaxChapter}, selecting it`,
                            { service: 'comixScraper' },
                        );
                        break;
                    }
                }

                if (!deduped.length) {
                    deduped = bestFallback;
                    logger.warn(
                        `[Comix] No single group fully covered 1..${expectedMaxChapter}; using largest fallback set (${deduped.length})`,
                        { service: 'comixScraper' },
                    );
                }
            }

            logger.info(`[Comix] Final selected set has ${deduped.length} unique chapter(s)`, { service: 'comixScraper' });

            for (const chap of deduped) {
                if (await checkExists(chap.number)) {
                    continue;
                }

                yield {
                    url: chap.url,
                    title: chap.title,
                    number: chap.number,
                    isSpecial: chap.isSpecial,
                    specialType: chap.specialType,
                };
            }
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ComixScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        _mangaName: string,
        _folderName: string,
    ): Promise<DownloadedChapter> {
        const maxAttempts = 2;
        let lastError: any;
        const contextLabel = `series=${seriesId} ch=${chapterNumber}`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const attemptLabel = `${contextLabel} attempt=${attempt}/${maxAttempts}`;
            logger.info(`[Comix] [${attemptLabel}] Starting download attempt for ${url}`, {
                service: 'comixScraper',
            });
            const browser = await ComixScraper.getBrowser();
            const context = await browser.newContext({
                userAgent: appConfig.scraper.comix.userAgent,
                viewport: { width: 1800, height: 2600 },
                deviceScaleFactor: 1,
            });
            await this.applyReaderDefaults(context);
            const page = await context.newPage();

            try {
                logger.info(`[Comix] [${attemptLabel}] Navigating to chapter page`, { service: 'comixScraper' });
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                logger.info(`[Comix] [${attemptLabel}] Waiting for reader shell`, { service: 'comixScraper' });
                await page.waitForSelector(
                    'main.rpage-main, div.rpage-main, button.rpage-progress__seg, div.rpage-chap-ending__nav',
                    { timeout: 30000 },
                );
                await this.dismissReaderHint(page);
                logger.info(`[Comix] [${attemptLabel}] Reader shell ready`, { service: 'comixScraper' });

                const expectedPageCount = await page.evaluate(() => {
                    const buttons = Array.from(
                        document.querySelectorAll<HTMLButtonElement>(
                            'div.rpage-progress.rpage-progress--left button.rpage-progress__seg',
                        ),
                    );
                    return buttons.length;
                });
                logger.info(
                    `[Comix] Chapter ${chapterNumber}: expected pages from progress bar = ${expectedPageCount}`,
                    { service: 'comixScraper' },
                );

                logger.info(
                    `[Comix] [${attemptLabel}] Collecting page assets (expected=${expectedPageCount})`,
                    { service: 'comixScraper' },
                );
                const pageAssets = await this.collectPageAssetsFromReader(page, expectedPageCount, contextLabel, url);
                const uniqueImages: string[] = [...new Set<string>(pageAssets.map(a => a.imageUrl).filter((v): v is string => !!v))];
                logger.info(
                    `[Comix] Chapter ${chapterNumber}: collected ${pageAssets.length} page assets (${uniqueImages.length} URL-backed) on first pass`,
                    { service: 'comixScraper' },
                );
                if (!pageAssets.length) {
                    throw new Error(`[Comix] No images found for chapter ${url}`);
                }

                let finalAssets = pageAssets;

                if (expectedPageCount > 0 && finalAssets.length < expectedPageCount) {
                    logger.warn(
                        `[Comix] Loaded ${finalAssets.length}/${expectedPageCount} page assets after first pass, retrying capture`,
                        { service: 'comixScraper' },
                    );
                    const retryAssets = await this.collectPageAssetsFromReader(
                        page,
                        expectedPageCount,
                        `${contextLabel} retry`,
                        url,
                    );
                    const retryUnique: string[] = [...new Set<string>(retryAssets.map(a => a.imageUrl).filter((v): v is string => !!v))];
                    logger.info(
                        `[Comix] Chapter ${chapterNumber}: retry collected ${retryAssets.length} page assets (${retryUnique.length} URL-backed)`,
                        { service: 'comixScraper' },
                    );
                    if (retryAssets.length > finalAssets.length) {
                        finalAssets = retryAssets;
                    }
                }

                if (expectedPageCount > 0 && finalAssets.length < expectedPageCount) {
                    const missingPages = this.getMissingPages(finalAssets, expectedPageCount);
                    logger.warn(
                        `[Comix] Proceeding with partial page set for ${url}. expected=${expectedPageCount}, captured=${finalAssets.length}, missingPages=${missingPages.join(',') || 'none'}`,
                        { service: 'comixScraper' },
                    );
                }

                this.logAssetCollectionSummary(finalAssets, chapterNumber, attemptLabel);
                logger.info(
                    `[Comix] [${attemptLabel}] Downloading ${finalAssets.length} assets to storage`,
                    { service: 'comixScraper' },
                );
                const storagePrefix = await this.downloadPageAssets(finalAssets, seriesId, chapterNumber, url, attemptLabel);
                logger.info(
                    `[Comix] [${attemptLabel}] Chapter download completed (prefix=${storagePrefix}, pages=${finalAssets.length})`,
                    { service: 'comixScraper' },
                );
                return {
                    storagePrefix,
                    pageCount: finalAssets.length,
                };
            } catch (error: any) {
                lastError = error;
                const message = `${error?.message || error}`;
                const isCrash = /target crashed|target page, context or browser has been closed|browser has been closed/i.test(message);
                logger.error(
                    `[Comix] [${attemptLabel}] Download attempt failed: ${message}`,
                    { service: 'comixScraper' },
                );
                if (attempt < maxAttempts && isCrash) {
                    logger.warn(
                        `[Comix] [${attemptLabel}] Browser target crash classified=true; retrying with fresh browser`,
                        { service: 'comixScraper' },
                    );
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                logger.error(
                    `[Comix] [${attemptLabel}] Non-retryable failure or attempts exhausted (isCrash=${isCrash})`,
                    { service: 'comixScraper' },
                );
                throw error;
            } finally {
                await page.close().catch(() => {});
                await context.close().catch(() => {});
                await ComixScraper.releaseBrowser(browser);
                logger.debug(`[Comix] [${attemptLabel}] Browser/context released`, { service: 'comixScraper' });
            }
        }

        throw lastError || new Error(`[Comix] Failed to download chapter ${chapterNumber}`);
    }

    private mergePageAssets(base: ComixPageAsset[], incoming: ComixPageAsset[]): ComixPageAsset[] {
        const merged = new Map<number, ComixPageAsset>(base.map(a => [a.page, a]));
        for (const asset of incoming) {
            const existing = merged.get(asset.page);
            if (!existing) {
                merged.set(asset.page, asset);
                continue;
            }
            if (!existing.dataUrl && asset.dataUrl) {
                merged.set(asset.page, { ...existing, dataUrl: asset.dataUrl, width: asset.width, height: asset.height, source: asset.source });
                continue;
            }
            if (!existing.imageUrl && asset.imageUrl) {
                merged.set(asset.page, { ...existing, imageUrl: asset.imageUrl, source: asset.source || existing.source });
            }
        }
        return Array.from(merged.values()).sort((a, b) => a.page - b.page);
    }

    private hasCompleteAsset(asset: ComixPageAsset): boolean {
        return !!(asset.imageUrl || asset.dataUrl);
    }

    private async extractWowpicCdnBase(page: any): Promise<string | null> {
        return page.evaluate(() => {
            const imgSrc =
                document.querySelector<HTMLImageElement>('img.rpage-page__img, .rpage-page img')?.currentSrc ||
                document.querySelector<HTMLImageElement>('img.rpage-page__img, .rpage-page img')?.src ||
                '';
            const fromImg = imgSrc.match(/^(https:\/\/[a-z0-9]+\.wowpic\d*\.store\/i3\/[^/]+\/)/i);
            if (fromImg) {
                return fromImg[1];
            }

            const html = document.documentElement.innerHTML;
            const fromHtml = html.match(/https:\/\/[a-z0-9]+\.wowpic\d*\.store\/i3\/[A-Za-z0-9]+\//i);
            return fromHtml ? fromHtml[0] : null;
        });
    }

    private buildCdnPageAssets(cdnBase: string, pageCount: number): ComixPageAsset[] {
        const normalizedBase = cdnBase.endsWith('/') ? cdnBase : `${cdnBase}/`;
        return Array.from({ length: pageCount }, (_, index) => ({
            page: index + 1,
            imageUrl: `${normalizedBase}${String(index + 1).padStart(3, '0')}.webp`,
            source: 'url' as const,
        }));
    }

    private async probeCdnAssets(
        assets: ComixPageAsset[],
        referer: string,
        contextLabel: string,
    ): Promise<{ directAssets: ComixPageAsset[]; browserCapturePages: number[] }> {
        const browserCapturePages: number[] = [];
        const batchSize = 25;

        for (let start = 0; start < assets.length; start += batchSize) {
            const chunk = assets.slice(start, Math.min(start + batchSize, assets.length));
            await Promise.all(
                chunk.map(async (asset) => {
                    if (ComixScraper.isScrambledCdnPage(asset.page)) {
                        browserCapturePages.push(asset.page);
                        return;
                    }
                    if (!asset.imageUrl) {
                        browserCapturePages.push(asset.page);
                        return;
                    }
                    try {
                        const response = await ComixScraper.axiosInstance.get(asset.imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 20000,
                            headers: {
                                Referer: referer,
                                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                                'User-Agent': appConfig.scraper.comix.userAgent,
                            },
                        });
                        const buffer = Buffer.from(response.data as ArrayBuffer);
                        const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
                        const width = metadata.width || 0;
                        const height = metadata.height || 0;
                        const dimsOk = ComixScraper.isValidChapterImageDimensions(width, height);
                        const bytesOk = buffer.length >= ComixScraper.MIN_IMAGE_DOWNLOAD_BYTES;
                        if (!dimsOk || !bytesOk) {
                            browserCapturePages.push(asset.page);
                        }
                    } catch {
                        browserCapturePages.push(asset.page);
                    }
                }),
            );

            const checked = Math.min(start + batchSize, assets.length);
            if (checked < assets.length || start === 0) {
                logger.info(
                    `[Comix] [${contextLabel}] CDN probe progress: ${checked}/${assets.length}`,
                    { service: 'comixScraper' },
                );
            }
        }

        const browserCaptureSet = new Set(browserCapturePages);
        return {
            directAssets: assets.filter(a => !browserCaptureSet.has(a.page)),
            browserCapturePages: browserCapturePages.sort((a, b) => a - b),
        };
    }

    private async collectBrowserCapturedAssets(
        page: any,
        contextLabel: string,
        targetPages: number[],
    ): Promise<ComixPageAsset[]> {
        if (!targetPages.length) return [];

        await this.dismissReaderHint(page);
        const captured: ComixPageAsset[] = [];
        const visitTotal = targetPages.length;

        for (let visitIndex = 0; visitIndex < targetPages.length; visitIndex++) {
            const pageNum = targetPages[visitIndex];
            const node = page.locator(`.rpage-page[data-page="${pageNum}"]`).first();
            if (!(await node.count())) continue;

            let asset: ComixPageAsset | null = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                await node.scrollIntoViewIfNeeded().catch(() => {});
                await page.waitForTimeout(300);
                await this.dismissReaderHint(page);
                asset = await this.capturePageViaScreenshot(page, pageNum, contextLabel);
                if (asset) break;
            }
            if (asset) {
                captured.push(asset);
            }

            const shouldLog =
                visitIndex === 0 ||
                visitIndex === visitTotal - 1 ||
                (visitIndex + 1) % 10 === 0;
            if (shouldLog) {
                logger.info(
                    `[Comix] [${contextLabel}] Browser capture ${visitIndex + 1}/${visitTotal}: page=${pageNum} captured=${captured.length}`,
                    { service: 'comixScraper' },
                );
            }
        }

        logger.info(
            `[Comix] [${contextLabel}] Browser capture complete: targets=${targetPages.length}, captured=${captured.length}`,
            { service: 'comixScraper' },
        );
        return captured;
    }

    private async collectPageAssetsFromReader(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
        chapterUrl: string,
    ): Promise<ComixPageAsset[]> {
        await this.dismissReaderHint(page);

        if (expectedPageCount > 0) {
            const cdnBase = await this.extractWowpicCdnBase(page);
            if (cdnBase) {
                logger.info(
                    `[Comix] [${contextLabel}] Resolved wowpic CDN base (${ComixScraper.summarizeAssetUrl(`${cdnBase}001.webp`)}) for ${expectedPageCount} page(s)`,
                    { service: 'comixScraper' },
                );
                const cdnAssets = this.buildCdnPageAssets(cdnBase, expectedPageCount);
                const scrambledCount = cdnAssets.filter(a => ComixScraper.isScrambledCdnPage(a.page)).length;
                const { directAssets, browserCapturePages } = await this.probeCdnAssets(cdnAssets, chapterUrl, contextLabel);
                logger.info(
                    `[Comix] [${contextLabel}] CDN probe complete: ${directAssets.length} direct URL(s), ${browserCapturePages.length} need browser capture (${scrambledCount} scrambled)`,
                    { service: 'comixScraper' },
                );
                if (!browserCapturePages.length) {
                    return directAssets;
                }
                const browserAssets = await this.collectBrowserCapturedAssets(page, contextLabel, browserCapturePages);
                return this.mergePageAssets(directAssets, browserAssets);
            }

            logger.warn(
                `[Comix] [${contextLabel}] No wowpic CDN base found; falling back to scroll/progress extraction`,
                { service: 'comixScraper' },
            );
        }

        let assets = await this.collectPageAssetsByScrolling(page, expectedPageCount, contextLabel);
        logger.info(
            `[Comix] [${contextLabel}] Scroll extraction captured ${assets.length} page slot(s), ${assets.filter(a => this.hasCompleteAsset(a)).length} with image data`,
            { service: 'comixScraper' },
        );

        let missingPages = this.getMissingPages(assets, expectedPageCount);
        if (missingPages.length > 0) {
            const canvasAssets = await this.collectCanvasAssetsByPage(page, expectedPageCount, assets, contextLabel, missingPages);
            if (canvasAssets.length) {
                assets = this.mergePageAssets(assets, canvasAssets);
            }
            missingPages = this.getMissingPages(assets, expectedPageCount);
        }

        if (expectedPageCount <= 0 || missingPages.length === 0) {
            return assets;
        }

        logger.info(
            `[Comix] [${contextLabel}] Filling ${missingPages.length} missing page(s) via progress: ${missingPages.join(', ')}`,
            { service: 'comixScraper' },
        );
        const progressAssets = await this.collectPageAssetsFromProgressButtons(page, expectedPageCount, contextLabel, missingPages);
        return this.mergePageAssets(assets, progressAssets);
    }

    private async collectPageAssetsByScrolling(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
    ): Promise<ComixPageAsset[]> {
        const pageMap = new Map<number, ComixPageAsset>();
        const maxSteps = Math.max(expectedPageCount > 0 ? expectedPageCount * 8 : 420, 160);
        const minCaptureWidth = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minCaptureHeight = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        const minCanvasWidth = ComixScraper.MIN_CHAPTER_LONG_EDGE;
        const minCanvasHeight = ComixScraper.MIN_CHAPTER_SHORT_EDGE;
        let stagnantSteps = 0;
        let reachedEnd = false;

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);

        for (let step = 1; step <= maxSteps; step++) {
            const beforeSize = pageMap.size;
            const snapshot = await page.evaluate(
                ({ minW, minH, canvasMinW, canvasMinH }: { minW: number; minH: number; canvasMinW: number; canvasMinH: number }) => {
                const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rpage-page[data-page], div.rpage-page'));
                const out: Array<{
                    page: number;
                    imageUrl?: string;
                    visible: boolean;
                    hasCanvas: boolean;
                    canvasWidth?: number;
                    canvasHeight?: number;
                }> = [];

                for (const node of nodes) {
                    const rect = node.getBoundingClientRect();
                    const visible = rect.bottom >= 0 && rect.top <= window.innerHeight;
                    const img = node.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                    const src = img?.currentSrc || img?.getAttribute('src') || img?.getAttribute('data-src') || '';
                    const srcMatch = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png)(\?|$)/i);
                    const dataPage = Number(node.getAttribute('data-page') || '');
                    const inferredPage = srcMatch ? Number(srcMatch[1]) : NaN;
                    const pageNum = Number.isFinite(dataPage) && dataPage > 0 ? dataPage : inferredPage;
                    if (!Number.isFinite(pageNum) || pageNum < 1) continue;

                    const imgReady =
                        !!img &&
                        img.complete &&
                        img.naturalWidth >= minW &&
                        img.naturalHeight >= minH;

                    const canvas = node.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                    const canvasWidth = canvas?.width || 0;
                    const canvasHeight = canvas?.height || 0;
                    const hasCanvas =
                        !!canvas &&
                        visible &&
                        canvasWidth >= canvasMinW &&
                        canvasHeight >= canvasMinH;

                    if (imgReady && src && src.startsWith('http') && /\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)) {
                        if (!srcMatch || Number(srcMatch[1]) === pageNum) {
                            out.push({ page: pageNum, imageUrl: src, visible, hasCanvas, canvasWidth, canvasHeight });
                            continue;
                        }
                    }

                    if (hasCanvas) {
                        out.push({ page: pageNum, visible, hasCanvas, canvasWidth, canvasHeight });
                    }
                }

                const hasEndMarker = !!document.querySelector('div.rpage-chap-ending__nav');
                return { out, hasEndMarker };
                },
                { minW: minCaptureWidth, minH: minCaptureHeight, canvasMinW: minCanvasWidth, canvasMinH: minCanvasHeight },
            );

            for (const asset of snapshot.out) {
                const existing = pageMap.get(asset.page);
                if (!existing) {
                    pageMap.set(asset.page, {
                        page: asset.page,
                        imageUrl: asset.imageUrl,
                        width: asset.canvasWidth,
                        height: asset.canvasHeight,
                        source: asset.imageUrl ? 'url' : undefined,
                    });
                    continue;
                }
                if (!existing.imageUrl && asset.imageUrl) {
                    pageMap.set(asset.page, { ...existing, imageUrl: asset.imageUrl });
                }
            }

            const canvasCandidates = snapshot.out.filter((a: {
                page: number;
                hasCanvas: boolean;
            }) =>
                a.hasCanvas &&
                !pageMap.get(a.page)?.dataUrl,
            );
            for (const candidate of canvasCandidates) {
                const captured = await this.capturePageViaScreenshot(page, candidate.page, contextLabel);
                if (captured) {
                    const existing = pageMap.get(candidate.page);
                    pageMap.set(candidate.page, {
                        ...(existing || { page: candidate.page }),
                        ...captured,
                    });
                }
            }

            const grew = pageMap.size > beforeSize;
            stagnantSteps = grew ? 0 : stagnantSteps + 1;

            if (snapshot.hasEndMarker && pageMap.size >= Math.min(expectedPageCount || 0, 20)) {
                reachedEnd = true;
            }

            if (expectedPageCount > 0 && pageMap.size >= expectedPageCount) {
                break;
            }
            if (reachedEnd && stagnantSteps >= 12) {
                break;
            }
            if (stagnantSteps >= 60) {
                break;
            }

            await page.evaluate(() => window.scrollBy(0, Math.max(900, Math.floor(window.innerHeight * 0.85))));
            await page.waitForTimeout(320);
        }

        // Final settle at end and full DOM sweep for lazy-loaded img URLs.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(900);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        const finalSweep = await page.evaluate(
            ({ minW, minH }: { minW: number; minH: number }) => {
                const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rpage-page[data-page], div.rpage-page'));
                const out: ComixPageAsset[] = [];

                for (const node of nodes) {
                    const dataPage = Number(node.getAttribute('data-page') || '');
                    const img = node.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                    const src = img?.currentSrc || img?.getAttribute('src') || img?.getAttribute('data-src') || '';
                    const srcMatch = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png)(\?|$)/i);
                    const inferredPage = srcMatch ? Number(srcMatch[1]) : NaN;
                    const pageNum = Number.isFinite(dataPage) && dataPage > 0 ? dataPage : inferredPage;
                    if (!Number.isFinite(pageNum) || pageNum < 1) continue;

                    const imgReady =
                        !!img &&
                        img.complete &&
                        img.naturalWidth >= minW &&
                        img.naturalHeight >= minH;

                    if (imgReady && src && src.startsWith('http') && /\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)) {
                        if (!srcMatch || Number(srcMatch[1]) === pageNum) {
                            out.push({ page: pageNum, imageUrl: src });
                        }
                    }
                }
                return out;
            },
            { minW: minCaptureWidth, minH: minCaptureHeight },
        );

        for (const asset of finalSweep) {
            const existing = pageMap.get(asset.page);
            if (!existing) {
                pageMap.set(asset.page, asset);
                continue;
            }
            if (!existing.imageUrl && asset.imageUrl) {
                pageMap.set(asset.page, { ...existing, imageUrl: asset.imageUrl });
            }
        }

        logger.info(
            `[Comix] [${contextLabel}] Scroll extraction complete: captured=${pageMap.size}, expected=${expectedPageCount}, reachedEnd=${reachedEnd}`,
            { service: 'comixScraper' },
        );
        if (pageMap.size > 1) {
            return Array.from(pageMap.values()).sort((a, b) => a.page - b.page);
        }

        return [];
    }

    private async collectCanvasAssetsByPage(
        page: any,
        expectedPageCount: number,
        currentAssets: ComixPageAsset[],
        contextLabel: string,
        onlyPages?: number[],
    ): Promise<ComixPageAsset[]> {
        const existingPages = new Set(currentAssets.filter(a => this.hasCompleteAsset(a)).map(a => a.page));
        const onlyPageSet = onlyPages?.length ? new Set(onlyPages) : null;
        const canvasPages: number[] = await page.evaluate((expected: number) => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>('.rpage-page[data-page], div.rpage-page'));
            return nodes
                .map((node) => {
                    const pageNum = Number(node.getAttribute('data-page') || '');
                    if (!Number.isFinite(pageNum) || pageNum < 1 || (expected > 0 && pageNum > expected)) return null;
                    const hasCanvas = !!node.querySelector('canvas.rpage-page__img, canvas');
                    return hasCanvas ? pageNum : null;
                })
                .filter((v): v is number => v !== null)
                .sort((a, b) => a - b);
        }, expectedPageCount);

        const targetPages = canvasPages.filter((pageNum) => {
            if (existingPages.has(pageNum)) return false;
            if (onlyPageSet && !onlyPageSet.has(pageNum)) return false;
            return true;
        });
        if (!targetPages.length) return [];

        await this.dismissReaderHint(page);
        const captured: ComixPageAsset[] = [];
        for (const pageNum of targetPages) {
            const selector = `.rpage-page[data-page="${pageNum}"]`;
            const node = page.locator(selector).first();
            if (!(await node.count())) continue;

            for (let attempt = 1; attempt <= 2; attempt++) {
                await node.scrollIntoViewIfNeeded().catch(() => {});
                await page.waitForTimeout(200);
                await this.dismissReaderHint(page);
                const asset = await this.capturePageViaScreenshot(page, pageNum, contextLabel);
                if (asset) {
                    captured.push(asset);
                    existingPages.add(pageNum);
                    break;
                }
            }
        }

        logger.info(
            `[Comix] [${contextLabel}] Canvas page pass: targets=${targetPages.length}, captured=${captured.length} (min=${ComixScraper.MIN_CAPTURE_WIDTH}x${ComixScraper.MIN_CAPTURE_HEIGHT})`,
            { service: 'comixScraper' },
        );
        return captured;
    }

    private async collectPageAssetsFromProgressButtons(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
        onlyPages?: number[],
    ): Promise<ComixPageAsset[]> {
        const pageMap = new Map<number, ComixPageAsset>();

        const progressButtons = page.locator('div.rpage-progress.rpage-progress--left button.rpage-progress__seg');
        const buttonCount = await progressButtons.count();
        const totalPages = expectedPageCount > 0 ? expectedPageCount : buttonCount;
        const pagesToVisit =
            onlyPages?.length
                ? onlyPages.filter((n) => n >= 1 && (totalPages <= 0 || n <= totalPages))
                : Array.from({ length: totalPages }, (_, i) => i + 1);
        logger.info(
            `[Comix] [${contextLabel}] Progress traversal: expected=${expectedPageCount}, buttonsFound=${buttonCount}, visiting=${pagesToVisit.length} page(s)`,
            { service: 'comixScraper' },
        );

        if (buttonCount > 0 && pagesToVisit.length > 0) {
            const visitTotal = pagesToVisit.length;
            for (let visitIndex = 0; visitIndex < pagesToVisit.length; visitIndex++) {
                const pageNum = pagesToVisit[visitIndex];
                const button = progressButtons.nth(Math.min(pageNum - 1, buttonCount - 1));
                if (!(await button.count())) continue;
                const clicked = await button.click({ force: true }).then(() => true).catch(() => false);
                await this.waitForReaderPageIndex(page, pageNum);

                let asset = await this.capturePageViaScreenshot(page, pageNum, contextLabel);
                if (!asset) {
                    asset = await this.captureAssetForActivePage(page, pageNum);
                }
                if (asset) {
                    pageMap.set(pageNum, asset);
                }

                const source = asset?.imageUrl ? 'url' : asset?.dataUrl ? 'canvas' : 'none';
                const shouldLog =
                    visitIndex === 0 ||
                    visitIndex === visitTotal - 1 ||
                    (visitIndex + 1) % 10 === 0;
                if (shouldLog) {
                    logger.info(
                        `[Comix] [${contextLabel}] Progress capture ${visitIndex + 1}/${visitTotal}: page=${pageNum} clicked=${clicked} source=${source} captured=${pageMap.size}`,
                        { service: 'comixScraper' },
                    );
                }
            }
        } else {
            await this.scrollUntilReaderEnd(page);
            logger.info(
                `[Comix] [${contextLabel}] Progress buttons unavailable; scroll fallback only`,
                { service: 'comixScraper' },
            );
        }

        logger.info(`[Comix] [${contextLabel}] Progress traversal complete: total captured assets=${pageMap.size}`, {
            service: 'comixScraper',
        });
        return Array.from(pageMap.values()).sort((a, b) => a.page - b.page);
    }

    private async waitForReaderPageIndex(page: any, pageNum: number): Promise<void> {
        try {
            await page.waitForFunction(
                (n: number) => {
                    const btn = document.querySelector<HTMLButtonElement>(
                        'div.rpage-progress.rpage-progress--left button.rpage-progress__seg.is-active',
                    );
                    const title = btn?.getAttribute('title') || '';
                    const m = title.match(/Page\s+(\d+)/i);
                    if (!m || Number(m[1]) !== n) return false;

                    const slide = document.querySelector('.swiper-slide.rpage-slide.swiper-slide-active');
                    const pageEl = slide?.querySelector('.rpage-page');
                    const dataPage = pageEl?.getAttribute('data-page');
                    if (dataPage != null && Number(dataPage) !== n) return false;

                    return true;
                },
                pageNum,
                { timeout: 12000 },
            );
            await page.waitForTimeout(200);
        } catch {
            await page.waitForTimeout(400);
        }
    }

    private async waitForReaderPageImageLoaded(page: any, pageNum: number, timeoutMs = 8000): Promise<boolean> {
        const minW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        try {
            await page.waitForFunction(
                ({ n, minW, minH }: { n: number; minW: number; minH: number }) => {
                    const findImg = (): HTMLImageElement | null => {
                        const slide = document.querySelector('.swiper-slide.rpage-slide.swiper-slide-active');
                        if (slide) {
                            const pageEl = slide.querySelector('.rpage-page');
                            const dp = pageEl?.getAttribute('data-page');
                            if (dp != null && Number(dp) === n) {
                                return slide.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                            }
                        }
                        const node = document.querySelector(`.rpage-page[data-page="${n}"]`);
                        return node?.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                    };
                    const img = findImg();
                    if (!img) return false;
                    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
                    if (!src || !/^https?:\/\//i.test(src)) return false;
                    if (!/\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)) return false;
                    if (!img.complete) return false;
                    if (img.naturalWidth < minW || img.naturalHeight < minH) return false;
                    return true;
                },
                { n: pageNum, minW, minH },
                { timeout: timeoutMs },
            );
            return true;
        } catch {
            return false;
        }
    }

    private async captureAssetForActivePage(page: any, pageNum: number): Promise<ComixPageAsset | null> {
        await this.waitForReaderPageImageLoaded(page, pageNum, 6000);
        const minW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        return page.evaluate(({ n, minW, minH }: { n: number; minW: number; minH: number }) => {
            const slide = document.querySelector('.swiper-slide.rpage-slide.swiper-slide-active');
            const root = slide || document.querySelector('.rpage-page');
            if (!root) return null;

            const pageEl = (root as HTMLElement).matches?.('.rpage-page')
                ? (root as HTMLElement)
                : (root.querySelector('.rpage-page') as HTMLElement | null);
            const dataPage = pageEl?.getAttribute('data-page');
            if (dataPage != null && Number(dataPage) !== n) return null;

            const img = root.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
            const src = img?.currentSrc || img?.getAttribute('src') || img?.getAttribute('data-src') || '';
            if (
                img &&
                img.complete &&
                img.naturalWidth >= minW &&
                img.naturalHeight >= minH &&
                src &&
                src.startsWith('http') &&
                /\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)
            ) {
                const m = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png)(\?|$)/i);
                if (!m || Number(m[1]) === n) {
                    return { page: n, imageUrl: src };
                }
            }

            return null;
        }, { n: pageNum, minW, minH });
    }

    private async capturePageViaScreenshot(
        page: any,
        pageNum: number,
        contextLabel: string,
    ): Promise<ComixPageAsset | null> {
        const hideStyleId = 'comix-capture-hide-ui-style';
        try {
            const node = page.locator(`.rpage-page[data-page="${pageNum}"]`).first();
            if (!(await node.count())) return null;
            await node.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForFunction(
                ({ n, minCanvasW, minImgW, minImgH }: { n: number; minCanvasW: number; minImgW: number; minImgH: number }) => {
                    const root = document.querySelector(`.rpage-page[data-page="${n}"]`);
                    if (!root) return false;
                    const canvas = root.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                    if (canvas && canvas.width >= minCanvasW) {
                        return true;
                    }
                    const img = root.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                    return !!(
                        img &&
                        img.complete &&
                        img.naturalWidth >= minImgW &&
                        img.naturalHeight >= minImgH
                    );
                },
                {
                    n: pageNum,
                    minCanvasW: ComixScraper.MIN_CHAPTER_SHORT_EDGE,
                    minImgW: ComixScraper.MIN_IMAGE_NATURAL_WIDTH,
                    minImgH: ComixScraper.MIN_IMAGE_NATURAL_HEIGHT,
                },
                { timeout: 8000 },
            ).catch(() => {});
            await page.waitForTimeout(300);
            await page.evaluate((styleId: string) => {
                let style = document.getElementById(styleId) as HTMLStyleElement | null;
                if (!style) {
                    style = document.createElement('style');
                    style.id = styleId;
                    document.head.appendChild(style);
                }
                style.textContent = `
                    div.rpage-header,
                    header.rpage-header,
                    .rpage-topbar,
                    .rpage-reader__header {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        pointer-events: none !important;
                    }
                `;
            }, hideStyleId);
            await page.waitForTimeout(60);

            const canvasLoc = node.locator('canvas.rpage-page__img, canvas').first();
            const imgLoc = node.locator('img.rpage-page__img, img').first();
            let target = node;
            let source: ComixPageAsset['source'] = 'canvas-screenshot';
            if (await canvasLoc.count()) {
                target = canvasLoc;
                source = 'canvas-screenshot';
            } else if (await imgLoc.count()) {
                target = imgLoc;
                source = 'canvas-screenshot';
            }

            const buffer: Buffer = await target.screenshot({
                type: 'png',
                animations: 'disabled',
                timeout: ComixScraper.SCREENSHOT_TIMEOUT_MS,
            });
            if (!buffer || buffer.length <= 1500) return null;
            const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
            const width = metadata.width || 0;
            const height = metadata.height || 0;
            if (!ComixScraper.isValidChapterImageDimensions(width, height)) {
                logger.debug(
                    `[Comix] [${contextLabel}] Rejecting browser screenshot page ${pageNum} due to size ${width}x${height}`,
                    { service: 'comixScraper' },
                );
                return null;
            }
            return {
                page: pageNum,
                dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
                width,
                height,
                source,
            };
        } catch (error) {
            logger.debug(`[Comix] [${contextLabel}] Browser screenshot capture failed for page ${pageNum}: ${error}`, {
                service: 'comixScraper',
            });
            return null;
        } finally {
            await page.evaluate((styleId: string) => {
                const style = document.getElementById(styleId);
                if (style) style.remove();
            }, hideStyleId).catch(() => {});
        }
    }

    private getMissingPages(assets: ComixPageAsset[], expectedPageCount: number): number[] {
        if (expectedPageCount <= 0) return [];
        const have = new Set<number>(assets.filter(a => this.hasCompleteAsset(a)).map(a => a.page));
        const missing: number[] = [];
        for (let i = 1; i <= expectedPageCount; i++) {
            if (!have.has(i)) missing.push(i);
        }
        return missing;
    }

    private async dismissReaderHint(page: any): Promise<void> {
        const hint = page.locator('div.rpage-hint[role="dialog"][aria-label="Reader gestures"]');
        if (!(await hint.count())) return;

        try {
            const visible = await hint.isVisible().catch(() => false);
            if (!visible) return;

            const dontShowAgain = hint.locator('label.rpage-hint__check input[type="checkbox"]');
            if (await dontShowAgain.count()) {
                await dontShowAgain.check({ force: true }).catch(() => {});
            }

            const gotIt = hint.locator('button.ubtn.ubtn--primary', { hasText: 'Got it' });
            if (await gotIt.count()) {
                await gotIt.click({ force: true });
            } else {
                const backdrop = hint.locator('.rpage-hint__backdrop');
                if (await backdrop.count()) {
                    await backdrop.click({ force: true }).catch(() => {});
                }
            }

            await hint.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(150);
            logger.debug('[Comix] Dismissed reader gestures hint', { service: 'comixScraper' });
        } catch {
            // Non-fatal; capture may still succeed.
        }
    }

    private async applyReaderDefaults(context: any): Promise<void> {
        const defaults = ComixScraper.readerDefaultState;
        await context.addInitScript((state: typeof defaults) => {
            try {
                const existingRaw = window.localStorage.getItem('reader.default');
                let existing: any = {};
                if (existingRaw) {
                    try {
                        existing = JSON.parse(existingRaw);
                    } catch {
                        existing = {};
                    }
                }

                const existingState = (existing && typeof existing === 'object' ? existing.state : {}) || {};
                const nextValue = {
                    ...existing,
                    state: {
                        ...state,
                        ...existingState,
                        readingDirection: 'ttb',
                        preload: 'all',
                        maxImgWidth: 0,
                        stretch: false,
                    },
                    version: typeof existing?.version === 'number' ? existing.version : 0,
                };
                window.localStorage.setItem('reader.default', JSON.stringify(nextValue));
            } catch {
                // Ignore localStorage failures.
            }
        }, defaults);
    }

    private async extractGroupStats(page: any): Promise<GroupStats[]> {
        return page.evaluate(() => {
            const rows = Array.from(
                document.querySelectorAll<HTMLElement>('section.mpage__chapters ul.mchap-list li.mchap-item'),
            );
            const map = new Map<string, GroupStats>();

            for (const row of rows) {
                const groupAnchor = row.querySelector<HTMLAnchorElement>('a.mchap-row__group');
                if (!groupAnchor) continue;
                const href = groupAnchor.getAttribute('href') || '';
                if (!href.startsWith('/groups/')) continue;

                const spans = groupAnchor.querySelectorAll('span');
                const name = spans[spans.length - 1]?.textContent?.trim() || '';
                if (!name) continue;

                const key = `${href}::${name}`;
                const existing = map.get(key);
                if (existing) {
                    existing.chapterCount += 1;
                } else {
                    map.set(key, { href, name, chapterCount: 1 });
                }
            }

            return Array.from(map.values());
        });
    }

    private async selectGroupFilter(page: any, groupName: string): Promise<void> {
        const trigger = page.locator('div.fdrop.mpage__group button.ubtn.ubtn--soft').first();
        if (!(await trigger.count())) {
            return;
        }

        await trigger.click();
        const menu = page.locator('div.fdrop__pop.fdrop__pop--menu');
        await menu.waitFor({ state: 'visible', timeout: 5000 });

        const option = page
            .locator('div.fdrop__pop.fdrop__pop--menu button, div.fdrop__pop.fdrop__pop--menu a')
            .filter({ hasText: groupName })
            .first();

        if (await option.count()) {
            await option.click();
            await page.waitForTimeout(700);
            await page.waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 10000 });
        }
    }

    private async collectPaginatedChapters(page: any): Promise<Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }>> {
        const allRows: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> = [];
        const maxPages = 500;

        for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
            const rows = await page.evaluate(() => {
                const chapterRows = Array.from(
                    document.querySelectorAll<HTMLElement>('section.mpage__chapters ul.mchap-list li.mchap-item'),
                );

                return chapterRows
                    .map(row => {
                        const primary = row.querySelector<HTMLAnchorElement>('a.mchap-row__primary');
                        if (!primary) return null;
                        const href = primary.getAttribute('href') || '';
                        if (!href) return null;
                        const chapterLabel =
                            row.querySelector<HTMLElement>('span.mchap-row__ch')?.textContent?.trim() ||
                            primary.textContent?.trim() ||
                            '';
                        return {
                            href,
                            label: chapterLabel,
                        };
                    })
                    .filter((v): v is { href: string; label: string } => !!v);
            });

            for (const row of rows) {
                const parsed = ChapterNumberParser.parse(row.label);
                allRows.push({
                    url: row.href.startsWith('http') ? row.href : new URL(row.href, SITE_BASE).href,
                    title: parsed.title,
                    number: parsed.number,
                    isSpecial: parsed.isSpecial,
                    specialType: parsed.specialType,
                });
            }

            const nextButton = page
                .locator('div.mchap-foot nav.npager button.npager__nav[aria-label="Next page"]')
                .first();

            if (!(await nextButton.count())) {
                break;
            }

            const isDisabled = await nextButton.evaluate((el: HTMLButtonElement) => {
                return (
                    !!el.disabled ||
                    el.getAttribute('aria-disabled') === 'true' ||
                    el.classList.contains('is-disabled')
                );
            });

            if (isDisabled) {
                break;
            }

            const firstRowHrefBefore = await page.evaluate(() => {
                const first = document.querySelector<HTMLAnchorElement>(
                    'section.mpage__chapters ul.mchap-list li.mchap-item a.mchap-row__primary',
                );
                return first?.getAttribute('href') || '';
            });

            let advanced = false;
            try {
                await nextButton.scrollIntoViewIfNeeded();
                await nextButton.click({ force: true, timeout: 5000 });
                advanced = true;
            } catch {
                try {
                    advanced = await page.evaluate(() => {
                        const btn = document.querySelector<HTMLButtonElement>(
                            'div.mchap-foot nav.npager button.npager__nav[aria-label="Next page"]',
                        );
                        if (!btn) return false;
                        btn.click();
                        return true;
                    });
                } catch {
                    advanced = false;
                }
            }

            if (!advanced) {
                logger.warn('[Comix] Failed to advance chapter list pagination; stopping at current page', {
                    service: 'comixScraper',
                });
                break;
            }

            await page.waitForFunction(
                (prevHref: string) => {
                    const first = document.querySelector<HTMLAnchorElement>(
                        'section.mpage__chapters ul.mchap-list li.mchap-item a.mchap-row__primary',
                    );
                    const currentHref = first?.getAttribute('href') || '';
                    return !!currentHref && currentHref !== prevHref;
                },
                firstRowHrefBefore,
                { timeout: 10000 },
            ).catch(() => {});
            await page.waitForTimeout(500);
            await page.waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 10000 });
        }

        return allRows;
    }

    private dedupeAndSortChapters(
        chapters: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }>,
    ): Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> {
        const byNumber = new Map<string, { url: string; title: string; number: string; isSpecial: boolean; specialType?: string }>();
        for (const chapter of chapters) {
            if (!byNumber.has(chapter.number)) {
                byNumber.set(chapter.number, chapter);
            }
        }

        return Array.from(byNumber.values()).sort((a, b) => ChapterNumberParser.compareNumbers(a.number, b.number));
    }

    private async extractHighestChapterNumberFromCurrentPage(page: any): Promise<number> {
        const labels: string[] = await page.evaluate(() => {
            const rows = Array.from(
                document.querySelectorAll<HTMLElement>('section.mpage__chapters ul.mchap-list li.mchap-item'),
            );
            return rows
                .map(row => row.querySelector<HTMLElement>('span.mchap-row__ch')?.textContent?.trim() || '')
                .filter(Boolean);
        });

        let max = 0;
        for (const label of labels) {
            const parsed = ChapterNumberParser.parse(label);
            const value = Number(parsed.number);
            if (Number.isFinite(value) && value > max) {
                max = value;
            }
        }

        return Math.floor(max);
    }

    private hasCompleteChapterRange(
        chapters: Array<{ number: string }>,
        expectedMaxChapter: number,
    ): boolean {
        if (expectedMaxChapter < 1) return true;

        const present = new Set<number>();
        for (const chapter of chapters) {
            const value = Number(chapter.number);
            if (Number.isFinite(value) && value >= 1) {
                present.add(Math.floor(value));
            }
        }

        for (let n = 1; n <= expectedMaxChapter; n++) {
            if (!present.has(n)) {
                return false;
            }
        }
        return true;
    }

    private async scrollUntilReaderEnd(page: any): Promise<void> {
        const maxSteps = 300;
        let step = 0;
        let reachedEnd = false;

        while (step < maxSteps) {
            step += 1;
            await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 900)));
            await page.waitForTimeout(100);

            reachedEnd = await page.evaluate(() => {
                return !!document.querySelector('div.rpage-chap-ending__nav');
            });
            if (reachedEnd) {
                break;
            }
        }

        if (!reachedEnd) {
            logger.warn('[Comix] Reader end marker not found while scrolling', { service: 'comixScraper' });
        }
    }

    private async downloadPageAssets(
        assets: ComixPageAsset[],
        seriesId: number,
        chapterNumber: string,
        referer: string,
        contextLabel = 'download',
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        const dir = path.join(STORAGE_ROOT, storagePrefix);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const batchSize = 10;
        const maxRetries = 3;
        const retryDelayMs = 1000;

        const downloadOne = async (asset: ComixPageAsset) => {
            const filePath = path.join(dir, `${asset.page.toString().padStart(2, '0')}.webp`);
            const assetSource = asset.dataUrl ? (asset.source || 'canvas') : asset.imageUrl ? 'url' : 'none';
            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (asset.dataUrl?.startsWith('data:image')) {
                        const base64Part = asset.dataUrl.split(',')[1] || '';
                        const raw = Buffer.from(base64Part, 'base64');
                        logger.debug(
                            `[Comix] [${contextLabel}] Page ${asset.page}: saving canvas capture (${raw.length} bytes raw, source=${assetSource})`,
                            { service: 'comixScraper' },
                        );
                        // Preserve rendered pages at highest possible fidelity.
                        const out = await sharp(raw, { failOn: 'none' })
                            .webp({
                                lossless: true,
                                effort: 4,
                            })
                            .toBuffer();
                        fs.writeFileSync(filePath, out);
                    } else if (asset.imageUrl) {
                        const urlSummary = ComixScraper.summarizeAssetUrl(asset.imageUrl);
                        logger.debug(
                            `[Comix] [${contextLabel}] Page ${asset.page}: fetching URL (attempt ${attempt}/${maxRetries}, source=${assetSource}, url=${urlSummary})`,
                            { service: 'comixScraper' },
                        );
                        const response = await ComixScraper.axiosInstance.get(asset.imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 30000,
                            headers: {
                                Referer: referer,
                                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                                'User-Agent': appConfig.scraper.comix.userAgent,
                            },
                        });
                        const buffer = Buffer.from(response.data as ArrayBuffer);
                        const contentType = String(response.headers['content-type'] || 'unknown');
                        if (buffer.length < ComixScraper.MIN_IMAGE_DOWNLOAD_BYTES) {
                            logger.warn(
                                `[Comix] [${contextLabel}] Page ${asset.page}: URL payload too small (${buffer.length}/${ComixScraper.MIN_IMAGE_DOWNLOAD_BYTES} bytes, status=${response.status}, contentType=${contentType}, url=${urlSummary}, payload=${ComixScraper.describeDownloadBuffer(buffer)})`,
                                { service: 'comixScraper' },
                            );
                            throw new Error(
                                `Downloaded image too small for page ${asset.page}: ${buffer.length}/${ComixScraper.MIN_IMAGE_DOWNLOAD_BYTES} bytes (url=${urlSummary}, contentType=${contentType})`,
                            );
                        }
                        const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
                        const width = metadata.width || 0;
                        const height = metadata.height || 0;
                        if (!ComixScraper.isValidChapterImageDimensions(width, height)) {
                            logger.warn(
                                `[Comix] [${contextLabel}] Page ${asset.page}: URL image dimensions too small (${width}x${height}, bytes=${buffer.length}, url=${urlSummary})`,
                                { service: 'comixScraper' },
                            );
                            throw new Error(
                                `Downloaded image dimensions too small for page ${asset.page}: ${width}x${height} (need long edge ≥${ComixScraper.MIN_CHAPTER_LONG_EDGE}, short edge ≥${ComixScraper.MIN_CHAPTER_SHORT_EDGE})`,
                            );
                        }
                        logger.debug(
                            `[Comix] [${contextLabel}] Page ${asset.page}: saved URL image (${buffer.length} bytes, ${width}x${height}, contentType=${contentType})`,
                            { service: 'comixScraper' },
                        );
                        // Comix CDN image URLs are already webp; avoid expensive no-op transcode.
                        fs.writeFileSync(filePath, buffer);
                    } else {
                        throw new Error(`No imageUrl or dataUrl captured for page ${asset.page}`);
                    }
                    return;
                } catch (err: any) {
                    lastError = err;
                    logger.warn(
                        `[Comix] [${contextLabel}] Page ${asset.page}: download attempt ${attempt}/${maxRetries} failed (source=${assetSource}): ${err?.message || err}`,
                        { service: 'comixScraper' },
                    );
                    if (attempt < maxRetries) {
                        const delay = retryDelayMs * Math.pow(2, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            throw new Error(`[Comix] Failed to download page ${asset.page}: ${lastError?.message || lastError}`);
        };

        for (let start = 0; start < assets.length; start += batchSize) {
            const chunk = assets.slice(start, Math.min(start + batchSize, assets.length));
            await Promise.all(chunk.map((asset) => downloadOne(asset)));
        }

        return storagePrefix;
    }
}
