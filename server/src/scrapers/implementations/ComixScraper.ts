/**
 * Comix Scraper Implementation
 *
 * Scraper for comix.to manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 *
 * Site characteristics (verified from live HTML + HAR capture):
 * - Cloudflare-protected: a cf_clearance cookie is required for every request.
 *   Obtained via FlareSolverr (preferred, FLARESOLVERR_URL) or a Playwright
 *   challenge-solve fallback. A raw COMIX_CF_CLEARANCE env may also be supplied.
 * - The title/overview page embeds machine-readable JSON in two <script> tags:
 *     #syncData       -> { manga_id, manga_url, name, anilist_id, mal_id, ... }
 *     #initial-data   -> queries["[\"manga\",\"detail\",\"<hid>\"]"] with
 *                        latestChapter / finalChapter / firstChapterUrl, plus
 *                        queries["[\"manga\",\"groups\",\"<hid>\"]"] = scanlation groups.
 *   We parse these for reliable metadata and a baseline expected-max chapter.
 * - The chapter list itself renders as `section.mpage__chapters li.mchap-item`
 *   rows, filterable per scanlation group via the `div.fdrop.mpage__group` menu,
 *   and paginated via `nav.npager`.
 * - The reader calls `GET /api/v1/chapters/{chapterId}` which returns an
 *   ENCRYPTED payload ({ "e": "<base64-ish blob>" }); the page image list is
 *   only decrypted client-side. We therefore never parse that API directly and
 *   instead read the rendered reader DOM (`.rpage-page[data-page]`).
 * - Page images are served from a rotating CDN host of the form
 *     https://<sub>.wowpic<N>.store/i4/<token>/NN.webp
 *   with 2-digit zero-padded page numbers. Most pages are plain <img> loads and
 *   can be fetched directly with a `Referer: https://comix.to/` header. Periodic
 *   "protected" pages are re-fetched by the reader via JS (carrying a `?v<N>`
 *   query marker) and drawn to a <canvas>; those must be captured from the
 *   browser rather than fetched directly.
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
import { requestFlareSolverr, type FlareSolverrCookie, type FlareSolverrResult } from '@/lib/flareSolverrClient';
import { ScraperStageError, describeError } from '../lib/scraperError';

const SITE_BASE = appConfig.scraper.comix.baseUrl;

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

function isComixSearchApiUrl(url: string, query: string): boolean {
    try {
        const parsed = new URL(url);
        if (!/\/api\/v\d+\/(manga|search)/i.test(parsed.pathname)) return false;
        const keyword = parsed.searchParams.get('keyword') || parsed.searchParams.get('q') || '';
        if (!keyword.trim()) return false;
        const normalizedQuery = normalizeForSearch(query);
        const normalizedKeyword = normalizeForSearch(keyword);
        return (
            normalizedKeyword === normalizedQuery ||
            normalizedKeyword.includes(normalizedQuery) ||
            normalizedQuery.includes(normalizedKeyword)
        );
    } catch {
        return false;
    }
}

function parseComixSearchItems(raw: unknown): ComixSearchItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((it: any) => {
            const hid = it.hid ?? it.hash_id ?? it.id;
            const slug = typeof it.slug === 'string' ? it.slug : '';
            const title = (it.title || it.name || '').trim();
            let url = it.url || it.href || '';
            if (!url && hid) url = slug ? `/title/${hid}-${slug}` : `/title/${hid}`;
            return { title, url: String(url) };
        })
        .filter((it: ComixSearchItem) => it.title && it.url);
}

interface ComixSearchItem {
    title: string;
    url: string;
}

interface ComixPageAsset {
    page: number;
    /** Direct CDN URL (plain <img> pages). */
    imageUrl?: string;
    /** Base64 data URL produced by a browser canvas/screenshot capture. */
    dataUrl?: string;
    width?: number;
    height?: number;
    source?: 'url' | 'canvas' | 'canvas-screenshot';
}

interface ComixGroup {
    id: number;
    name: string;
    slug?: string | null;
}

interface ComixCfSession {
    cfClearance: string;
    userAgent: string;
    expiresAt: number;
    browserCookies: Array<{ name: string; value: string; domain: string; path: string }>;
}

const COMIX_CF_HELP =
    'Set FLARESOLVERR_URL for automatic Cloudflare bypass, or export COMIX_CF_CLEARANCE ' +
    '(+ COMIX_CF_USER_AGENT) captured from a real browser session on comix.to.';

/** Comix browse defaults to Suggestive; NSFW titles require selecting Pornographic in the UI filter. */
const COMIX_SEARCH_CONTENT_RATING = 'pornographic';
const COMIX_SEARCH_CONTENT_RATING_LABEL = 'Pornographic';

function getComixSearchCapturePriority(url: string, query: string): number {
    if (!isComixSearchApiUrl(url, query)) return -1;
    try {
        const rating = new URL(url).searchParams.get('content_rating') || '';
        if (rating === COMIX_SEARCH_CONTENT_RATING) return 2;
        if (!rating) return 1;
        return 0;
    } catch {
        return -1;
    }
}

function getFlareSolverrUrl(): string | undefined {
    const url =
        process.env.FLARESOLVERR_URL?.trim() ||
        appConfig.scraper.comix.flareSolverrUrl?.trim();
    return url ? url.replace(/\/$/, '') : undefined;
}

function mapSearchResults(items: ComixSearchItem[], query: string, limit: number, opts?: { trustSiteRanking?: boolean }): MangaSearchResult[] {
    const mapped = items
        .map((item, index) => {
            const similarity = calculateTitleSimilarity(item.title || '', query);
            const score = opts?.trustSiteRanking ? Math.max(similarity, Math.max(50, 100 - index * 3)) : similarity;
            return {
                href: item.url?.startsWith('http') ? item.url : new URL(item.url || '', SITE_BASE).href,
                title: item.title || '',
                score,
            };
        })
        .filter(r => r.href && r.title && (opts?.trustSiteRanking || r.score >= 50))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    if (items.length && !mapped.length) {
        logger.debug(
            `[Comix] All ${items.length} search item(s) filtered out for "${query}" (top title: "${items[0]?.title || ''}")`,
            { service: 'comixScraper' },
        );
    }

    return mapped;
}

export class ComixScraper implements IChapterScraper {
    /** Portrait full pages. */
    private static readonly MIN_CAPTURE_WIDTH = 700;
    private static readonly MIN_CAPTURE_HEIGHT = 900;
    /** Accept landscape spreads too: validate by long/short edge, not both portrait mins. */
    private static readonly MIN_CHAPTER_LONG_EDGE = 650;
    private static readonly MIN_CHAPTER_SHORT_EDGE = 400;
    /** Reader thumbnails decode before the full image; lower bar for DOM readiness. */
    private static readonly MIN_IMAGE_NATURAL_WIDTH = 320;
    private static readonly MIN_IMAGE_NATURAL_HEIGHT = 400;
    /** CDN placeholders/spinners are ~1-2 KB; real webp pages are far larger. */
    private static readonly MIN_IMAGE_DOWNLOAD_BYTES = 2_000;
    private static readonly SCREENSHOT_TIMEOUT_MS = 15_000;

    private static cfSessionCache: ComixCfSession | null = null;
    private static cfSessionPromise: Promise<ComixCfSession> | null = null;

    private readonly metadata: ScraperMetadata = {
        id: 'comix',
        name: 'Comix',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.comix.priority,
        enabled: appConfig.scraper.comix.enabled,
        searchTimeoutMs: 130_000,
    };

    // Egress (agents + proxy + ban detection) centralized in scraperEgress; flag off
    // → identical to the previous keep-alive axios instance.
    private static readonly axiosInstance = buildAxios({
        scraperId: 'comix',
        timeout: appConfig.scraper.comix.timeout,
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': appConfig.scraper.comix.userAgent,
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return this.metadata.enabled;
    }

    // ---------------------------------------------------------------------
    // Validation helpers
    // ---------------------------------------------------------------------

    private static isValidChapterImageDimensions(width: number, height: number): boolean {
        if (width <= 0 || height <= 0) return false;
        const longEdge = Math.max(width, height);
        const shortEdge = Math.min(width, height);
        return longEdge >= ComixScraper.MIN_CHAPTER_LONG_EDGE && shortEdge >= ComixScraper.MIN_CHAPTER_SHORT_EDGE;
    }

    /**
     * Pages the reader re-fetches via JS and renders to a <canvas> carry a
     * `?v<N>` query marker on the CDN URL. When we only have a constructed
     * (marker-less) URL list, the site's observed pattern is that every 4th
     * page is protected, so we fall back to that heuristic.
     */
    private static isProtectedPage(pageNum: number, imageUrl?: string): boolean {
        if (imageUrl && /[?&]v\d+/i.test(imageUrl)) return true;
        return pageNum > 0 && pageNum % 4 === 0;
    }

    private static describeDownloadBuffer(buffer: Buffer): string {
        if (
            buffer.length >= 12 &&
            buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
            buffer.slice(8, 12).toString('ascii') === 'WEBP'
        ) {
            return `webp (${buffer.length} bytes)`;
        }
        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return `jpeg (${buffer.length} bytes)`;
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

    // ---------------------------------------------------------------------
    // Browser lifecycle
    // ---------------------------------------------------------------------

    private static async getBrowser() {
        logger.debug('[Comix] Launching new browser', { service: 'comixScraper' });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
            proxy: getPlaywrightProxy('comix'),
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

    // ---------------------------------------------------------------------
    // Cloudflare clearance
    // ---------------------------------------------------------------------

    private async requestFlareSolverr(payload: Record<string, unknown>): Promise<FlareSolverrResult> {
        const flareSolverrUrl = getFlareSolverrUrl();
        if (!flareSolverrUrl) throw new Error('FlareSolverr URL is not configured');
        return requestFlareSolverr(flareSolverrUrl, payload);
    }

    private buildBrowserCookies(
        cookies: FlareSolverrCookie[],
    ): Array<{ name: string; value: string; domain: string; path: string }> {
        return cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: '.comix.to', path: '/' }));
    }

    private flareSessionFromSolution(solution: FlareSolverrResult['solution']): ComixCfSession {
        const cookies = solution?.cookies || [];
        const clearance = cookies.find(cookie => cookie.name === 'cf_clearance');
        if (!clearance?.value) throw new Error('FlareSolverr response missing cf_clearance cookie');

        const expirySeconds =
            clearance.expiry && clearance.expiry > 0 ? clearance.expiry : Math.floor(Date.now() / 1000) + 1800;
        return {
            cfClearance: clearance.value,
            userAgent: solution?.userAgent || appConfig.scraper.comix.userAgent,
            expiresAt: expirySeconds * 1000,
            browserCookies: this.buildBrowserCookies(cookies),
        };
    }

    private async getCfSessionViaFlareSolverr(): Promise<ComixCfSession> {
        logger.info('[Comix] Requesting Cloudflare clearance via FlareSolverr', { service: 'comixScraper' });
        const result = await this.requestFlareSolverr({
            cmd: 'request.get',
            url: `${SITE_BASE}/browse`,
            maxTimeout: 120000,
        });
        return this.flareSessionFromSolution(result.solution);
    }

    private async getCfSessionViaPlaywright(): Promise<ComixCfSession> {
        const browser = await ComixScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.comix.userAgent,
            viewport: { width: 1366, height: 768 },
            locale: 'en-US',
        });
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        const envClearance = process.env.COMIX_CF_CLEARANCE?.trim();
        if (envClearance) {
            await context.addCookies([{ name: 'cf_clearance', value: envClearance, domain: '.comix.to', path: '/' }]);
        }

        const page = await context.newPage();
        try {
            await page.goto(`${SITE_BASE}/browse`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            for (let i = 0; i < 60; i++) {
                const cookies = await context.cookies();
                const clearance = cookies.find(
                    (cookie: { name: string; value: string; expires?: number }) => cookie.name === 'cf_clearance',
                );
                if (clearance?.value) {
                    const allCookies = await context.cookies();
                    return {
                        cfClearance: clearance.value,
                        userAgent: process.env.COMIX_CF_USER_AGENT?.trim() || appConfig.scraper.comix.userAgent,
                        expiresAt:
                            (clearance.expires && clearance.expires > 0
                                ? clearance.expires
                                : Math.floor(Date.now() / 1000) + 1800) * 1000,
                        browserCookies: allCookies.map((cookie: { name: string; value: string }) => ({
                            name: cookie.name,
                            value: cookie.value,
                            domain: '.comix.to',
                            path: '/',
                        })),
                    };
                }
                const title = await page.title();
                if (!title.includes('Just a moment')) break;
                await page.waitForTimeout(2000);
            }
            throw new Error(`Playwright could not obtain cf_clearance within timeout. ${COMIX_CF_HELP}`);
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ComixScraper.releaseBrowser(browser);
        }
    }

    private async getCfSession(forceRefresh = false): Promise<ComixCfSession> {
        if (
            !forceRefresh &&
            ComixScraper.cfSessionCache &&
            Date.now() < ComixScraper.cfSessionCache.expiresAt - 60_000
        ) {
            return ComixScraper.cfSessionCache;
        }

        const envClearance = process.env.COMIX_CF_CLEARANCE?.trim();
        if (envClearance && !forceRefresh) {
            const session: ComixCfSession = {
                cfClearance: envClearance,
                userAgent: process.env.COMIX_CF_USER_AGENT?.trim() || appConfig.scraper.comix.userAgent,
                expiresAt: Date.now() + 30 * 60 * 1000,
                browserCookies: [{ name: 'cf_clearance', value: envClearance, domain: '.comix.to', path: '/' }],
            };
            ComixScraper.cfSessionCache = session;
            return session;
        }

        if (!ComixScraper.cfSessionPromise || forceRefresh) {
            ComixScraper.cfSessionPromise = (async () => {
                try {
                    if (getFlareSolverrUrl()) return await this.getCfSessionViaFlareSolverr();
                    return await this.getCfSessionViaPlaywright();
                } finally {
                    ComixScraper.cfSessionPromise = null;
                }
            })();
        }

        const session = await ComixScraper.cfSessionPromise;
        ComixScraper.cfSessionCache = session;
        return session;
    }

    private async createBrowserContext(
        browser: any,
        viewport: { width: number; height: number } = { width: 1800, height: 2600 },
    ): Promise<any> {
        const session = await this.getCfSession();
        const context = await browser.newContext({
            userAgent: session.userAgent,
            viewport,
            deviceScaleFactor: 1,
            locale: 'en-US',
        });
        const cookies = session.browserCookies.length
            ? session.browserCookies
            : [{ name: 'cf_clearance', value: session.cfClearance, domain: '.comix.to', path: '/' }];
        await context.addCookies(cookies);
        await this.applyReaderDefaults(context);
        return context;
    }

    private async gotoComixPage(page: any, url: string, timeout = 45000): Promise<void> {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        for (let i = 0; i < 15; i++) {
            const title = await page.title();
            if (!title.includes('Just a moment')) return;
            await page.waitForTimeout(2000);
        }
    }

    // ---------------------------------------------------------------------
    // Search
    // ---------------------------------------------------------------------

    private async extractBrowseRows(page: any): Promise<Array<{ href: string; title: string }>> {
        return page.evaluate((siteBase: string) => {
            const resolveUrl = (href: string) => {
                if (!href) return '';
                if (href.startsWith('http')) return href;
                try {
                    return new URL(href, siteBase).href;
                } catch {
                    return '';
                }
            };

            // Prefer the embedded query cache if present (most reliable),
            // else fall back to scraping rendered browse rows.
            const rows: Array<{ href: string; title: string }> = [];
            const seen = new Set<string>();

            document
                .querySelectorAll<HTMLAnchorElement>('a.lrow__title-link, a.lrow__poster, a[href^="/title/"]')
                .forEach(link => {
                    const href = resolveUrl(link.getAttribute('href') || '');
                    if (!href || !/\/title\//.test(href) || seen.has(href)) return;
                    const row = link.closest('.lrow, li, article') as HTMLElement | null;
                    const title =
                        row?.querySelector<HTMLElement>('h3.lrow__title, .lrow__title')?.textContent?.trim() ||
                        link.getAttribute('title')?.trim() ||
                        link.textContent?.trim() ||
                        '';
                    if (!title) return;
                    seen.add(href);
                    rows.push({ href, title });
                });

            return rows;
        }, SITE_BASE);
    }

    private async ensureBrowseAdvancedFilters(page: any): Promise<void> {
        const toggle = page.locator('.filter-adv-toggle');
        await toggle.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
            await toggle.click();
            await page.locator('.filter-grid .fdrop__label').first().waitFor({ timeout: 10000 }).catch(() => {});
        }
    }

    /** Returns true when the dropdown value changed (triggers a fresh browse API request). */
    private async setBrowseContentRating(page: any, label: string): Promise<boolean> {
        await this.ensureBrowseAdvancedFilters(page);
        const ratingDrop = page.locator('.fdrop').filter({
            has: page.locator('.fdrop__label', { hasText: 'CONTENT RATING' }),
        });
        await ratingDrop.waitFor({ state: 'visible', timeout: 10000 });
        const valueEl = ratingDrop.locator('.fdrop__value');
        const current = ((await valueEl.textContent()) || '').trim();
        if (current.localeCompare(label, undefined, { sensitivity: 'accent' }) === 0) return false;

        await ratingDrop.locator('.fdrop__btn').click();
        const option = ratingDrop.locator('[role="listbox"] [role="option"]', { hasText: label });
        await option.waitFor({ state: 'visible', timeout: 5000 });
        await option.click();
        await valueEl.filter({ hasText: label }).waitFor({ timeout: 10000 }).catch(() => {});
        return true;
    }

    private formatComixSearchSummary(sourceLine: string, query: string, results: MangaSearchResult[]): string {
        const top = [...results].sort((a, b) => b.score - a.score)[0];
        if (!top) return `${sourceLine} for "${query}"`;
        const title = top.title?.trim() || '(untitled)';
        return `${sourceLine} for "${query}"; top: "${title}" (score: ${top.score})`;
    }

    private async searchViaBrowser(session: ComixCfSession, query: string, limit: number): Promise<MangaSearchResponse> {
        const browser = await ComixScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: session.userAgent,
            viewport: { width: 1366, height: 768 },
            locale: 'en-US',
        });
        const cookies = session.browserCookies.length
            ? session.browserCookies
            : [{ name: 'cf_clearance', value: session.cfClearance, domain: '.comix.to', path: '/' }];
        await context.addCookies(cookies);
        const page = await context.newPage();

        // Capture the JSON the browse page fetches internally (most reliable result set).
        const apiCapture: { items: ComixSearchItem[] | null; priority: number } = { items: null, priority: -1 };
        page.on('response', async (res: { url: () => string; json: () => Promise<any> }) => {
            const url = res.url();
            if (!/\/api\/v\d+\/(manga|search)/i.test(url)) return;
            const priority = getComixSearchCapturePriority(url, query);
            if (priority < 0 || priority < apiCapture.priority) return;
            try {
                const data = await res.json();
                const items = parseComixSearchItems(data?.result?.items || data?.items);
                if (!items.length) return;
                apiCapture.items = items;
                apiCapture.priority = priority;
            } catch {
                /* ignore malformed payloads */
            }
        });

        try {
            const browseUrl = `${SITE_BASE}/browse?q=${encodeURIComponent(query)}&sort=relevance%3Adesc`;
            await page.goto(browseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('.filter-search input, .filter-grid', { timeout: 20000 }).catch(() => {});

            apiCapture.items = null;
            apiCapture.priority = -1;
            await this.setBrowseContentRating(page, COMIX_SEARCH_CONTENT_RATING_LABEL);

            for (let i = 0; i < 16; i++) {
                const pendingItems = apiCapture.items as ComixSearchItem[] | null;
                if (pendingItems !== null && pendingItems.length > 0 && apiCapture.priority >= 2) break;
                await page.waitForTimeout(500);
            }
            await page.waitForSelector('.list-grid .lrow, a[href^="/title/"]', { timeout: 20000 }).catch(() => {});

            const capturedItems = apiCapture.items as ComixSearchItem[] | null;
            if (capturedItems !== null && capturedItems.length > 0 && apiCapture.priority >= 2) {
                logger.info(`[Comix] Browse API returned ${capturedItems.length} result(s) for "${query}"`, {
                    service: 'comixScraper',
                });
                const results = mapSearchResults(capturedItems, query, limit, { trustSiteRanking: true });
                return { results, summary: this.formatComixSearchSummary(`Browse API returned ${capturedItems.length} result(s)`, query, results) };
            }

            const rows = await this.extractBrowseRows(page);
            logger.info(`[Comix] DOM browse returned ${rows.length} result(s) for "${query}"`, {
                service: 'comixScraper',
            });
            const results = mapSearchResults(rows.map(r => ({ title: r.title, url: r.href })), query, limit);
            return { results, summary: this.formatComixSearchSummary(`DOM browse returned ${rows.length} result(s)`, query, results) };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ComixScraper.releaseBrowser(browser);
        }
    }

    private async searchComix(query: string, limit: number): Promise<MangaSearchResponse> {
        const q = (query || '').trim();
        if (!q) return { results: [], summary: `Search "${q}" -> 0 results` };

        try {
            let session = await this.getCfSession();
            try {
                return await this.searchViaBrowser(session, q, limit);
            } catch (browserError: any) {
                const message = browserError?.message || String(browserError);
                if (/(403|Cloudflare|Just a moment)/i.test(message)) {
                    logger.warn(
                        `[Comix] Browser search blocked (${message}); refreshing CF session and retrying`,
                        { service: 'comixScraper' },
                    );
                    ComixScraper.cfSessionCache = null;
                    session = await this.getCfSession(true);
                    return await this.searchViaBrowser(session, q, limit);
                }
                throw browserError;
            }
        } catch (error) {
            logger.error(`[Comix] searchComix() failed for "${q}": ${error}`, { service: 'comixScraper' });
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

        logger.info(`[Comix] Trying ${variants.length} search variant(s) for "${mangaName}"`, {
            service: 'comixScraper',
        });

        for (const variant of variants) {
            try {
                const { results: scored } = await this.searchComix(variant, 6);
                if (!scored.length) continue;

                const best = scored[0];
                logger.info(`[Comix] Best for variant "${variant}": "${best.title}" (${best.score})`, {
                    service: 'comixScraper',
                });

                if (!bestOverall || best.score > bestOverall.score) bestOverall = best;
                if (bestOverall.score >= 100) break;
            } catch (error: any) {
                logger.debug(`[Comix] Search failed for variant "${variant}": ${error?.message || error}`, {
                    service: 'comixScraper',
                });
            }
        }

        return bestOverall;
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResponse> {
        return this.searchComix(query, Math.min(Math.max(limit, 1), 20));
    }

    // ---------------------------------------------------------------------
    // Chapter discovery
    // ---------------------------------------------------------------------

    /**
     * Parse the title page's embedded JSON (`#initial-data`) for reliable
     * metadata: the manga hid, the scanlation groups, and the baseline
     * latest/final chapter numbers used to decide when a single group's list
     * is "complete".
     */
    private async extractOverviewData(page: any): Promise<{
        hid?: string;
        groups: ComixGroup[];
        latestChapter: number;
        finalChapter: number;
    }> {
        return page.evaluate(() => {
            const out: { hid?: string; groups: ComixGroup[]; latestChapter: number; finalChapter: number } = {
                hid: undefined,
                groups: [],
                latestChapter: 0,
                finalChapter: 0,
            };
            try {
                const sync = JSON.parse(document.getElementById('syncData')?.textContent || '{}');
                if (sync?.manga_id) out.hid = String(sync.manga_id);
            } catch {
                /* ignore */
            }
            try {
                const initial = JSON.parse(document.getElementById('initial-data')?.textContent || '{}');
                const queries = initial?.queries || {};
                const hid = out.hid || initial?.manga?.hid;
                if (hid) out.hid = String(hid);

                for (const [key, value] of Object.entries<any>(queries)) {
                    if (key.includes('"detail"') && value && typeof value === 'object') {
                        if (typeof value.latestChapter === 'number') out.latestChapter = value.latestChapter;
                        if (typeof value.finalChapter === 'number') out.finalChapter = value.finalChapter;
                    }
                    if (key.includes('"groups"') && Array.isArray(value)) {
                        out.groups = value
                            .filter((g: any) => g && g.name)
                            .map((g: any) => ({ id: Number(g.id) || 0, name: String(g.name), slug: g.slug ?? null }));
                    }
                }
            } catch {
                /* ignore */
            }
            return out;
        });
    }

    /**
     * Read scanlation groups from the rendered group-filter menu. Used as a
     * fallback when the embedded #initial-data JSON doesn't include the groups
     * query (groups are often fetched post-hydration).
     */
    private async extractGroupsFromMenu(page: any): Promise<ComixGroup[]> {
        const section = page.locator('div.fdrop.mpage__group');
        if (!(await section.count())) return [];
        const trigger = section.locator('button.ubtn.ubtn--soft').first();
        if (!(await trigger.count())) return [];

        try {
            await trigger.click({ force: true, timeout: 8000 });
        } catch {
            return [];
        }
        const menu = page.locator('div.fdrop__pop.fdrop__pop--menu');
        await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        const names: string[] = await page.evaluate(() => {
            const items = Array.from(
                document.querySelectorAll<HTMLElement>(
                    'div.fdrop__pop.fdrop__pop--menu button, div.fdrop__pop.fdrop__pop--menu a',
                ),
            );
            return items
                .map(el => el.textContent?.trim() || '')
                .filter(t => t && !/^all groups$/i.test(t));
        });

        // Close the menu again so later interactions start from a known state.
        await trigger.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);

        const seen = new Set<string>();
        const groups: ComixGroup[] = [];
        for (const name of names) {
            if (seen.has(name)) continue;
            seen.add(name);
            groups.push({ id: 0, name });
        }
        return groups;
    }

    private async selectGroupFilter(page: any, groupName: string): Promise<void> {
        const groupSection = page.locator('div.fdrop.mpage__group');
        if (!(await groupSection.count())) return;

        const trigger = groupSection.locator('button.ubtn.ubtn--soft').first();
        if (!(await trigger.count())) {
            logger.debug('[Comix] No group filter button on title page; skipping group selection', {
                service: 'comixScraper',
            });
            return;
        }

        try {
            await trigger.click({ force: true, timeout: 10000 });
        } catch (error) {
            logger.warn(`[Comix] Group filter click failed for "${groupName}": ${error}`, {
                service: 'comixScraper',
            });
            return;
        }

        const menu = page.locator('div.fdrop__pop.fdrop__pop--menu');
        await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        const option = page
            .locator('div.fdrop__pop.fdrop__pop--menu button, div.fdrop__pop.fdrop__pop--menu a')
            .filter({ hasText: groupName })
            .first();

        if (await option.count()) {
            await option.click();
            await page.waitForTimeout(700);
            await page
                .waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 10000 })
                .catch(() => {});
        }
    }

    private async collectPaginatedChapters(
        page: any,
    ): Promise<Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }>> {
        const allRows: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> =
            [];
        const maxPages = 500;

        for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
            const rows = await page.evaluate(() => {
                const chapterRows = Array.from(
                    document.querySelectorAll<HTMLElement>(
                        'section.mpage__chapters ul.mchap-list li.mchap-item',
                    ),
                );
                return chapterRows
                    .map(row => {
                        const primary = row.querySelector<HTMLAnchorElement>('a.mchap-row__primary');
                        if (!primary) return null;
                        const href = primary.getAttribute('href') || '';
                        if (!href) return null;
                        const ch = row.querySelector<HTMLElement>('span.mchap-row__ch')?.textContent?.trim() || '';
                        const vol = row.querySelector<HTMLElement>('span.mchap-row__vol')?.textContent?.trim() || '';
                        const tail =
                            row.querySelector<HTMLElement>('span.mchap-row__title')?.textContent?.trim() || '';
                        // Compose a label ChapterNumberParser understands (e.g. "Ch.2 I'm gonna Say It").
                        const label = [ch, vol, tail].filter(Boolean).join(' ').trim() || primary.textContent?.trim() || '';
                        return { href, label };
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
            if (!(await nextButton.count())) break;

            const isDisabled = await nextButton.evaluate((el: HTMLButtonElement) => {
                return (
                    !!el.disabled ||
                    el.getAttribute('aria-disabled') === 'true' ||
                    el.classList.contains('is-disabled')
                );
            });
            if (isDisabled) break;

            const firstHrefBefore = await page.evaluate(() => {
                return (
                    document
                        .querySelector<HTMLAnchorElement>(
                            'section.mpage__chapters ul.mchap-list li.mchap-item a.mchap-row__primary',
                        )
                        ?.getAttribute('href') || ''
                );
            });

            let advanced = false;
            try {
                await nextButton.scrollIntoViewIfNeeded();
                await nextButton.click({ force: true, timeout: 5000 });
                advanced = true;
            } catch {
                advanced = await page
                    .evaluate(() => {
                        const btn = document.querySelector<HTMLButtonElement>(
                            'div.mchap-foot nav.npager button.npager__nav[aria-label="Next page"]',
                        );
                        if (!btn) return false;
                        btn.click();
                        return true;
                    })
                    .catch(() => false);
            }

            if (!advanced) {
                logger.warn('[Comix] Failed to advance chapter pagination; stopping', { service: 'comixScraper' });
                break;
            }

            await page
                .waitForFunction(
                    (prevHref: string) => {
                        const cur =
                            document
                                .querySelector<HTMLAnchorElement>(
                                    'section.mpage__chapters ul.mchap-list li.mchap-item a.mchap-row__primary',
                                )
                                ?.getAttribute('href') || '';
                        return !!cur && cur !== prevHref;
                    },
                    firstHrefBefore,
                    { timeout: 10000 },
                )
                .catch(() => {});
            await page.waitForTimeout(400);
        }

        return allRows;
    }

    private dedupeAndSortChapters(
        chapters: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }>,
    ): Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> {
        const byNumber = new Map<string, (typeof chapters)[number]>();
        for (const chapter of chapters) {
            if (!byNumber.has(chapter.number)) byNumber.set(chapter.number, chapter);
        }
        return Array.from(byNumber.values()).sort((a, b) =>
            ChapterNumberParser.compareNumbers(a.number, b.number),
        );
    }

    /** Prefer the largest group's chapters, then fill any missing numbers from other groups. */
    private mergeChapterSetsFromGroups(
        groupSets: Array<{ groupName: string; chapters: Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> }>,
    ): Array<{ url: string; title: string; number: string; isSpecial: boolean; specialType?: string }> {
        if (!groupSets.length) return [];
        const ordered = [...groupSets].sort((a, b) => b.chapters.length - a.chapters.length);
        const primary = ordered[0];
        const byNumber = new Map<string, (typeof primary.chapters)[number]>();
        for (const chapter of primary.chapters) byNumber.set(chapter.number, chapter);

        const filledFrom: string[] = [];
        for (let i = 1; i < ordered.length; i++) {
            for (const chapter of ordered[i].chapters) {
                if (byNumber.has(chapter.number)) continue;
                byNumber.set(chapter.number, chapter);
                filledFrom.push(`${chapter.number} (${ordered[i].groupName})`);
            }
        }

        const merged = Array.from(byNumber.values()).sort((a, b) =>
            ChapterNumberParser.compareNumbers(a.number, b.number),
        );
        if (filledFrom.length) {
            logger.info(
                `[Comix] Merged ${merged.length} chapter(s): primary "${primary.groupName}" (${primary.chapters.length}) + fill-ins ${filledFrom.join(', ')}`,
                { service: 'comixScraper' },
            );
        } else {
            logger.info(
                `[Comix] Using ${merged.length} chapter(s) from primary group "${primary.groupName}"`,
                { service: 'comixScraper' },
            );
        }
        return merged;
    }

    private getMissingChapterNumbers(chapters: Array<{ number: string }>, expectedMaxChapter: number): number[] {
        if (expectedMaxChapter < 1) return [];
        const present = new Set<number>();
        for (const chapter of chapters) {
            const value = Number(chapter.number);
            if (Number.isFinite(value) && value >= 1) present.add(Math.floor(value));
        }
        const missing: number[] = [];
        for (let n = 1; n <= expectedMaxChapter; n++) if (!present.has(n)) missing.push(n);
        return missing;
    }

    private hasCompleteChapterRange(chapters: Array<{ number: string }>, expectedMaxChapter: number): boolean {
        if (expectedMaxChapter < 1) return true;
        const present = new Set<number>();
        for (const chapter of chapters) {
            const value = Number(chapter.number);
            if (Number.isFinite(value) && value >= 1) present.add(Math.floor(value));
        }
        for (let n = 1; n <= expectedMaxChapter; n++) {
            if (!present.has(n)) return false;
        }
        return true;
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
        const browser = await ComixScraper.getBrowser();
        const context = await this.createBrowserContext(browser);
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
                if (!match) throw new Error(`[Comix] Could not find manga link for "${mangaName}"`);
                pageUrl = match.href;
            }

            await this.gotoComixPage(page, pageUrl);
            await page
                .waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item, div.fdrop.mpage__group', {
                    timeout: 20000,
                })
                .catch(() => {});

            const overview = await this.extractOverviewData(page);
            const expectedMaxChapter = Math.floor(Math.max(overview.latestChapter, overview.finalChapter, 0));
            logger.info(
                `[Comix] "${mangaName}": hid=${overview.hid || '?'}, groups=${overview.groups.length}, ` +
                    `expectedMaxChapter=${expectedMaxChapter}`,
                { service: 'comixScraper' },
            );

            const hasChapterRows =
                (await page.locator('section.mpage__chapters ul.mchap-list li.mchap-item').count()) > 0;
            const hasGroupFilter = (await page.locator('div.fdrop.mpage__group button.ubtn.ubtn--soft').count()) > 0;
            if (!hasChapterRows && !hasGroupFilter && !overview.groups.length && expectedMaxChapter <= 0) {
                logger.info(`[Comix] No chapters for "${mangaName}"; skipping`, { service: 'comixScraper' });
                return;
            }

            let deduped: Array<{
                url: string;
                title: string;
                number: string;
                isSpecial: boolean;
                specialType?: string;
            }> = [];

            // Prefer groups from embedded JSON; fall back to the rendered filter
            // menu when that query wasn't part of #initial-data.
            let groups = overview.groups;
            if (!groups.length) {
                groups = await this.extractGroupsFromMenu(page);
                if (groups.length) {
                    logger.info(`[Comix] Recovered ${groups.length} group(s) from filter menu`, {
                        service: 'comixScraper',
                    });
                }
            }

            // Groups whose name is meaningful (skip "Unknown group" placeholder id 0 when others exist).
            const realGroups = groups.filter(g => g.id !== 0 || groups.length === 1 || g.name !== 'Unknown group');

            if (!realGroups.length) {
                const chapters = await this.collectPaginatedChapters(page);
                deduped = this.dedupeAndSortChapters(chapters);
            } else {
                const groupSets: Array<{ groupName: string; chapters: typeof deduped }> = [];
                for (const group of realGroups) {
                    await this.gotoComixPage(page, pageUrl);
                    await page
                        .waitForSelector('section.mpage__chapters ul.mchap-list li.mchap-item', { timeout: 20000 })
                        .catch(() => {});
                    await this.selectGroupFilter(page, group.name);

                    const chapters = await this.collectPaginatedChapters(page);
                    const currentDeduped = this.dedupeAndSortChapters(chapters);
                    groupSets.push({ groupName: group.name, chapters: currentDeduped });
                    logger.info(
                        `[Comix] Group "${group.name}" -> ${currentDeduped.length} unique chapter(s)`,
                        { service: 'comixScraper' },
                    );

                    if (expectedMaxChapter <= 0 || this.hasCompleteChapterRange(currentDeduped, expectedMaxChapter)) {
                        deduped = currentDeduped;
                        logger.info(
                            `[Comix] Group "${group.name}" covers 1..${expectedMaxChapter}; selecting it`,
                            { service: 'comixScraper' },
                        );
                        break;
                    }
                }
                if (!deduped.length) {
                    deduped = this.mergeChapterSetsFromGroups(groupSets);
                    if (expectedMaxChapter > 0) {
                        const missing = this.getMissingChapterNumbers(deduped, expectedMaxChapter);
                        if (missing.length) {
                            logger.warn(
                                `[Comix] Merged set still missing chapter(s) in 1..${expectedMaxChapter}: ${missing.join(', ')}`,
                                { service: 'comixScraper' },
                            );
                        }
                    }
                }
            }

            logger.info(`[Comix] Final set: ${deduped.length} unique chapter(s)`, { service: 'comixScraper' });

            for (const chap of deduped) {
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
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await ComixScraper.releaseBrowser(browser);
        }
    }

    // ---------------------------------------------------------------------
    // Chapter download
    // ---------------------------------------------------------------------

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
            logger.info(`[Comix] [${attemptLabel}] Starting download for ${url}`, { service: 'comixScraper' });
            const browser = await ComixScraper.getBrowser();
            const context = await this.createBrowserContext(browser);
            const page = await context.newPage();

            try {
                await this.gotoComixPage(page, url);
                await page.waitForSelector(
                    'main.rpage-main, div.rpage-main, button.rpage-progress__seg, div.rpage-chap-ending__nav, .rpage-page',
                    { timeout: 30000 },
                );
                await this.dismissReaderHint(page);

                const expectedPageCount: number = await page.evaluate(() => {
                    const segs = document.querySelectorAll(
                        'div.rpage-progress.rpage-progress--left button.rpage-progress__seg',
                    ).length;
                    if (segs > 0) return segs;
                    return document.querySelectorAll('.rpage-page[data-page]').length;
                });
                logger.info(`[Comix] Chapter ${chapterNumber}: expected pages = ${expectedPageCount}`, {
                    service: 'comixScraper',
                });

                let assets = await this.collectPageAssetsFromReader(page, expectedPageCount, attemptLabel);
                if (!assets.length) throw new ScraperStageError({
                    stage: 'extract_images',
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    url,
                    message: 'Reader returned no page images (Cloudflare block or layout change?)',
                });

                if (expectedPageCount > 0 && assets.length < expectedPageCount) {
                    logger.warn(
                        `[Comix] Captured ${assets.length}/${expectedPageCount}; retrying capture`,
                        { service: 'comixScraper' },
                    );
                    const retry = await this.collectPageAssetsFromReader(
                        page,
                        expectedPageCount,
                        `${attemptLabel} retry`,
                    );
                    if (retry.length > assets.length) assets = retry;
                }

                const missingPages =
                    expectedPageCount > 0 ? this.getMissingPages(assets, expectedPageCount) : [];
                if (missingPages.length) {
                    logger.warn(
                        `[Comix] Proceeding with partial set for ${url}: missing ${missingPages.join(',')}`,
                        { service: 'comixScraper' },
                    );
                }

                const storagePrefix = await this.downloadPageAssets(
                    assets,
                    seriesId,
                    chapterNumber,
                    url,
                    expectedPageCount,
                    attemptLabel,
                );
                const pageCount = expectedPageCount > 0 ? expectedPageCount : assets.length;
                logger.info(
                    `[Comix] [${attemptLabel}] Completed (prefix=${storagePrefix}, pages=${pageCount})`,
                    { service: 'comixScraper' },
                );
                return { storagePrefix, pageCount };
            } catch (error: any) {
                lastError = error;
                const message = `${error?.message || error}`;
                const isCrash =
                    /target crashed|target page, context or browser has been closed|browser has been closed/i.test(
                        message,
                    );
                logger.error(`[Comix] [${attemptLabel}] Download failed: ${message}`, { service: 'comixScraper' });
                if (attempt < maxAttempts && isCrash) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                throw error;
            } finally {
                await page.close().catch(() => {});
                await context.close().catch(() => {});
                await ComixScraper.releaseBrowser(browser);
            }
        }

        throw lastError || new Error(`[Comix] Failed to download chapter ${chapterNumber}`);
    }

    private hasCompleteAsset(asset: ComixPageAsset): boolean {
        return !!(asset.imageUrl || asset.dataUrl);
    }

    private getMissingPages(assets: ComixPageAsset[], expectedPageCount: number): number[] {
        if (expectedPageCount <= 0) return [];
        const have = new Set<number>(assets.filter(a => this.hasCompleteAsset(a)).map(a => a.page));
        const missing: number[] = [];
        for (let i = 1; i <= expectedPageCount; i++) if (!have.has(i)) missing.push(i);
        return missing;
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
                merged.set(asset.page, {
                    ...existing,
                    dataUrl: asset.dataUrl,
                    width: asset.width,
                    height: asset.height,
                    source: asset.source,
                });
                continue;
            }
            if (!existing.imageUrl && asset.imageUrl) {
                merged.set(asset.page, { ...existing, imageUrl: asset.imageUrl, source: asset.source || existing.source });
            }
        }
        return Array.from(merged.values()).sort((a, b) => a.page - b.page);
    }

    /**
     * Read the rendered reader. Plain <img> pages give us a direct CDN URL we can
     * fetch with a referer; protected/canvas pages are captured via screenshot.
     */
    private async collectPageAssetsFromReader(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
    ): Promise<ComixPageAsset[]> {
        await this.dismissReaderHint(page);

        const pageMap = new Map<number, ComixPageAsset>();
        const maxSteps = Math.max(expectedPageCount > 0 ? expectedPageCount * 8 : 420, 160);
        const minW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        const minCanvasW = ComixScraper.MIN_CHAPTER_LONG_EDGE;
        const minCanvasH = ComixScraper.MIN_CHAPTER_SHORT_EDGE;
        let stagnantSteps = 0;
        let reachedEnd = false;

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);

        for (let step = 1; step <= maxSteps; step++) {
            const before = pageMap.size;
            const snapshot = await page.evaluate(
                ({ minW, minH, canvasMinW, canvasMinH }: { minW: number; minH: number; canvasMinW: number; canvasMinH: number }) => {
                    const nodes = Array.from(
                        document.querySelectorAll<HTMLElement>('.rpage-page[data-page], div.rpage-page'),
                    );
                    const out: Array<{
                        page: number;
                        imageUrl?: string;
                        hasCanvas: boolean;
                        canvasWidth?: number;
                        canvasHeight?: number;
                    }> = [];

                    for (const node of nodes) {
                        const rect = node.getBoundingClientRect();
                        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        const isErrored =
                            node.classList.contains('is-errored') || !!node.querySelector('button.rpage-page__retry');
                        const img = node.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                        const src = img?.currentSrc || img?.getAttribute('src') || img?.getAttribute('data-src') || '';
                        // CDN files are NN.webp (2-digit). Allow optional ?v<N> marker.
                        const srcMatch = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png)(\?[^/]*)?$/i);
                        const dataPage = Number(node.getAttribute('data-page') || '');
                        const inferred = srcMatch ? Number(srcMatch[1]) : NaN;
                        const pageNum = Number.isFinite(dataPage) && dataPage > 0 ? dataPage : inferred;
                        if (!Number.isFinite(pageNum) || pageNum < 1) continue;

                        const imgReady =
                            !!img && img.complete && img.naturalWidth >= minW && img.naturalHeight >= minH;

                        const canvas = node.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                        const cw = canvas?.width || 0;
                        const ch = canvas?.height || 0;
                        const hasCanvas = !!canvas && visible && !isErrored && cw >= canvasMinW && ch >= canvasMinH;

                        // Prefer a real <img> CDN URL when the page is NOT protected.
                        const isProtected = /[?&]v\d+/i.test(src);
                        if (!isErrored && imgReady && !isProtected && /^https?:\/\//i.test(src) && /\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)) {
                            if (!srcMatch || Number(srcMatch[1]) === pageNum) {
                                out.push({ page: pageNum, imageUrl: src, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                                continue;
                            }
                        }
                        if (hasCanvas) {
                            out.push({ page: pageNum, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                        }
                    }

                    return { out, hasEndMarker: !!document.querySelector('div.rpage-chap-ending__nav') };
                },
                { minW, minH, canvasMinW: minCanvasW, canvasMinH: minCanvasH },
            );

            for (const a of snapshot.out) {
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

            const erroredPages: number[] = await page.evaluate(() => {
                return Array.from(document.querySelectorAll<HTMLElement>('.rpage-page[data-page]'))
                    .filter(node => {
                        const rect = node.getBoundingClientRect();
                        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        return (
                            visible &&
                            (node.classList.contains('is-errored') || !!node.querySelector('button.rpage-page__retry'))
                        );
                    })
                    .map(node => Number(node.getAttribute('data-page') || ''))
                    .filter(n => Number.isFinite(n) && n > 0);
            });
            for (const pageNum of erroredPages) {
                await this.retryErroredPage(page, pageNum, contextLabel);
            }

            // Capture protected/canvas pages that have no direct URL yet.
            const canvasCandidates = snapshot.out.filter(
                (a: { page: number; hasCanvas: boolean }) =>
                    a.hasCanvas && !pageMap.get(a.page)?.dataUrl && !pageMap.get(a.page)?.imageUrl,
            );
            for (const c of canvasCandidates) {
                await this.retryErroredPage(page, c.page, contextLabel);
                const captured = await this.capturePageViaScreenshot(page, c.page, contextLabel);
                if (captured) pageMap.set(c.page, { ...(pageMap.get(c.page) || { page: c.page }), ...captured });
            }

            stagnantSteps = pageMap.size > before ? 0 : stagnantSteps + 1;
            if (snapshot.hasEndMarker && pageMap.size >= Math.min(expectedPageCount || 0, 20)) reachedEnd = true;

            if (expectedPageCount > 0 && pageMap.size >= expectedPageCount) break;
            if (reachedEnd && stagnantSteps >= 12) break;
            if (stagnantSteps >= 60) break;

            await page.evaluate(() => window.scrollBy(0, Math.max(900, Math.floor(window.innerHeight * 0.85))));
            await page.waitForTimeout(320);
        }

        const assets = Array.from(pageMap.values()).sort((a, b) => a.page - b.page);

        // Fill any still-missing pages via the progress bar (deterministic per-page seek).
        const missing = this.getMissingPages(assets, expectedPageCount);
        if (missing.length) {
            const filled = await this.collectPagesFromProgressButtons(page, expectedPageCount, contextLabel, missing);
            return this.mergePageAssets(assets, filled);
        }

        logger.info(
            `[Comix] [${contextLabel}] Reader capture: ${assets.length} page(s) ` +
                `(${assets.filter(a => a.imageUrl).length} URL, ${assets.filter(a => a.dataUrl).length} canvas), ` +
                `reachedEnd=${reachedEnd}`,
            { service: 'comixScraper' },
        );
        return assets;
    }

    private async collectPagesFromProgressButtons(
        page: any,
        expectedPageCount: number,
        contextLabel: string,
        onlyPages: number[],
    ): Promise<ComixPageAsset[]> {
        const pageMap = new Map<number, ComixPageAsset>();
        const buttons = page.locator('div.rpage-progress.rpage-progress--left button.rpage-progress__seg');
        const buttonCount = await buttons.count();
        if (!buttonCount) return [];

        const total = expectedPageCount > 0 ? expectedPageCount : buttonCount;
        const pagesToVisit = onlyPages.filter(n => n >= 1 && (total <= 0 || n <= total));

        for (const pageNum of pagesToVisit) {
            const button = buttons.nth(Math.min(pageNum - 1, buttonCount - 1));
            if (!(await button.count())) continue;
            await button.click({ force: true }).catch(() => {});
            await this.waitForReaderPageIndex(page, pageNum);
            await this.retryErroredPage(page, pageNum, contextLabel);

            let asset = await this.captureAssetForActivePage(page, pageNum);
            if (!asset) asset = await this.capturePageViaScreenshot(page, pageNum, contextLabel);
            if (asset) pageMap.set(pageNum, asset);
        }

        logger.info(
            `[Comix] [${contextLabel}] Progress fill: requested ${pagesToVisit.length}, captured ${pageMap.size}`,
            { service: 'comixScraper' },
        );
        return Array.from(pageMap.values()).sort((a, b) => a.page - b.page);
    }

    private async waitForReaderPageIndex(page: any, pageNum: number): Promise<void> {
        try {
            await page.waitForFunction(
                (n: number) => {
                    const btn = document.querySelector<HTMLButtonElement>(
                        'div.rpage-progress.rpage-progress--left button.rpage-progress__seg.is-active',
                    );
                    const m = (btn?.getAttribute('title') || '').match(/Page\s+(\d+)/i);
                    return !!m && Number(m[1]) === n;
                },
                pageNum,
                { timeout: 12000 },
            );
            await page.waitForTimeout(200);
        } catch {
            await page.waitForTimeout(400);
        }
    }

    private async isReaderPageLoaded(page: any, pageNum: number): Promise<boolean> {
        const minCanvasW = ComixScraper.MIN_CHAPTER_SHORT_EDGE;
        const minImgW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minImgH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        return page.evaluate(
            ({ n, minCanvasW, minImgW, minImgH }: { n: number; minCanvasW: number; minImgW: number; minImgH: number }) => {
                const root = document.querySelector(`.rpage-page[data-page="${n}"]`) as HTMLElement | null;
                if (!root) return false;
                if (root.classList.contains('is-errored')) return false;
                const retry = root.querySelector('button.rpage-page__retry') as HTMLElement | null;
                if (retry && retry.offsetParent !== null) return false;
                const canvas = root.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                if (canvas && canvas.width >= minCanvasW) return true;
                const img = root.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                return !!(img && img.complete && img.naturalWidth >= minImgW && img.naturalHeight >= minImgH);
            },
            { n: pageNum, minCanvasW, minImgW, minImgH },
        );
    }

    /** Click the reader's "Tap to retry" control and wait until the page is no longer errored. */
    private async retryErroredPage(page: any, pageNum: number, contextLabel: string): Promise<boolean> {
        const node = page.locator(`.rpage-page[data-page="${pageNum}"]`).first();
        if (!(await node.count())) return false;

        const maxRetries = 3;
        const minCanvasW = ComixScraper.MIN_CHAPTER_SHORT_EDGE;
        const minImgW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minImgH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const errored = await node.evaluate((el: HTMLElement) =>
                el.classList.contains('is-errored') || !!el.querySelector('button.rpage-page__retry'),
            );
            if (!errored) return this.isReaderPageLoaded(page, pageNum);

            const retryBtn = node.locator('button.rpage-page__retry').first();
            if (!(await retryBtn.count())) return this.isReaderPageLoaded(page, pageNum);

            logger.info(
                `[Comix] [${contextLabel}] Page ${pageNum} errored; retry click ${attempt}/${maxRetries}`,
                { service: 'comixScraper' },
            );
            await node.scrollIntoViewIfNeeded().catch(() => {});
            await retryBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);

            try {
                await page.waitForFunction(
                    ({ n, minCanvasW, minImgW, minImgH }: { n: number; minCanvasW: number; minImgW: number; minImgH: number }) => {
                        const root = document.querySelector(`.rpage-page[data-page="${n}"]`) as HTMLElement | null;
                        if (!root) return false;
                        if (root.classList.contains('is-errored')) return false;
                        const retry = root.querySelector('button.rpage-page__retry') as HTMLElement | null;
                        if (retry && retry.offsetParent !== null) return false;
                        const canvas = root.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                        if (canvas && canvas.width >= minCanvasW) return true;
                        const img = root.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                        return !!(img && img.complete && img.naturalWidth >= minImgW && img.naturalHeight >= minImgH);
                    },
                    { n: pageNum, minCanvasW, minImgW, minImgH },
                    { timeout: 12000 },
                );
                await page.waitForTimeout(200);
                return true;
            } catch {
                /* try another click */
            }
        }

        return this.isReaderPageLoaded(page, pageNum);
    }

    private async captureAssetForActivePage(page: any, pageNum: number): Promise<ComixPageAsset | null> {
        const minW = ComixScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minH = ComixScraper.MIN_IMAGE_NATURAL_HEIGHT;
        return page.evaluate(
            ({ n, minW, minH }: { n: number; minW: number; minH: number }) => {
                const node = document.querySelector(`.rpage-page[data-page="${n}"]`) as HTMLElement | null;
                if (!node) return null;
                if (node.classList.contains('is-errored') || node.querySelector('button.rpage-page__retry')) return null;
                const img = node.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                const src = img?.currentSrc || img?.getAttribute('src') || '';
                const isProtected = /[?&]v\d+/i.test(src);
                if (
                    img &&
                    img.complete &&
                    img.naturalWidth >= minW &&
                    img.naturalHeight >= minH &&
                    src &&
                    !isProtected &&
                    /^https?:\/\//i.test(src) &&
                    /\.(webp|jpg|jpeg|png)(\?|$)/i.test(src)
                ) {
                    const m = src.match(/\/(\d{1,4})\.(webp|jpg|jpeg|png)(\?|$)/i);
                    if (!m || Number(m[1]) === n) return { page: n, imageUrl: src };
                }
                return null;
            },
            { n: pageNum, minW, minH },
        );
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
            await this.retryErroredPage(page, pageNum, contextLabel);
            await page
                .waitForFunction(
                    ({ n, minCanvasW, minImgW, minImgH }: { n: number; minCanvasW: number; minImgW: number; minImgH: number }) => {
                        const root = document.querySelector(`.rpage-page[data-page="${n}"]`) as HTMLElement | null;
                        if (!root) return false;
                        if (root.classList.contains('is-errored')) return false;
                        const retry = root.querySelector('button.rpage-page__retry') as HTMLElement | null;
                        if (retry && retry.offsetParent !== null) return false;
                        const canvas = root.querySelector('canvas.rpage-page__img, canvas') as HTMLCanvasElement | null;
                        if (canvas && canvas.width >= minCanvasW) return true;
                        const img = root.querySelector('img.rpage-page__img, img') as HTMLImageElement | null;
                        return !!(img && img.complete && img.naturalWidth >= minImgW && img.naturalHeight >= minImgH);
                    },
                    {
                        n: pageNum,
                        minCanvasW: ComixScraper.MIN_CHAPTER_SHORT_EDGE,
                        minImgW: ComixScraper.MIN_IMAGE_NATURAL_WIDTH,
                        minImgH: ComixScraper.MIN_IMAGE_NATURAL_HEIGHT,
                    },
                    { timeout: 8000 },
                )
                .catch(() => {});
            await page.waitForTimeout(250);
            await page.evaluate((styleId: string) => {
                let style = document.getElementById(styleId) as HTMLStyleElement | null;
                if (!style) {
                    style = document.createElement('style');
                    style.id = styleId;
                    document.head.appendChild(style);
                }
                style.textContent =
                    'div.rpage-header, header.rpage-header, .rpage-topbar, .rpage-reader__header ' +
                    '{ display:none !important; visibility:hidden !important; opacity:0 !important; pointer-events:none !important; }';
            }, hideStyleId);
            await page.waitForTimeout(60);

            const canvasLoc = node.locator('canvas.rpage-page__img, canvas').first();
            const imgLoc = node.locator('img.rpage-page__img, img').first();
            let target = node;
            if (await canvasLoc.count()) target = canvasLoc;
            else if (await imgLoc.count()) target = imgLoc;

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
                    `[Comix] [${contextLabel}] Rejecting screenshot page ${pageNum} (${width}x${height})`,
                    { service: 'comixScraper' },
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
            logger.debug(`[Comix] [${contextLabel}] Screenshot capture failed page ${pageNum}: ${error}`, {
                service: 'comixScraper',
            });
            return null;
        } finally {
            await page
                .evaluate((styleId: string) => document.getElementById(styleId)?.remove(), hideStyleId)
                .catch(() => {});
        }
    }

    private async dismissReaderHint(page: any): Promise<void> {
        const hint = page.locator('div.rpage-hint[role="dialog"]');
        if (!(await hint.count())) return;
        try {
            if (!(await hint.isVisible().catch(() => false))) return;
            const dontShowAgain = hint.locator('label.rpage-hint__check input[type="checkbox"]');
            if (await dontShowAgain.count()) await dontShowAgain.check({ force: true }).catch(() => {});
            const gotIt = hint.locator('button.ubtn.ubtn--primary', { hasText: 'Got it' });
            if (await gotIt.count()) await gotIt.click({ force: true });
            else {
                const backdrop = hint.locator('.rpage-hint__backdrop');
                if (await backdrop.count()) await backdrop.click({ force: true }).catch(() => {});
            }
            await hint.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(150);
        } catch {
            /* non-fatal */
        }
    }

    private async applyReaderDefaults(context: any): Promise<void> {
        const defaults = {
            readingDirection: 'ttb',
            pageLayout: 'single',
            preload: 'all',
            progressBar: 'left',
            maxImgWidth: 0,
            stretch: false,
        };
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
                    state: { ...state, ...existingState, readingDirection: 'ttb', preload: 'all', maxImgWidth: 0, stretch: false },
                    version: typeof existing?.version === 'number' ? existing.version : 0,
                };
                window.localStorage.setItem('reader.default', JSON.stringify(nextValue));
            } catch {
                /* ignore */
            }
        }, defaults);
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    private async downloadPageAssets(
        assets: ComixPageAsset[],
        seriesId: number,
        chapterNumber: string,
        referer: string,
        expectedPageCount: number,
        contextLabel = 'download',
    ): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        const byPage = new Map<number, ComixPageAsset>(assets.map(a => [a.page, a]));
        const totalPages = expectedPageCount > 0 ? expectedPageCount : assets.length;

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
                        const out = await sharp(raw, { failOn: 'none' }).webp({ lossless: true, effort: 4 }).toBuffer();
                        await objectStorageService.putObject(key, out);
                        return;
                    }
                    if (asset.imageUrl) {
                        const response = await ComixScraper.axiosInstance.get(asset.imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 30000,
                            headers: {
                                Referer: `${SITE_BASE}/`,
                                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                                'User-Agent': appConfig.scraper.comix.userAgent,
                            },
                        });
                        const buffer = Buffer.from(response.data as ArrayBuffer);
                        if (buffer.length < ComixScraper.MIN_IMAGE_DOWNLOAD_BYTES) {
                            throw new Error(
                                `Payload too small page ${pageNum}: ${ComixScraper.describeDownloadBuffer(buffer)}`,
                            );
                        }
                        const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
                        if (!ComixScraper.isValidChapterImageDimensions(metadata.width || 0, metadata.height || 0)) {
                            throw new Error(
                                `Dimensions too small page ${pageNum}: ${metadata.width}x${metadata.height}`,
                            );
                        }
                        // CDN already serves webp; write through without a no-op transcode.
                        await objectStorageService.putObject(key, buffer);
                        return;
                    }
                    throw new Error(`No imageUrl or dataUrl for page ${pageNum}`);
                } catch (err: any) {
                    lastError = err;
                    logger.warn(
                        `[Comix] [${contextLabel}] Page ${pageNum} attempt ${attempt}/${maxRetries}: ${err?.message || err}`,
                        { service: 'comixScraper' },
                    );
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt - 1)));
                    }
                }
            }
            // Exhausted retries → fail the chapter so the queue retries it (and it
            // stays in the failed set for manual retry) instead of silently placeholdering.
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
            logger.error(stageError.message, { service: 'comixScraper', ...stageError.toLogDetail() });
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