/**
 * MangaFire Scraper Implementation
 *
 * Scraper for mangafire.to manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 *
 * Site characteristics (2026 SPA + JSON API):
 * - Title pages:   https://mangafire.to/title/<hid>-<slug>
 * - Reader pages:  https://mangafire.to/title/<hid>-<slug>/<chapterId>-chapter-<n>-<lang>
 * - Search:        GET /api/titles?keyword=<q>&limit=<n>  -> { items: [{ title, url, hid, … }] }
 * - Chapter list:  GET /api/titles/<hid>/chapters?language=<lang>&limit=<n>&page=<p>
 * - Chapter pages: GET /api/chapters/<chapterId>  -> { data: { pages: [{ url, width, height }] } }
 * Legacy /manga/, /read/, and VRF-gated /ajax/ endpoints are no longer used; Playwright
 * reader capture is kept as fallback when the chapter API fails.
 *
 * Image fetching strategy mirrors the WeebCentral/Comix scrapers: plain <img>
 * pages are downloaded directly with a Referer header; scrambled/canvas pages are
 * captured via element screenshot.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { objectStorageService } from '@/services/objectStorageService';
import { buildAxios, getPlaywrightProxy } from '@/scrapers/lib/scraperEgress';
import {
    IChapterScraper,
    ScrapedChapter,
    DownloadedChapter,
    MangaSearchResult,
    MangaSearchResponse,
    SearchOptions,
    ScraperMetadata,
} from '../interfaces/IChapterScraper';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { ScraperStageError, describeError, isTrue404Error } from '@/scrapers/lib/scraperError';
import { store404PlaceholderIfMissing } from '@/scrapers/lib/chapterImageDownloader';

const SITE_BASE = appConfig.scraper.mangaFire.baseUrl;
const DEFAULT_LANG = appConfig.scraper.mangaFire.language || 'en';

function calculateTitleSimilarity(title1: string, title2: string): number {
    if (!title1 || !title2) return 0;
    if (title1.toLowerCase() === title2.toLowerCase()) return 100;

    const normalize = (s: string) =>
        s
            .replace(/[^\w\s]/g, '')
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 0);

    const words1 = normalize(title1);
    const words2 = normalize(title2);
    if (words1.length === 0 || words2.length === 0) return 0;

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

interface MangaFireTitleSearchItem {
    title?: string;
    url?: string;
    hid?: string;
}

interface MangaFireChapterListItem {
    id: number;
    number: number | string;
    name?: string;
    language?: string;
}

interface MangaFirePageAsset {
    page: number;
    imageUrl?: string;
    dataUrl?: string;
    width?: number;
    height?: number;
    source?: 'url' | 'canvas-screenshot';
}

export class MangaFireScraper implements IChapterScraper {
    // MangaFire serves full manga pages, long-strip webtoon slices (e.g. 73x1100)
    // and genuinely tiny legacy scans (e.g. 311x500, 138x200) that are impossible
    // to distinguish from thumbnails by size alone. We therefore keep only a low
    // floor on both edges to drop degenerate slivers / tracking pixels; the real
    // junk filters are the byte gate (empty/error responses) and a successful
    // sharp decode, both of which run before this check.
    private static readonly MIN_CHAPTER_LONG_EDGE = 128;
    private static readonly MIN_CHAPTER_SHORT_EDGE = 8;
    // Only meant to short-circuit truly empty/error responses; real strips can be
    // very small once compressed, so dimension validation is the real gate.
    private static readonly MIN_IMAGE_DOWNLOAD_BYTES = 64;
    private static readonly SCREENSHOT_TIMEOUT_MS = 15_000;

    private readonly metadata: ScraperMetadata = {
        id: 'mangafire',
        name: 'MangaFire',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.mangaFire.priority,
        enabled: appConfig.scraper.mangaFire.enabled,
    };

    // Egress (agents + proxy + ban detection) is centralized in scraperEgress; with
    // the proxy flag off this is identical to the previous keep-alive axios instance.
    private static readonly axiosInstance = buildAxios({
        scraperId: 'mangafire',
        timeout: appConfig.scraper.mangaFire.timeout,
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': appConfig.scraper.mangaFire.userAgent,
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return this.metadata.enabled;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static isValidChapterImageDimensions(width: number, height: number): boolean {
        if (width <= 0 || height <= 0) return false;
        const longEdge = Math.max(width, height);
        const shortEdge = Math.min(width, height);
        return longEdge >= MangaFireScraper.MIN_CHAPTER_LONG_EDGE && shortEdge >= MangaFireScraper.MIN_CHAPTER_SHORT_EDGE;
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

    /** Extract the hid (short id) from /title/, /manga/, or /read/ URLs. */
    private static extractShortId(mangaUrlOrPath: string): string | undefined {
        let segments: string[];
        try {
            const u = mangaUrlOrPath.startsWith('http')
                ? new URL(mangaUrlOrPath)
                : new URL(mangaUrlOrPath, SITE_BASE);
            segments = u.pathname.split('/').filter(Boolean);
        } catch {
            segments = mangaUrlOrPath.split(/[?#]/)[0].split('/').filter(Boolean);
        }
        const titleIdx = segments.indexOf('title');
        if (titleIdx >= 0 && segments[titleIdx + 1]) {
            const slug = segments[titleIdx + 1];
            const dash = slug.indexOf('-');
            return dash > 0 ? slug.slice(0, dash) : slug;
        }
        const idx = segments.findIndex(s => s === 'manga' || s === 'read');
        const slugSeg = idx >= 0 && segments[idx + 1] ? segments[idx + 1] : undefined;
        const candidate = slugSeg || segments.find(s => s.includes('.')) || segments[segments.length - 1] || '';
        const dot = candidate.lastIndexOf('.');
        const id = dot >= 0 ? candidate.slice(dot + 1) : candidate;
        return id || undefined;
    }

    /** Canonical title page path, e.g. `/title/rj9xp-antique-bakeryy`. */
    private static extractTitlePath(mangaUrlOrPath: string): string | undefined {
        try {
            const u = mangaUrlOrPath.startsWith('http') ? new URL(mangaUrlOrPath) : new URL(mangaUrlOrPath, SITE_BASE);
            const parts = u.pathname.split('/').filter(Boolean);
            const titleIdx = parts.indexOf('title');
            if (titleIdx >= 0 && parts[titleIdx + 1]) return `/title/${parts[titleIdx + 1]}`;
            const mangaIdx = parts.indexOf('manga');
            if (mangaIdx >= 0 && parts[mangaIdx + 1]) return `/manga/${parts[mangaIdx + 1]}`;
        } catch {
            /* ignore */
        }
        return undefined;
    }

    private static buildReaderUrl(titlePath: string, chapter: MangaFireChapterListItem): string {
        const suffixParts = [`chapter-${chapter.number}`];
        if (chapter.language) suffixParts.push(chapter.language);
        const chapterSeg = `${chapter.id}-${suffixParts.join('-')}`;
        return new URL(`${titlePath.replace(/\/$/, '')}/${chapterSeg}`, SITE_BASE).href;
    }

    private static extractChapterIdFromReaderUrl(readerUrl: string): string | undefined {
        try {
            const parts = new URL(readerUrl, SITE_BASE).pathname.split('/').filter(Boolean);
            const chapterSeg = parts[parts.length - 1] || '';
            const m = chapterSeg.match(/^(\d+)-chapter-/);
            return m?.[1];
        } catch {
            return undefined;
        }
    }

    private static apiHeaders(referer = `${SITE_BASE}/`): Record<string, string> {
        return {
            Referer: referer,
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };
    }

    private static async getBrowser() {
        logger.debug('[MangaFire] Launching new browser', { service: 'mangaFireScraper' });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
            proxy: getPlaywrightProxy('mangafire'),
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            await browser.close().catch(() => {});
        } catch (error) {
            logger.warn(`[MangaFire] Error releasing browser: ${error}`, { service: 'mangaFireScraper' });
            await browser.close().catch(() => {});
        }
    }

    // ---------------------------------------------------------------------
    // Search  (GET /api/titles?keyword=…)
    // ---------------------------------------------------------------------

    private async searchMangaFire(query: string, limit: number): Promise<MangaSearchResponse> {
        const q = (query || '').trim();
        if (!q) return { results: [], summary: `Search "${q}" -> 0 results` };
        try {
            const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/api/titles`, {
                params: { keyword: q, limit: Math.min(Math.max(limit, 1), 20) },
                headers: MangaFireScraper.apiHeaders(),
                responseType: 'json',
                timeout: appConfig.scraper.mangaFire.timeout,
            });

            const items: MangaFireTitleSearchItem[] = Array.isArray(response.data?.items) ? response.data.items : [];
            logger.info(`[MangaFire] Search "${q}" -> ${items.length} row(s)`, { service: 'mangaFireScraper' });

            const results = items
                .map(item => {
                    const title = (item.title || '').trim();
                    let href = '';
                    if (item.url) {
                        try {
                            href = item.url.startsWith('http') ? item.url : new URL(item.url, SITE_BASE).href;
                        } catch {
                            href = '';
                        }
                    }
                    return { href, title, score: calculateTitleSimilarity(title, q) };
                })
                .filter(r => r.href && r.title && r.score >= 50)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            const top = results[0];
            const summary = top
                ? `Search "${q}" -> ${items.length} row(s); top: "${top.title}" (score: ${top.score})`
                : `Search "${q}" -> ${items.length} row(s)`;
            return { results, summary };
        } catch (error: any) {
            logger.error(`[MangaFire] searchMangaFire() failed for "${q}": ${error?.message || error}`, {
                service: 'mangaFireScraper',
            });
            throw error;
        }
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

        const variants = [...new Set([...baseVariants, ...normalizedExtras])];
        let bestOverall: MangaSearchResult | undefined;

        logger.info(`[MangaFire] Trying ${variants.length} search variant(s) for "${mangaName}"`, {
            service: 'mangaFireScraper',
        });

        for (const variant of variants) {
            try {
                const { results: scored } = await this.searchMangaFire(variant, 6);
                if (!scored.length) continue;
                const best = scored[0];
                logger.info(`[MangaFire] Best for "${variant}": "${best.title}" (${best.score})`, {
                    service: 'mangaFireScraper',
                });
                if (!bestOverall || best.score > bestOverall.score) bestOverall = best;
                if (bestOverall.score >= 100) break;
            } catch (error: any) {
                logger.debug(`[MangaFire] Search failed for "${variant}": ${error?.message || error}`, {
                    service: 'mangaFireScraper',
                });
            }
        }

        return bestOverall;
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResponse> {
        return this.searchMangaFire(query, Math.min(Math.max(limit, 1), 20));
    }

    // ---------------------------------------------------------------------
    // Chapter discovery  (GET /api/titles/<hid>/chapters)
    // ---------------------------------------------------------------------

    private async fetchChapterList(
        titlePath: string,
        shortId: string,
        lang: string,
    ): Promise<Array<{ url: string; title: string; number: string; chapterId?: string; isSpecial: boolean; specialType?: string }>> {
        const out: Array<{ url: string; title: string; number: string; chapterId?: string; isSpecial: boolean; specialType?: string }> = [];
        let page = 1;
        let lastPage = 1;

        do {
            const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/api/titles/${shortId}/chapters`, {
                params: { language: lang, limit: 100, page },
                headers: MangaFireScraper.apiHeaders(new URL(titlePath, SITE_BASE).href),
                responseType: 'json',
                timeout: appConfig.scraper.mangaFire.timeout,
            });

            const items: MangaFireChapterListItem[] = Array.isArray(response.data?.items) ? response.data.items : [];
            const meta = response.data?.meta;
            lastPage = typeof meta?.lastPage === 'number' && meta.lastPage > 0 ? meta.lastPage : page;

            for (const ch of items) {
                if (ch.id == null || ch.number == null || ch.number === '') continue;
                const number = String(ch.number);
                const label = ch.name?.trim() ? `Chapter ${number}: ${ch.name.trim()}` : `Chapter ${number}`;
                const parsed = ChapterNumberParser.parse(label);
                out.push({
                    url: MangaFireScraper.buildReaderUrl(titlePath, ch),
                    title: parsed.title,
                    number,
                    chapterId: String(ch.id),
                    isSpecial: parsed.isSpecial,
                    specialType: parsed.specialType,
                });
            }
            page += 1;
        } while (page <= lastPage);

        const byNumber = new Map<string, (typeof out)[number]>();
        for (const c of out) if (!byNumber.has(c.number)) byNumber.set(c.number, c);
        return Array.from(byNumber.values()).sort((a, b) => ChapterNumberParser.compareNumbers(a.number, b.number));
    }

    /** Parse legacy /read/<slug>.<id>/<lang>/chapter-<n> reader URLs. */
    private static parseReaderUrl(readerUrl: string): { shortId: string; lang: string } | undefined {
        try {
            const u = new URL(readerUrl, SITE_BASE);
            const parts = u.pathname.split('/').filter(Boolean);
            const readIdx = parts.indexOf('read');
            if (readIdx < 0 || parts.length < readIdx + 4) return undefined;
            const shortId = MangaFireScraper.extractShortId(parts[readIdx + 1] || '');
            const lang = parts[readIdx + 2];
            if (!shortId || !lang) return undefined;
            return { shortId, lang };
        } catch {
            return undefined;
        }
    }

    private async resolveChapterId(readerUrl: string): Promise<string> {
        const direct = MangaFireScraper.extractChapterIdFromReaderUrl(readerUrl);
        if (direct) return direct;

        const parsed = MangaFireScraper.parseReaderUrl(readerUrl);
        if (!parsed) throw new Error(`[MangaFire] Could not parse reader URL "${readerUrl}"`);

        const targetPath = new URL(readerUrl, SITE_BASE).pathname.replace(/\/$/, '');
        const titlePath = MangaFireScraper.extractTitlePath(readerUrl);
        if (!titlePath) throw new Error(`[MangaFire] Could not resolve title path from "${readerUrl}"`);
        const chapters = await this.fetchChapterList(titlePath, parsed.shortId, parsed.lang);
        const match = chapters.find(ch => {
            try {
                return new URL(ch.url, SITE_BASE).pathname.replace(/\/$/, '') === targetPath;
            } catch {
                return false;
            }
        });
        if (!match?.chapterId) throw new Error(`[MangaFire] No chapter id for "${readerUrl}"`);
        return match.chapterId;
    }

    private async fetchChapterImagesFromApi(chapterId: string, referer: string): Promise<MangaFirePageAsset[]> {
        const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/api/chapters/${chapterId}`, {
            headers: MangaFireScraper.apiHeaders(referer),
            responseType: 'json',
            timeout: appConfig.scraper.mangaFire.timeout,
        });

        const pages: unknown = response.data?.data?.pages;
        if (!Array.isArray(pages) || !pages.length) {
            throw new Error(`[MangaFire] Chapter ${chapterId} returned no pages`);
        }

        const assets: MangaFirePageAsset[] = [];
        for (let i = 0; i < pages.length; i++) {
            const entry = pages[i];
            if (!entry || typeof entry !== 'object' || typeof (entry as { url?: string }).url !== 'string') continue;
            assets.push({ page: i + 1, imageUrl: (entry as { url: string }).url, source: 'url' });
        }
        if (!assets.length) throw new Error(`[MangaFire] Chapter ${chapterId} page list was empty after parsing`);
        return assets;
    }

    async *scrapeChapters(
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
        } else {
            const match = await this.findBestMatch(mangaName, {
                seriesId,
                romanizedTitle,
                nativeTitle,
                secondaryTitles,
                coverUrl,
            });
            if (!match) throw new Error(`[MangaFire] Could not find manga link for "${mangaName}"`);
            pageUrl = match.href;
        }

        const shortId = MangaFireScraper.extractShortId(pageUrl);
        if (!shortId) throw new Error(`[MangaFire] Could not extract short id from "${pageUrl}"`);

        const titlePath = MangaFireScraper.extractTitlePath(pageUrl);
        if (!titlePath) throw new Error(`[MangaFire] Could not extract title path from "${pageUrl}"`);

        logger.info(`[MangaFire] "${mangaName}": shortId=${shortId}, lang=${DEFAULT_LANG}`, {
            service: 'mangaFireScraper',
        });

        const chapters = await this.fetchChapterList(titlePath, shortId, DEFAULT_LANG);
        logger.info(`[MangaFire] "${mangaName}": ${chapters.length} chapter(s) discovered`, {
            service: 'mangaFireScraper',
        });

        for (const chap of chapters) {
            if (await checkExists(chap.number)) continue;
            yield {
                url: chap.url,
                title: chap.title,
                number: chap.number,
                isSpecial: chap.isSpecial,
                specialType: chap.specialType,
                scraperId: this.metadata.id,
            };
        }
    }

    // ---------------------------------------------------------------------
    // Chapter download  (VRF ajax image list; Playwright reader fallback)
    // ---------------------------------------------------------------------

    async downloadChapter(
        url: string,
        seriesId: number,
        chapterNumber: string,
        _mangaName: string,
        _folderName: string,
    ): Promise<DownloadedChapter> {
        const contextLabel = `series=${seriesId} ch=${chapterNumber}`;

        try {
            const chapterId = await this.resolveChapterId(url);
            logger.info(`[MangaFire] [${contextLabel}] Resolved chapterId=${chapterId}`, { service: 'mangaFireScraper' });
            const assets = await this.fetchChapterImagesFromApi(chapterId, url);
            logger.info(`[MangaFire] [${contextLabel}] API returned ${assets.length} page(s)`, { service: 'mangaFireScraper' });
            const storagePrefix = await this.downloadPageAssets(assets, seriesId, chapterNumber, url, assets.length, contextLabel);
            logger.info(
                `[MangaFire] [${contextLabel}] Completed via API (prefix=${storagePrefix}, pages=${assets.length})`,
                { service: 'mangaFireScraper' },
            );
            return { storagePrefix, pageCount: assets.length };
        } catch (apiError: any) {
            logger.warn(
                `[MangaFire] [${contextLabel}] API download failed (${apiError?.message || apiError}); falling back to reader`,
                { service: 'mangaFireScraper' },
            );
        }

        return this.downloadChapterViaReader(url, seriesId, chapterNumber, contextLabel);
    }

    private async downloadChapterViaReader(
        url: string,
        seriesId: number,
        chapterNumber: string,
        contextLabel: string,
    ): Promise<DownloadedChapter> {
        const maxAttempts = 2;
        let lastError: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const attemptLabel = `${contextLabel} attempt=${attempt}/${maxAttempts}`;
            logger.info(`[MangaFire] [${attemptLabel}] Starting download for ${url}`, {
                service: 'mangaFireScraper',
            });
            const browser = await MangaFireScraper.getBrowser();
            const context = await browser.newContext({
                userAgent: appConfig.scraper.mangaFire.userAgent,
                viewport: { width: 1800, height: 2600 },
                deviceScaleFactor: 1,
                locale: 'en-US',
            });
            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
            const page = await context.newPage();

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                // The reader renders pages into a vertical container once the site's
                // own JS resolves the VRF token. Wait for at least one page image.
                await page
                    .waitForSelector('.page-wrapper img, .page img, div[data-number] img, canvas', {
                        timeout: 45000,
                    })
                    .catch(() => {});

                const expectedPageCount: number = await page.evaluate(() => {
                    const sel = [
                        '.page-wrapper',
                        '.number-nav .total',
                        '.page',
                        'div[data-number]',
                    ];
                    for (const s of sel) {
                        const n = document.querySelectorAll(s).length;
                        if (n > 0) return n;
                    }
                    return 0;
                });
                logger.info(`[MangaFire] Chapter ${chapterNumber}: expected pages ~= ${expectedPageCount}`, {
                    service: 'mangaFireScraper',
                });

                let assets = await this.collectPageAssetsFromReader(page, expectedPageCount, attemptLabel);
                if (!assets.length) throw new ScraperStageError({
                    stage: 'extract_images',
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    url,
                    message: 'Reader returned no page images (layout change or empty chapter?)',
                });

                if (expectedPageCount > 0 && assets.length < expectedPageCount) {
                    const retry = await this.collectPageAssetsFromReader(
                        page,
                        expectedPageCount,
                        `${attemptLabel} retry`,
                    );
                    if (retry.length > assets.length) assets = retry;
                }

                const totalPages = expectedPageCount > 0 ? Math.max(expectedPageCount, assets.length) : assets.length;
                const storagePrefix = await this.downloadPageAssets(
                    assets,
                    seriesId,
                    chapterNumber,
                    url,
                    totalPages,
                    attemptLabel,
                );
                logger.info(
                    `[MangaFire] [${attemptLabel}] Completed (prefix=${storagePrefix}, pages=${totalPages})`,
                    { service: 'mangaFireScraper' },
                );
                return { storagePrefix, pageCount: totalPages };
            } catch (error: any) {
                lastError = error;
                const message = `${error?.message || error}`;
                const isCrash =
                    /target crashed|target page, context or browser has been closed|browser has been closed/i.test(
                        message,
                    );
                logger.error(`[MangaFire] [${attemptLabel}] Download failed: ${message}`, {
                    service: 'mangaFireScraper',
                });
                if (attempt < maxAttempts && isCrash) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                throw error;
            } finally {
                await page.close().catch(() => {});
                await context.close().catch(() => {});
                await MangaFireScraper.releaseBrowser(browser);
            }
        }

        throw lastError || new Error(`[MangaFire] Failed to download chapter ${chapterNumber}`);
    }

    private hasCompleteAsset(asset: MangaFirePageAsset): boolean {
        return !!(asset.imageUrl || asset.dataUrl);
    }

    private getMissingPages(assets: MangaFirePageAsset[], expectedPageCount: number): number[] {
        if (expectedPageCount <= 0) return [];
        const have = new Set<number>(assets.filter(a => this.hasCompleteAsset(a)).map(a => a.page));
        const missing: number[] = [];
        for (let i = 1; i <= expectedPageCount; i++) if (!have.has(i)) missing.push(i);
        return missing;
    }

    private mergePageAssets(base: MangaFirePageAsset[], incoming: MangaFirePageAsset[]): MangaFirePageAsset[] {
        const merged = new Map<number, MangaFirePageAsset>(base.map(a => [a.page, a]));
        for (const asset of incoming) {
            const existing = merged.get(asset.page);
            if (!existing) {
                merged.set(asset.page, asset);
                continue;
            }
            if (!existing.dataUrl && asset.dataUrl) {
                merged.set(asset.page, {
                    ...existing,
                    dataUrl: asset.dataUrl,
                    width: asset.width,
                    height: asset.height,
                    source: asset.source,
                });
            } else if (!existing.imageUrl && asset.imageUrl) {
                merged.set(asset.page, { ...existing, imageUrl: asset.imageUrl, source: asset.source || existing.source });
            }
        }
        return Array.from(merged.values()).sort((a, b) => a.page - b.page);
    }

    /**
     * Scroll the reader to force lazy-loaded pages to render, capturing a direct
     * CDN URL for plain <img> pages and a screenshot for canvas/scrambled pages.
     */
    private async collectPageAssetsFromReader(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
    ): Promise<MangaFirePageAsset[]> {
        const pageMap = new Map<number, MangaFirePageAsset>();
        const maxSteps = Math.max(expectedPageCount > 0 ? expectedPageCount * 8 : 420, 160);
        const minLong = MangaFireScraper.MIN_CHAPTER_LONG_EDGE;
        const minShort = MangaFireScraper.MIN_CHAPTER_SHORT_EDGE;
        let stagnantSteps = 0;

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);

        for (let step = 1; step <= maxSteps; step++) {
            const before = pageMap.size;
            const snapshot: Array<{
                page: number;
                imageUrl?: string;
                hasCanvas: boolean;
                canvasWidth?: number;
                canvasHeight?: number;
            }> = await page.evaluate(
                ({ minLong, minShort }: { minLong: number; minShort: number }) => {
                    const edgesOk = (w: number, h: number) => Math.min(w, h) >= minShort && Math.max(w, h) >= minLong;
                    // A "page slot" is any element carrying a 1-based page index.
                    const slots = Array.from(
                        document.querySelectorAll<HTMLElement>(
                            '.page-wrapper[data-number], .page[data-number], div[data-number], .page-wrapper, .page',
                        ),
                    );
                    const out: Array<{
                        page: number;
                        imageUrl?: string;
                        hasCanvas: boolean;
                        canvasWidth?: number;
                        canvasHeight?: number;
                    }> = [];

                    slots.forEach((node, idx) => {
                        const img = node.querySelector('img') as HTMLImageElement | null;
                        const src = img?.currentSrc || img?.getAttribute('src') || img?.getAttribute('data-src') || '';
                        const dataNum = Number(node.getAttribute('data-number') || '');
                        const inferred = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png|avif)(\?|$)/i);
                        const pageNum =
                            Number.isFinite(dataNum) && dataNum > 0
                                ? dataNum
                                : inferred
                                ? Number(inferred[1])
                                : idx + 1;
                        if (!Number.isFinite(pageNum) || pageNum < 1) return;

                        const imgReady =
                            !!img && img.complete && edgesOk(img.naturalWidth, img.naturalHeight);

                        const rect = node.getBoundingClientRect();
                        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        const canvas = node.querySelector('canvas') as HTMLCanvasElement | null;
                        const cw = canvas?.width || 0;
                        const ch = canvas?.height || 0;
                        const hasCanvas = !!canvas && visible && edgesOk(cw, ch);

                        if (imgReady && /^https?:\/\//i.test(src) && /\.(webp|jpg|jpeg|png|avif)(\?|$)/i.test(src)) {
                            out.push({ page: pageNum, imageUrl: src, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                        } else if (hasCanvas) {
                            out.push({ page: pageNum, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                        }
                    });

                    return out;
                },
                { minLong, minShort },
            );

            for (const a of snapshot) {
                const existing = pageMap.get(a.page);
                if (!existing) {
                    pageMap.set(a.page, {
                        page: a.page,
                        imageUrl: a.imageUrl,
                        width: a.canvasWidth,
                        height: a.canvasHeight,
                        source: a.imageUrl ? 'url' : undefined,
                    });
                } else if (!existing.imageUrl && a.imageUrl) {
                    pageMap.set(a.page, { ...existing, imageUrl: a.imageUrl, source: 'url' });
                }
            }

            const canvasCandidates = snapshot.filter(
                a => a.hasCanvas && !pageMap.get(a.page)?.dataUrl && !pageMap.get(a.page)?.imageUrl,
            );
            for (const c of canvasCandidates) {
                const captured = await this.capturePageViaScreenshot(page, c.page, contextLabel);
                if (captured) pageMap.set(c.page, { ...(pageMap.get(c.page) || { page: c.page }), ...captured });
            }

            stagnantSteps = pageMap.size > before ? 0 : stagnantSteps + 1;
            if (expectedPageCount > 0 && pageMap.size >= expectedPageCount) break;
            if (stagnantSteps >= 40) break;

            await page.evaluate(() => window.scrollBy(0, Math.max(900, Math.floor(window.innerHeight * 0.85))));
            await page.waitForTimeout(300);
        }

        const assets = Array.from(pageMap.values()).sort((a, b) => a.page - b.page);
        logger.info(
            `[MangaFire] [${contextLabel}] Reader capture: ${assets.length} page(s) ` +
                `(${assets.filter(a => a.imageUrl).length} URL, ${assets.filter(a => a.dataUrl).length} canvas)`,
            { service: 'mangaFireScraper' },
        );
        return assets;
    }

    private async capturePageViaScreenshot(
        page: any,
        pageNum: number,
        contextLabel: string,
    ): Promise<MangaFirePageAsset | null> {
        try {
            const node = page
                .locator(`.page-wrapper[data-number="${pageNum}"], .page[data-number="${pageNum}"], div[data-number="${pageNum}"]`)
                .first();
            if (!(await node.count())) return null;
            await node.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(250);

            const canvasLoc = node.locator('canvas').first();
            const imgLoc = node.locator('img').first();
            let target = node;
            if (await canvasLoc.count()) target = canvasLoc;
            else if (await imgLoc.count()) target = imgLoc;

            const buffer: Buffer = await target.screenshot({
                type: 'png',
                animations: 'disabled',
                timeout: MangaFireScraper.SCREENSHOT_TIMEOUT_MS,
            });
            if (!buffer || buffer.length <= 1500) return null;
            const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
            const width = metadata.width || 0;
            const height = metadata.height || 0;
            if (!MangaFireScraper.isValidChapterImageDimensions(width, height)) {
                logger.debug(
                    `[MangaFire] [${contextLabel}] Rejecting screenshot page ${pageNum} (${width}x${height})`,
                    { service: 'mangaFireScraper' },
                );
                return null;
            }
            return {
                page: pageNum,
                dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
                width,
                height,
                source: 'canvas-screenshot',
            };
        } catch (error) {
            logger.debug(`[MangaFire] [${contextLabel}] Screenshot capture failed page ${pageNum}: ${error}`, {
                service: 'mangaFireScraper',
            });
            return null;
        }
    }

    private async downloadPageAssets(
        assets: MangaFirePageAsset[],
        seriesId: number,
        chapterNumber: string,
        referer: string,
        totalPages: number,
        contextLabel = 'download',
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        const byPage = new Map<number, MangaFirePageAsset>(assets.map(a => [a.page, a]));
        const batchSize = 10;
        const maxRetries = 3;
        const retryDelayMs = 1000;

        const downloadOne = async (pageNum: number) => {
            const key = objectStorageService.keyFor(storagePrefix, pageNum - 1);
            const asset = byPage.get(pageNum);
            if (!asset) {
                // Missing page → fail the chapter so it's retried, rather than storing a
                // placeholder that masks an incomplete download.
                throw new ScraperStageError({
                    stage: 'extract_images',
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    url: referer,
                    pageNumber: pageNum,
                    pageCount: totalPages,
                    message: 'Page missing from extracted assets (incomplete capture)',
                });
            }

            let lastError: any;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (asset.dataUrl?.startsWith('data:image')) {
                        const raw = Buffer.from(asset.dataUrl.split(',')[1] || '', 'base64');
                        const out = await sharp(raw, { failOn: 'none' }).webp({ lossless: true, effort: 2 }).toBuffer();
                        await objectStorageService.putObject(key, out);
                        return;
                    }
                    if (asset.imageUrl) {
                        const response = await MangaFireScraper.axiosInstance.get(asset.imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 30000,
                            headers: {
                                Referer: `${SITE_BASE}/`,
                                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                                'User-Agent': appConfig.scraper.mangaFire.userAgent,
                            },
                        });
                        const buffer = Buffer.from(response.data as ArrayBuffer);
                        if (buffer.length < MangaFireScraper.MIN_IMAGE_DOWNLOAD_BYTES) {
                            throw new Error(`Payload too small page ${pageNum}: ${buffer.length} bytes`);
                        }
                        const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
                        const width = metadata.width || 0;
                        const height = metadata.height || 0;
                        if (!MangaFireScraper.isValidChapterImageDimensions(width, height)) {
                            throw new Error(`Dimensions too small page ${pageNum}: ${width}x${height}`);
                        }
                        // Normalise to webp for consistent storage (source may be webp/jpg/avif).
                        const isWebp =
                            buffer.length >= 12 &&
                            buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
                            buffer.slice(8, 12).toString('ascii') === 'WEBP';
                        if (isWebp) {
                            await objectStorageService.putObject(key, buffer);
                        } else {
                            const out = await sharp(buffer, { failOn: 'none' }).webp({ quality: 90, effort: 2 }).toBuffer();
                            await objectStorageService.putObject(key, out);
                        }
                        logger.debug(
                            `[MangaFire] [${contextLabel}] Page ${pageNum}: saved ${MangaFireScraper.summarizeAssetUrl(asset.imageUrl)} (${width}x${height})`,
                            { service: 'mangaFireScraper' },
                        );
                        return;
                    }
                    throw new Error(`No imageUrl or dataUrl for page ${pageNum}`);
                } catch (err: any) {
                    lastError = err;
                    logger.warn(
                        `[MangaFire] [${contextLabel}] Page ${pageNum} attempt ${attempt}/${maxRetries}: ${err?.message || err}`,
                        { service: 'mangaFireScraper' },
                    );
                    if (isTrue404Error(err)) break; // deterministic 404 → placeholder below
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt - 1)));
                    }
                }
            }
            // A true 404 → placeholder this one page; any other exhausted failure fails the
            // chapter (queue retries it, and onFailed records a download_failed ledger row).
            if (await store404PlaceholderIfMissing(lastError, { storagePrefix, pageIndex: pageNum - 1, imageUrl: byPage.get(pageNum)?.imageUrl ?? '', scraperId: this.metadata.id, service: 'mangaFireScraper' })) return;
            const described = describeError(lastError);
            const stageError = new ScraperStageError({
                stage: 'download_image',
                message: described.message,
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url: referer,
                pageNumber: pageNum,
                pageCount: totalPages,
                imageUrl: byPage.get(pageNum)?.imageUrl,
                attempts: maxRetries,
                httpStatus: described.httpStatus,
                code: described.code,
                cause: lastError,
            });
            logger.error(stageError.message, { service: 'mangaFireScraper', ...stageError.toLogDetail() });
            throw stageError;
        };

        const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
        for (let start = 0; start < pageNumbers.length; start += batchSize) {
            const chunk = pageNumbers.slice(start, start + batchSize);
            await Promise.all(chunk.map(downloadOne));
        }

        return storagePrefix;
    }
}