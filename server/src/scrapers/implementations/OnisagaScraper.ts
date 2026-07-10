/**
 * Onisaga Scraper Implementation
 *
 * Scraper for onisaga.com — a Laravel + Livewire/Alpine + FluxUI site behind
 * Cloudflare's "Just a moment…" JS challenge. Everything runs through Playwright
 * (real Chromium) because there is no usable plain-HTTP JSON API and the reader
 * is fully client-rendered with lazy-loaded images.
 *
 * Composition of two existing patterns:
 *  - Cloudflare clearance via Playwright wait-loop (see KaganeScraper).
 *  - Lazy-load reader scroll → collect <img> URLs → shared downloader (see ToonilyScraper).
 *
 * Site structure:
 *  - Search results:  https://onisaga.com/search/{query}   (server-rendered fallback page)
 *  - Series page:     https://onisaga.com/manga/{slug}      ("Load more chapters" Livewire button)
 *  - Chapter reader:  https://onisaga.com/read/{slug}/{chapterId}  (long-strip via localStorage)
 */

import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { downloadAndStoreChapter } from '../lib/chapterImageDownloader';
import { buildAxios } from '@/scrapers/lib/scraperEgress';
import { objectStorageService } from '@/services/objectStorageService';
import { IChapterScraper, ScrapedChapter, DownloadedChapter, MangaSearchResult, SearchOptions, ScraperMetadata } from '../interfaces/IChapterScraper';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { ScraperStageError } from '../lib/scraperError';
import { requestFlareSolverr, resolveFlareSolverrUrl, type FlareSolverrResult } from '@/lib/flareSolverrClient';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';

const SITE_BASE = appConfig.scraper.onisaga.baseUrl;
const CF_TITLE = 'Just a moment';

/** Reader long-strip settings seeded into localStorage before the reader loads. */
const READER_SETTINGS = JSON.stringify({ showProgressBar: true, showPageCounter: true, pageMode: 'long-strip', imageFit: 'both', zoom: 100, inkMode: false, brightness: 100, readingDirection: 'ltr', pageGap: 'none', autoScroll: false, autoScrollSpeed: 3, warmth: 0, preloadAhead: 12 });

/** Onisaga chapter rows embed metadata like "1 Chapter 1 59p · 2 years ago" — strip to a display title. */
function cleanChapterListTitle(raw: string): string {
    const t = raw.replace(/\s+/g, ' ').trim();
    const labeled = t.match(/^(?:\d+(?:\.\d+)?\s+)?(.+?)\s+\d+p\s*·/i);
    if (labeled?.[1]) return labeled[1].trim();
    return t.replace(/^\d+(?:\.\d+)?\s+/, '').replace(/\s+\d+p\s*·.*$/i, '').trim() || t;
}

interface OnisagaReaderSession {
    chapterId: string;
    readerToken: string;
    totalPages: number;
}

interface ReaderHarvestState {
    urlsByPage: Map<number, string>;
    rateLimitHits: number;
}

interface CfSession { cookie: string; userAgent: string; expiresAt: number; }

const ONISAGA_READER_COOLDOWN_MS = parseInt(process.env.ONISAGA_READER_COOLDOWN_MS || '90000', 10);
const ONISAGA_RATE_LIMIT_BACKOFF_MS = parseInt(process.env.ONISAGA_RATE_LIMIT_BACKOFF_MS || '900000', 10);
// Onisaga's image CDN throttles each connection (~tens of KB/s), so a chapter's wall time is
// dominated by download, not transcode/upload. These are static CDN URLs (not the rate-limited
// reader API), so widening the parallel-download pool multiplies throughput. Tune via env.
const ONISAGA_IMAGE_BATCH_SIZE = parseInt(process.env.ONISAGA_IMAGE_BATCH_SIZE || '24', 10);

/** Calculate title similarity score (0-100). */
function calculateTitleSimilarity(title1: string, title2: string): number {
    if (title1.toLowerCase() === title2.toLowerCase()) {
        return 100;
    }

    const normalize = (s: string) => s
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

/** Normalize a title so minor punctuation/connector differences don't affect matching. */
function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value
        .replace(/[-_.]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export class OnisagaScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'onisaga',
        name: 'Onisaga',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.onisaga.priority,
        enabled: appConfig.scraper.onisaga.enabled,
        searchTimeoutMs: 22_000, // interactive admin search must fit the aggregate deadline; a hung CF solve is bounded here so the browser is released promptly
    };

    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 3;
    private static cfSessionCache: CfSession | null = null;

    // Egress (agents + proxy + ban detection) centralized in scraperEgress; flag off
    // → identical to a plain keep-alive axios instance.
    private static readonly axiosInstance = buildAxios({
        scraperId: 'onisaga',
        timeout: appConfig.scraper.onisaga.timeout,
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return true;
    }

    private static async getBrowser() {
        if (OnisagaScraper.browserPool.length > 0) {
            return OnisagaScraper.browserPool.pop();
        }
        // Headful (under Xvfb, so DISPLAY is set) to pass Cloudflare — headless Chromium is
        // fingerprint-blocked by onisaga. Falls back to headless where no display exists (e.g. the
        // API process, which never actually launches this browser — FlareSolverr handles it there).
        const headless = !process.env.DISPLAY;
        logger.debug(`[Onisaga] Launching new browser for pool (headless=${headless})`, { service: 'onisagaScraper' });
        // cf_clearance from FlareSolverr is bound to the solver's egress IP — never route Playwright through the scraper VPN/proxy.
        return chromium.launch({
            headless,
            args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            if (!browser.isConnected()) {
                await browser.close().catch(() => {});
                return;
            }
            if (OnisagaScraper.browserPool.length < OnisagaScraper.MAX_BROWSERS) {
                OnisagaScraper.browserPool.push(browser);
            } else {
                await browser.close().catch(() => {});
            }
        } catch {
            await browser.close().catch(() => {});
        }
    }

    /** New page that aborts image/font/media — for search + chapter-list pages (never the reader). Stylesheets are kept: blocking them prevents Cloudflare's interstitial from clearing. */
    private static async newLeanPage(context: any): Promise<any> {
        const page = await context.newPage();
        await page.route('**/*', (route: any) => {
            const type = route.request().resourceType();
            if (type === 'image' || type === 'font' || type === 'media') route.abort().catch(() => {});
            else route.continue().catch(() => {});
        });
        return page;
    }

    /**
     * Resolve a cf_clearance cookie to seed a fresh context with, so Cloudflare is
     * (ideally) pre-cleared. Sources: cached session → env ONISAGA_CF_CLEARANCE →
     * FlareSolverr (when configured). Returns null when none is available, in which
     * case we rely on Playwright solving the challenge on navigation.
     */
    private async getSeedCfSession(): Promise<CfSession | null> {
        const cached = OnisagaScraper.cfSessionCache;
        if (cached && Date.now() < cached.expiresAt - 60_000) {
            return cached;
        }

        const envClearance = process.env.ONISAGA_CF_CLEARANCE?.trim();
        if (envClearance) {
            const session: CfSession = {
                cookie: envClearance,
                userAgent: process.env.ONISAGA_CF_USER_AGENT?.trim() || appConfig.scraper.onisaga.userAgent,
                expiresAt: Date.now() + 30 * 60 * 1000,
            };
            OnisagaScraper.cfSessionCache = session;
            return session;
        }

        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.onisaga.flareSolverrUrl);
        if (flareSolverrUrl) {
            try {
                const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: `${SITE_BASE}/`, maxTimeout: 120000 });
                const clearance = result.solution?.cookies?.find(c => c.name === 'cf_clearance');
                if (clearance?.value) {
                    const expirySeconds = clearance.expiry && clearance.expiry > 0 ? clearance.expiry : Math.floor(Date.now() / 1000) + 1800;
                    const session: CfSession = {
                        cookie: clearance.value,
                        userAgent: result.solution?.userAgent || appConfig.scraper.onisaga.userAgent,
                        expiresAt: expirySeconds * 1000,
                    };
                    OnisagaScraper.cfSessionCache = session;
                    return session;
                }
            } catch (error) {
                logger.warn(`[Onisaga] FlareSolverr clearance failed: ${error}`, { service: 'onisagaScraper' });
            }
        }

        return null;
    }

    /** Create a browser context with UA/viewport, anti-automation init script, and (optionally) a seeded cf_clearance cookie. */
    private async createContext(browser: any): Promise<{ context: any; userAgent: string }> {
        const seed = await this.getSeedCfSession();
        const userAgent = seed?.userAgent || appConfig.scraper.onisaga.userAgent;
        const context = await browser.newContext({
            userAgent,
            viewport: { width: 1366, height: 900 },
            locale: 'en-US',
        });
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        if (seed?.cookie) {
            await context.addCookies([{ name: 'cf_clearance', value: seed.cookie, domain: '.onisaga.com', path: '/' }]);
        }
        return { context, userAgent };
    }

    private invalidateCfSession(): void {
        OnisagaScraper.cfSessionCache = null;
    }

    /** Wait for Cloudflare's "Just a moment…" interstitial to clear; throw if it never does. */
    private async waitForCloudflare(page: any, url: string, stage: 'search' | 'scan' | 'navigate' | 'extract_images'): Promise<void> {
        // Poll finely (500ms) so we detect the clear promptly; overall cap stays ~90s.
        for (let i = 0; i < 180; i++) {
            const title = await page.title().catch(() => '');
            if (!title.includes(CF_TITLE)) return;
            await page.waitForTimeout(500);
        }
        throw new ScraperStageError({
            stage,
            scraperId: this.metadata.id,
            scraperName: this.metadata.name,
            url,
            message: 'Cloudflare challenge did not clear. Set ONISAGA_CF_CLEARANCE (+ ONISAGA_CF_USER_AGENT) or ONISAGA_FLARESOLVERR_URL.',
        });
    }

    /** Harvest a fresh cf_clearance cookie from a cleared context and cache it for reuse / image downloads. */
    private async harvestCfSession(context: any, userAgent: string): Promise<void> {
        try {
            const cookies = await context.cookies();
            const clearance = cookies.find((c: { name: string; value: string; expires?: number }) => c.name === 'cf_clearance');
            if (clearance?.value) {
                OnisagaScraper.cfSessionCache = {
                    cookie: clearance.value,
                    userAgent,
                    expiresAt: (clearance.expires && clearance.expires > 0 ? clearance.expires : Math.floor(Date.now() / 1000) + 1800) * 1000,
                };
            }
        } catch {
            // best-effort
        }
    }

    private buildSearchVariants(mangaName: string, options?: SearchOptions): string[] {
        const baseVariants = [mangaName, options?.romanizedTitle, options?.nativeTitle, ...(options?.secondaryTitles || [])].filter((v): v is string => !!v && v.length > 0);
        const normalizedExtras = baseVariants.map(v => normalizeForSearch(v)).filter(v => v && !baseVariants.includes(v));
        return [...baseVariants, ...normalizedExtras];
    }

    /** Navigate the server-rendered /search/{query} page and return scored manga results. */
    private async searchVariant(page: any, query: string): Promise<Array<{ href: string; title: string }>> {
        const searchUrl = `${SITE_BASE}/search/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.waitForCloudflare(page, searchUrl, 'search');
        await page.waitForTimeout(500);

        return page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/manga/"]'));
            const seen = new Set<string>();
            const out: Array<{ href: string; title: string }> = [];
            for (const a of anchors) {
                const href = a.href;
                if (!href || !/\/manga\//.test(href) || seen.has(href)) continue;
                const heading = a.querySelector('[data-flux-heading]')?.textContent?.trim();
                const title = heading || a.getAttribute('title')?.trim() || a.textContent?.trim() || '';
                if (!title) continue;
                seen.add(href);
                out.push({ href, title });
            }
            return out;
        });
    }

    /** Parse the server-rendered /search HTML with jsdom, mirroring searchVariant's in-browser extraction. */
    private parseSearchHtml(html: string): Array<{ href: string; title: string }> {
        const doc = new JSDOM(html, { url: SITE_BASE }).window.document;
        const anchors = Array.from(doc.querySelectorAll('a[href*="/manga/"]'));
        const seen = new Set<string>();
        const out: Array<{ href: string; title: string }> = [];
        for (const a of anchors) {
            const href = (a as HTMLAnchorElement).href;
            if (!href || !/\/manga\//.test(href) || seen.has(href)) continue;
            const heading = a.querySelector('[data-flux-heading]')?.textContent?.trim();
            const title = heading || a.getAttribute('title')?.trim() || a.textContent?.replace(/\s+/g, ' ').trim() || '';
            if (!title) continue;
            seen.add(href);
            out.push({ href, title });
        }
        return out;
    }

    /** Fast path: fetch /search over plain HTTP with a cached cf_clearance. Returns null when no clearance is cached or Cloudflare re-challenges (caller falls back to the browser). */
    private async searchViaHttp(query: string): Promise<Array<{ href: string; title: string }> | null> {
        const seed = OnisagaScraper.cfSessionCache;
        if (!seed?.cookie || Date.now() >= seed.expiresAt) return null;

        const searchUrl = `${SITE_BASE}/search/${encodeURIComponent(query)}`;
        try {
            const res = await OnisagaScraper.axiosInstance.get(searchUrl, {
                responseType: 'text',
                headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': seed.userAgent, 'Cookie': `cf_clearance=${seed.cookie}` },
            });
            const html = typeof res.data === 'string' ? res.data : String(res.data);
            if (html.includes(CF_TITLE) || html.includes('cf-browser-verification')) return null; // still challenged → browser fallback
            const results = this.parseSearchHtml(html);
            logger.debug(`[Onisaga] HTTP search hit for "${query}" (${results.length} result(s))`, { service: 'onisagaScraper' });
            return results;
        } catch (error: any) {
            logger.debug(`[Onisaga] HTTP search fell back to browser (${error?.response?.status || error?.message})`, { service: 'onisagaScraper' });
            return null;
        }
    }

    /** Reliable path: FlareSolverr solves Cloudflare and returns the /search page HTML directly (solution.response), which we parse with jsdom. No cookie-replay (Cloudflare binds cf_clearance to the solver's IP/fingerprint, so axios replay gets re-challenged). Returns null when no FlareSolverr is configured or the fetch fails/returns a challenge. */
    private async searchViaFlareSolverr(query: string): Promise<Array<{ href: string; title: string }> | null> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.onisaga.flareSolverrUrl);
        if (!flareSolverrUrl) return null;
        const searchUrl = `${SITE_BASE}/search/${encodeURIComponent(query)}`;
        try {
            const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: searchUrl, maxTimeout: 30000 });
            this.cacheClearanceFromFlareSolverr(result); // best-effort, for the axios image-download path
            const html = result.solution?.response;
            if (!html || html.includes(CF_TITLE)) return null;
            const results = this.parseSearchHtml(html);
            logger.debug(`[Onisaga] FlareSolverr search "${query}" -> ${results.length} result(s)`, { service: 'onisagaScraper' });
            return results;
        } catch (error: any) {
            logger.warn(`[Onisaga] FlareSolverr search failed: ${error?.message || error}`, { service: 'onisagaScraper' });
            return null;
        }
    }

    /** Cache the cf_clearance cookie from a FlareSolverr solve (best-effort; used only by the axios image-download path in downloadChapter). */
    private cacheClearanceFromFlareSolverr(result: FlareSolverrResult): void {
        const clearance = result.solution?.cookies?.find(c => c.name === 'cf_clearance');
        if (!clearance?.value) return;
        const expirySeconds = clearance.expiry && clearance.expiry > 0 ? clearance.expiry : Math.floor(Date.now() / 1000) + 1800;
        OnisagaScraper.cfSessionCache = { cookie: clearance.value, userAgent: result.solution?.userAgent || appConfig.scraper.onisaga.userAgent, expiresAt: expirySeconds * 1000 };
    }

    private extractReaderSessionFromHtml(html: string, url: string): OnisagaReaderSession {
        const chapterId = new URL(url, SITE_BASE).pathname.split('/').filter(Boolean).pop() || '';
        const tokenMatch = html.match(/readerToken:\s*"([^"]+)"/);
        const pagesMatch = html.match(/totalPages:\s*(\d+)/);
        const readerToken = tokenMatch?.[1] || '';
        const totalPages = pagesMatch ? parseInt(pagesMatch[1], 10) : 0;
        if (!chapterId || !readerToken || totalPages <= 0) {
            throw new ScraperStageError({
                stage: 'extract_images',
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url,
                message: 'Could not read Onisaga reader token or page count from chapter HTML',
            });
        }
        return { chapterId, readerToken, totalPages };
    }

    private static apiFetchTail: Promise<void> = Promise.resolve();
    private static downloadTail: Promise<void> = Promise.resolve();
    private static rateLimitedUntil = 0;

    private assertNotRateLimited(url: string): void {
        if (Date.now() < OnisagaScraper.rateLimitedUntil) {
            const retryAt = new Date(OnisagaScraper.rateLimitedUntil).toISOString();
            throw new ScraperStageError({
                stage: 'extract_images',
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url,
                message: `Reader API rate limited; retry after ${retryAt}`,
                httpStatus: 429,
                code: 'RATE_LIMITED',
            });
        }
    }

    private markRateLimited(): void {
        const until = Date.now() + ONISAGA_RATE_LIMIT_BACKOFF_MS;
        if (until <= OnisagaScraper.rateLimitedUntil) return;
        OnisagaScraper.rateLimitedUntil = until;
        logger.warn(`[Onisaga] Reader API rate limited — pausing downloads until ${new Date(OnisagaScraper.rateLimitedUntil).toISOString()}`, { service: 'onisagaScraper' });
    }

    /** One Onisaga chapter download at a time — the reader API rate-limits parallel chapter fetches. */
    private async withDownloadLock<T>(fn: () => Promise<T>): Promise<T> {
        const previous = OnisagaScraper.downloadTail;
        let release!: () => void;
        OnisagaScraper.downloadTail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
            return await fn();
        } finally {
            if (ONISAGA_READER_COOLDOWN_MS > 0) await new Promise<void>(resolve => setTimeout(resolve, ONISAGA_READER_COOLDOWN_MS));
            release();
        }
    }

    /** Serialize explicit reader page API calls (fallback path). */
    private async withReaderApiLock<T>(fn: () => Promise<T>): Promise<T> {
        const previous = OnisagaScraper.apiFetchTail;
        let release!: () => void;
        OnisagaScraper.apiFetchTail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    private attachReaderResponseCollector(page: any, chapterId: string, harvest: ReaderHarvestState): void {
        page.on('response', (response: any) => {
            const match = response.url().match(/\/api\/chapter\/(\d+)\/page\/(\d+)/);
            if (!match || match[1] !== chapterId) return;
            const status = response.status();
            if (status === 429) {
                harvest.rateLimitHits++;
                this.markRateLimited();
                return;
            }
            if (status !== 200) return;
            void (async () => {
                try {
                    const data = await response.json();
                    const imageUrl = data?.url || data?.image_url;
                    if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                        harvest.urlsByPage.set(parseInt(match[2], 10), imageUrl);
                    }
                } catch {
                    // ignore parse errors
                }
            })();
        });
    }

    private orderedPageUrls(urlsByPage: Map<number, string>, totalPages: number): string[] | null {
        // Onisaga's reader is 0-indexed: pages run 0..totalPages-1 (data-page-index="0".."N-1").
        const urls: string[] = [];
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const imageUrl = urlsByPage.get(pageNum);
            if (!imageUrl) return null;
            urls.push(imageUrl);
        }
        return urls;
    }

    /** Scroll the long-strip reader and harvest image URLs from the site's own lazy-load API responses. */
    private async collectChapterImagesViaScroll(page: any, session: OnisagaReaderSession, harvest: ReaderHarvestState, chapterUrl: string): Promise<string[]> {
        await page.evaluate((settings: string) => {
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('reader_mode_')) localStorage.setItem(key, 'long-strip');
            }
            localStorage.setItem('reader_settings', settings);
        }, READER_SETTINGS);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('[x-ref="longStripContainer"]', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2500);

        if (harvest.rateLimitHits > 0 && harvest.urlsByPage.size === 0) {
            throw new ScraperStageError({
                stage: 'extract_images',
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url: chapterUrl,
                message: `Reader API rate limited during page load (${harvest.rateLimitHits} response(s) returned 429)`,
                httpStatus: 429,
                code: 'RATE_LIMITED',
            });
        }

        let stable = 0;
        let lastSize = harvest.urlsByPage.size;
        for (let i = 0; i < session.totalPages * 4 && harvest.urlsByPage.size < session.totalPages; i++) {
            await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.75)));
            await page.waitForTimeout(900);
            if (harvest.urlsByPage.size === lastSize) stable++;
            else { stable = 0; lastSize = harvest.urlsByPage.size; }
            if (stable >= 5) break;
        }
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);

        const complete = this.orderedPageUrls(harvest.urlsByPage, session.totalPages);
        if (complete) return complete;

        if (harvest.rateLimitHits > 0) {
            throw new ScraperStageError({
                stage: 'extract_images',
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url: chapterUrl,
                message: `Reader API rate limited — scroll harvested ${harvest.urlsByPage.size}/${session.totalPages} page URL(s)`,
                httpStatus: 429,
                code: 'RATE_LIMITED',
            });
        }

        const missing: number[] = [];
        for (let pageNum = 0; pageNum < session.totalPages; pageNum++) {
            if (!harvest.urlsByPage.has(pageNum)) missing.push(pageNum);
        }
        logger.info(`[Onisaga] Scroll harvested ${harvest.urlsByPage.size}/${session.totalPages} page URL(s); fetching ${missing.length} via API`, { service: 'onisagaScraper' });
        await this.fetchMissingChapterPages(page, session, missing, harvest.urlsByPage);

        const urls = this.orderedPageUrls(harvest.urlsByPage, session.totalPages);
        if (!urls) {
            throw new ScraperStageError({
                stage: 'extract_images',
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url: chapterUrl,
                message: `Reader returned ${harvest.urlsByPage.size}/${session.totalPages} page URL(s) after scroll + API fallback`,
            });
        }
        return urls;
    }

    private async fetchMissingChapterPages(page: any, session: OnisagaReaderSession, pageNums: number[], urlsByPage: Map<number, string>): Promise<void> {
        if (!pageNums.length) return;
        await this.withReaderApiLock(() => page.evaluate((payload: { chapterId: string; readerToken: string; pageNums: number[] }) => {
            const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
            const backoff = (attempt: number) => delay(Math.min(120000, 10000 * Math.pow(2, attempt)));
            const fetchOne = (pageNum: number): Promise<{ pageNum: number; url: string }> => {
                const tryFetch = (attempt: number): Promise<{ pageNum: number; url: string }> => fetch(`/api/chapter/${payload.chapterId}/page/${pageNum}`, {
                    headers: { Accept: 'application/json', 'X-Reader-Token': payload.readerToken },
                }).then(res => {
                    if (res.status === 429) {
                        if (attempt < 3) return backoff(attempt).then(() => tryFetch(attempt + 1));
                        return res.text().then(body => { throw new Error(`Reader API page ${pageNum} rate limited (429): ${body.slice(0, 200)}`); });
                    }
                    if (!res.ok) {
                        return res.text().then(body => { throw new Error(`Reader API page ${pageNum} failed (${res.status}): ${body.slice(0, 200)}`); });
                    }
                    return res.json().then((data: { url?: string; image_url?: string }) => {
                        const imageUrl = data.url || data.image_url;
                        if (!imageUrl?.startsWith('http')) throw new Error(`Reader API page ${pageNum} returned no image URL`);
                        return { pageNum, url: imageUrl };
                    });
                });
                return tryFetch(0);
            };
            let chain: Promise<Array<{ pageNum: number; url: string }>> = Promise.resolve([]);
            for (const pageNum of payload.pageNums) {
                chain = chain.then(results => fetchOne(pageNum).then(entry => {
                    results.push(entry);
                    return delay(3000).then(() => results);
                }));
            }
            return chain;
        }, { chapterId: session.chapterId, readerToken: session.readerToken, pageNums }).then((entries: Array<{ pageNum: number; url: string }>) => {
            for (const entry of entries) urlsByPage.set(entry.pageNum, entry.url);
        }));
    }

    /** Parse chapter rows from a server-rendered manga page (FlareSolverr HTML or Playwright DOM). */
    private parseChapterListHtml(html: string): Array<{ url: string; title: string }> {
        const doc = new JSDOM(html, { url: SITE_BASE }).window.document;
        const items = Array.from(doc.querySelectorAll('a')).filter(a => (a.getAttribute('wire:key') || '').startsWith('ch-'));
        return items
            .map(a => {
                const raw = a.textContent?.replace(/\s+/g, ' ').trim() || '';
                return { url: (a as HTMLAnchorElement).href, title: cleanChapterListTitle(raw) };
            })
            .filter(c => c.url && c.title)
            .reverse(); // newest-first on the page → oldest-first
    }

    private chapterListNeedsLoadMore(html: string): boolean {
        return /wire:click="loadMoreChapters"/.test(html) || /wire\\:click="loadMoreChapters"/.test(html);
    }

    /** FlareSolverr fetch of the manga page — avoids headless Playwright, which cannot pass Onisaga's CF check on its own. */
    private async scanChaptersViaFlareSolverr(pageUrl: string): Promise<{ rows: Array<{ url: string; title: string }>; needsLoadMore: boolean } | null> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.onisaga.flareSolverrUrl);
        if (!flareSolverrUrl) return null;
        try {
            const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: pageUrl, maxTimeout: 120000 });
            this.cacheClearanceFromFlareSolverr(result);
            const html = result.solution?.response;
            if (!html || html.includes(CF_TITLE)) return null;
            const rows = this.parseChapterListHtml(html);
            logger.debug(`[Onisaga] FlareSolverr chapter scan -> ${rows.length} row(s), loadMore=${this.chapterListNeedsLoadMore(html)}`, { service: 'onisagaScraper' });
            return { rows, needsLoadMore: this.chapterListNeedsLoadMore(html) };
        } catch (error: any) {
            logger.warn(`[Onisaga] FlareSolverr chapter scan failed: ${error?.message || error}`, { service: 'onisagaScraper' });
            return null;
        }
    }

    /** Playwright scan with FlareSolverr-seeded cf_clearance; clicks "Load more chapters" when present. */
    private async scanChaptersViaPlaywright(pageUrl: string): Promise<Array<{ url: string; title: string }>> {
        const browser = await OnisagaScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser);
        const page = await context.newPage();

        try {
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
            try {
                await this.waitForCloudflare(page, pageUrl, 'scan');
            } catch (error) {
                this.invalidateCfSession();
                throw error;
            }
            await this.harvestCfSession(context, userAgent);

            // After CF clears, block heavy assets while clicking through Livewire pagination.
            await page.route('**/*', (route: any) => {
                const type = route.request().resourceType();
                if (type === 'image' || type === 'font' || type === 'media') route.abort().catch(() => {});
                else route.continue().catch(() => {});
            });

            let lastCount = -1;
            for (let i = 0; i < 100; i++) {
                const button = await page.$('button[wire\\:click="loadMoreChapters"]');
                if (!button) break;
                const count = await page.evaluate(() => document.querySelectorAll('a[wire\\:key^="ch-"]').length);
                if (count === lastCount) break;
                lastCount = count;
                await button.click().catch(() => {});
                await page.waitForTimeout(800);
            }

            return page.evaluate(() => {
                const items = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[wire\\:key^="ch-"]'));
                return items
                    .map(a => ({ url: a.href, title: a.textContent?.replace(/\s+/g, ' ').trim() || '' }))
                    .filter(c => c.url && c.title)
                    .reverse();
            }).then((rows: Array<{ url: string; title: string }>) => rows.map(r => ({ url: r.url, title: cleanChapterListTitle(r.title) })));
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await OnisagaScraper.releaseBrowser(browser);
        }
    }

    /** Score/filter/sort/slice raw hits into ranked results. */
    private scoreAndRank(results: Array<{ href: string; title: string }>, query: string, minScore: number, limit: number): MangaSearchResult[] {
        return results
            .map(r => ({ href: r.href, title: r.title, score: calculateTitleSimilarity(r.title, query) }))
            .filter(r => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async findBestMatch(mangaName: string, options?: SearchOptions): Promise<MangaSearchResult | undefined> {
        const variants = this.buildSearchVariants(mangaName, options);
        logger.info(`[Onisaga] Trying ${variants.length} search variant(s)`, { service: 'onisagaScraper' });

        for (const variant of variants) {
            try {
                const fsResults = await this.searchViaFlareSolverr(variant);
                if (fsResults && fsResults.length > 0) {
                    const scored = fsResults
                        .map(r => ({ href: r.href, title: r.title, score: calculateTitleSimilarity(r.title, variant) }))
                        .filter(r => r.score >= 70)
                        .sort((a, b) => b.score - a.score);
                    if (scored.length > 0) {
                        const best = scored[0];
                        logger.info(`[Onisaga] Best match (FlareSolverr): "${best.title}" score=${best.score} → ${best.href}`, { service: 'onisagaScraper' });
                        return best;
                    }
                }
            } catch (error: any) {
                logger.debug(`[Onisaga] FlareSolverr search failed for variant "${variant}": ${error?.message || error}`, { service: 'onisagaScraper' });
            }
        }

        const browser = await OnisagaScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser);
        const page = await context.newPage();

        try {
            for (const variant of variants) {
                try {
                    const results = await this.searchVariant(page, variant);
                    await this.harvestCfSession(context, userAgent);
                    if (results.length === 0) continue;

                    const scored = results
                        .map(r => ({ href: r.href, title: r.title, score: calculateTitleSimilarity(r.title, variant) }))
                        .filter(r => r.score >= 70)
                        .sort((a, b) => b.score - a.score);

                    if (scored.length > 0) {
                        const best = scored[0];
                        logger.info(`[Onisaga] Best match: "${best.title}" score=${best.score} → ${best.href}`, { service: 'onisagaScraper' });
                        return best;
                    }
                } catch (error: any) {
                    logger.debug(`[Onisaga] Search failed for variant "${variant}": ${error?.message || error}`, { service: 'onisagaScraper' });
                }
            }

            logger.warn(`[Onisaga] Could not find manga for "${mangaName}"`, { service: 'onisagaScraper' });
            return undefined;
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await OnisagaScraper.releaseBrowser(browser);
        }
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        // Reliable path: FlareSolverr solves Cloudflare and returns the /search HTML directly.
        // Fast when its session is kept warm by the keep-alive; well under the proxy window.
        const fsResults = await this.searchViaFlareSolverr(q);
        if (fsResults) return this.scoreAndRank(fsResults, q, 50, limit);

        // No FlareSolverr (or it failed): try a cached cf_clearance over plain HTTP.
        const httpResults = await this.searchViaHttp(q);
        if (httpResults) return this.scoreAndRank(httpResults, q, 50, limit);

        // Nothing usable yet — warm in the background and skip so the endpoint stays fast.
        this.warmClearanceInBackground();
        logger.info(`[Onisaga] No usable Cloudflare bypass yet — warming in background; skipping interactive search for "${q}"`, { service: 'onisagaScraper' });
        return [];
    }

    private static warming: Promise<void> | null = null;
    private static keepAliveTimer: NodeJS.Timeout | null = null;
    private static readonly CLEARANCE_REFRESH_MS = 20 * 60 * 1000; // refresh well before the ~30min cf_clearance lifetime

    /** Warm now and re-warm periodically so FlareSolverr keeps a cleared onisaga.com session ready and interactive searches stay fast. Idempotent; the timer is unref'd so it never keeps the process alive. */
    startClearanceKeepAlive(): void {
        if (OnisagaScraper.keepAliveTimer) return;
        this.warmClearanceInBackground();
        OnisagaScraper.keepAliveTimer = setInterval(() => this.warmClearanceInBackground(), OnisagaScraper.CLEARANCE_REFRESH_MS);
        OnisagaScraper.keepAliveTimer.unref?.();
        logger.info(`[Onisaga] Cloudflare keep-alive started (refresh every ${Math.round(OnisagaScraper.CLEARANCE_REFRESH_MS / 60000)}m)`, { service: 'onisagaScraper' });
    }

    /** Keep a Cloudflare bypass ready in the background (deduped, non-blocking). */
    private warmClearanceInBackground(): void {
        if (OnisagaScraper.warming) return;
        OnisagaScraper.warming = this.warmClearance()
            .catch(err => { logger.debug(`[Onisaga] Background warm failed: ${err?.message || err}`, { service: 'onisagaScraper' }); })
            .finally(() => { OnisagaScraper.warming = null; });
    }

    /** Ping FlareSolverr to keep its cleared onisaga.com browser session warm (so interactive FlareSolverr searches are fast); fall back to a real browser solve when no FlareSolverr is configured. */
    private async warmClearance(): Promise<void> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.onisaga.flareSolverrUrl);
        if (flareSolverrUrl) {
            const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: `${SITE_BASE}/`, maxTimeout: 60000 });
            this.cacheClearanceFromFlareSolverr(result);
            logger.info(`[Onisaga] Warmed FlareSolverr session`, { service: 'onisagaScraper' });
            return;
        }
        await this.solveClearanceViaBrowser();
    }

    /** Launch a real browser, clear Cloudflare on the homepage, and harvest+cache the cf_clearance cookie. */
    private async solveClearanceViaBrowser(): Promise<void> {
        const browser = await OnisagaScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser);
        const page = await OnisagaScraper.newLeanPage(context);
        try {
            await page.goto(`${SITE_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await this.waitForCloudflare(page, `${SITE_BASE}/`, 'navigate');
            await this.harvestCfSession(context, userAgent);
            logger.info(`[Onisaga] Warmed cf_clearance for HTTP search`, { service: 'onisagaScraper' });
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await OnisagaScraper.releaseBrowser(browser);
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
            logger.info(`[Onisaga] Using saved URL for "${mangaName}"`, { service: 'onisagaScraper' });
        } else {
            const bestMatch = await this.findBestMatch(mangaName, { seriesId, romanizedTitle, nativeTitle, secondaryTitles, coverUrl });
            if (!bestMatch) {
                throw new ScraperStageError({ stage: 'match', scraperId: this.metadata.id, scraperName: this.metadata.name, message: `Could not find manga link for "${mangaName}"` });
            }
            pageUrl = bestMatch.href;
            logger.info(`[Onisaga] Found series page: ${bestMatch.href} (${bestMatch.title})`, { service: 'onisagaScraper' });
        }

        const fsScan = await this.scanChaptersViaFlareSolverr(pageUrl);
        let chapterRows = fsScan?.rows;
        if (!chapterRows?.length) {
            chapterRows = await this.scanChaptersViaPlaywright(pageUrl);
        } else if (fsScan?.needsLoadMore) {
            try {
                chapterRows = await this.scanChaptersViaPlaywright(pageUrl);
            } catch (error: any) {
                logger.warn(`[Onisaga] Full Playwright chapter load failed (${error?.message || error}) — using ${chapterRows.length} chapter(s) from FlareSolverr`, { service: 'onisagaScraper' });
            }
        } else {
            logger.info(`[Onisaga] FlareSolverr chapter scan found ${chapterRows.length} chapter(s)`, { service: 'onisagaScraper' });
        }

        for (const chap of chapterRows) {
            const parsed = ChapterNumberParser.parse(chap.title);
            if (await checkExists(parsed.number)) {
                logger.debug(`[Onisaga] Skipping chapter ${parsed.number} - already exists`, { service: 'onisagaScraper' });
                continue;
            }
            yield { url: chap.url, title: parsed.title, number: parsed.number, isSpecial: parsed.isSpecial, specialType: parsed.specialType };
        }
    }

    async downloadChapter(url: string, seriesId: number, chapterNumber: string, mangaName: string, folderName: string): Promise<DownloadedChapter> {
        return this.withDownloadLock(async () => {
            this.assertNotRateLimited(url);
            logger.info(`[Onisaga] Downloading chapter ${chapterNumber} from ${url}`, { service: 'onisagaScraper' });

            const chapterId = new URL(url, SITE_BASE).pathname.split('/').filter(Boolean).pop() || '';
            const harvest: ReaderHarvestState = { urlsByPage: new Map<number, string>(), rateLimitHits: 0 };
            const browser = await OnisagaScraper.getBrowser();
            const { context, userAgent } = await this.createContext(browser);
            const page = await context.newPage();
            this.attachReaderResponseCollector(page, chapterId, harvest);

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                try {
                    await this.waitForCloudflare(page, url, 'navigate');
                } catch (error) {
                    this.invalidateCfSession();
                    throw error;
                }
                await this.harvestCfSession(context, userAgent);

                const session = this.extractReaderSessionFromHtml(await page.content(), url);
                logger.info(`[Onisaga] Collecting ${session.totalPages} page URL(s) for chapter ${chapterNumber}`, { service: 'onisagaScraper' });

                const uniqueImages = await this.collectChapterImagesViaScroll(page, session, harvest, url);
                logger.info(`[Onisaga] Found ${uniqueImages.length} image URL(s) for chapter ${chapterNumber}`, { service: 'onisagaScraper' });

                const storagePrefix = `${seriesId}/${chapterNumber}`;
                const cfSession = OnisagaScraper.cfSessionCache;
                const cfCookie = cfSession?.cookie;
                try {
                    await downloadAndStoreChapter({
                        storagePrefix,
                        images: uniqueImages,
                        client: OnisagaScraper.axiosInstance,
                        batchSize: ONISAGA_IMAGE_BATCH_SIZE,
                        scraperId: this.metadata.id,
                        scraperName: this.metadata.name,
                        chapterUrl: url,
                        headers: {
                            Referer: url,
                            'User-Agent': cfSession?.userAgent || userAgent,
                            ...(cfCookie ? { Cookie: `cf_clearance=${cfCookie}` } : {}),
                        },
                        service: 'onisagaScraper',
                        // A 404 on a direct image URL may still be recoverable by re-rendering
                        // the reader, so surface it and let the canvas fallback below try.
                        throw404: true,
                    });
                    return { storagePrefix, pageCount: uniqueImages.length };
                } catch (error: any) {
                    const status = error?.httpStatus || error?.response?.status;
                    logger.warn(`[Onisaga] URL download failed for chapter ${chapterNumber} (${status || error?.message}); trying canvas fallback`, { service: 'onisagaScraper' });
                    return this.downloadViaCanvasFallback(page, url, seriesId, chapterNumber, session.totalPages);
                }
            } finally {
                await page.close().catch(() => {});
                await context.close().catch(() => {});
                await OnisagaScraper.releaseBrowser(browser);
            }
        });
    }

    /** Last-resort canvas capture when direct image URLs are blocked. */
    private async downloadViaCanvasFallback(page: any, url: string, seriesId: number, chapterNumber: string, expectedPages: number): Promise<DownloadedChapter> {
        await page.evaluate((settings: string) => {
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('reader_mode_')) localStorage.setItem(key, 'long-strip');
            }
            localStorage.setItem('reader_settings', settings);
        }, READER_SETTINGS);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('[x-ref="longStripContainer"]', { timeout: 30000 }).catch(() => {});
        const captured: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < expectedPages + 20; i++) {
            const batch: string[] = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('[x-ref="longStripContainer"] img'));
                const results: string[] = [];
                for (const img of imgs) {
                    const width = img.naturalWidth || img.width;
                    const height = img.naturalHeight || img.height;
                    if (!width || !height) continue;
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;
                    try {
                        ctx.drawImage(img, 0, 0);
                        results.push(canvas.toDataURL('image/webp', 0.92));
                    } catch { /* tainted canvas — skip */ }
                }
                return results;
            });
            for (const dataUrl of batch) {
                if (!seen.has(dataUrl)) {
                    seen.add(dataUrl);
                    captured.push(dataUrl);
                }
            }
            if (captured.length >= expectedPages) break;
            await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.9)));
            await page.waitForTimeout(500);
        }
        if (captured.length === 0) {
            throw new ScraperStageError({ stage: 'extract_images', scraperId: this.metadata.id, scraperName: this.metadata.name, url, message: 'Reader produced no page images (Cloudflare block or layout change?)' });
        }
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        for (let i = 0; i < captured.length; i++) {
            const base64 = captured[i].replace(/^data:image\/[^;]+;base64,/, '');
            await objectStorageService.transformAndUploadPage(storagePrefix, i, Buffer.from(base64, 'base64'));
        }
        logger.info(`[Onisaga] Stored ${captured.length} page(s) via canvas for chapter ${chapterNumber}`, { service: 'onisagaScraper' });
        return { storagePrefix, pageCount: captured.length };
    }
}
