/**
 * Mangago Scraper Implementation
 *
 * Scraper for www.mangago.me — behind Cloudflare's "Just a moment…" JS challenge,
 * with an AES-encrypted reader. Search + chapter list are fetched as solved HTML
 * (FlareSolverr, falling back to Playwright); chapter downloads drive a real
 * Chromium so the site's own JS decrypts the image list for us.
 *
 * Chapter image extraction uses keiyoushi's input#curl + total_pages pattern: one browser
 * load captures AES keys from chapter.js, decrypts the embedded imgsrcs, then batch-fetches
 * any missing pg-N slices via sync XHR in the same session. Works for both /read-manga/ scroll
 * readers and /chapter/ mirror readers on mangago.zone / youhim.me.
 *
 * Some pages are pixel-scrambled (tile-shuffled) on hosts containing "cspiclink";
 * those carry a per-image `desckey` + a chapter-wide `cols`, and we unscramble the
 * tiles server-side (see `unscrambleImage`). Non-scrambled pages stream straight
 * through the shared downloader.
 *
 * Composition of existing patterns:
 *  - Cloudflare clearance + FlareSolverr/Playwright HTML, browser pool, cf_clearance
 *    seeding, keep-alive: mirrors OnisagaScraper.
 *  - Parallel page download + transcode/upload: shared chapterImageDownloader.
 *
 * Site structure:
 *  - Search:       https://www.mangago.me/r/l_search/?name={term}  (ul#search_list > li)
 *  - Series page:  https://www.mangago.me/read-manga/{slug}/       (table#chapter_table)
 *  - Chapter:      https://www.mangago.me/read-manga/{slug}/{...}/  (encrypted imgsrcs)
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
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

const SITE_BASE = appConfig.scraper.mangago.baseUrl;
const CF_TITLE = 'Just a moment';
const SERVICE = 'mangagoScraper';

// mangapicgallery throttles per-connection, so a chapter's wall time is download-bound;
// widening the parallel pool multiplies throughput. Tune via env.
const MANGAGO_IMAGE_BATCH_SIZE = parseInt(process.env.MANGAGO_IMAGE_BATCH_SIZE || '12', 10);

/** A resolved page: its CDN image URL and (for scrambled `cspiclink` hosts) the descramble params. */
interface MangagoPage {
    url: string;
    descKey?: string;
    cols?: number;
}

/** One row from the chapter table (before dedup): link, title, and the upload-date cell text. */
interface ChapterRow {
    url: string;
    title: string;
    dateText?: string;
}

interface CfSession { cookie: string; userAgent: string; expiresAt: number; }

/** Calculate title similarity score (0-100). */
function calculateTitleSimilarity(title1: string, title2: string): number {
    if (title1.toLowerCase() === title2.toLowerCase()) return 100;
    const normalize = (s: string) => s.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const words1 = normalize(title1);
    const words2 = normalize(title2);
    if (words1.length === 0 || words2.length === 0) return 0;
    const matches = words1.filter(w => words2.includes(w)).length;
    return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
}

/** Normalize a title so minor punctuation/connector differences don't affect matching. */
function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value.replace(/[-_.]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * mangago chapter rows read like "Ch.290 : Howl from the Darkness" — keep only the
 * "Ch.290" numbering prefix and drop the descriptive sub-title (per requirements).
 */
function cleanChapterTitle(raw: string): string {
    const t = raw.replace(/\s+/g, ' ').trim();
    return t.split(/\s*[:：]\s*/)[0].trim() || t;
}

/** Parse a chapter row's date cell to an epoch (ms). Handles absolute dates and mangago's "N days ago" relative form. Undefined when unparseable. */
function parseChapterDate(text?: string): number | undefined {
    if (!text) return undefined;
    const t = text.trim();
    const rel = t.match(/(\d+)\s*(sec|min|hour|day|week|month|year)\w*\s+ago/i);
    if (rel) {
        const n = parseInt(rel[1], 10);
        const u = rel[2].toLowerCase();
        const unitMs = u === 'sec' ? 1e3 : u === 'min' ? 6e4 : u === 'hour' ? 36e5 : u === 'day' ? 864e5 : u === 'week' ? 6048e5 : u === 'month' ? 2592e6 : 31536e6;
        return Date.now() - n * unitMs;
    }
    const abs = Date.parse(t);
    return Number.isNaN(abs) ? undefined : abs;
}

/** The trailing numeric id in a chapter URL (…/chapter/{mangaId}/{uploadId}/ → uploadId). Auto-increments, so higher ⇒ uploaded later. */
function extractUploadId(url: string): number | undefined {
    try {
        const segs = new URL(url).pathname.split('/').filter(Boolean);
        for (let i = segs.length - 1; i >= 0; i--) {
            if (/^\d+$/.test(segs[i])) return parseInt(segs[i], 10);
        }
    } catch { /* ignore */ }
    return undefined;
}

/**
 * mangago allows multiple uploads (scanlation groups) per chapter, so the table has
 * several rows with the same chapter number. Keep only the latest per number, then order
 * oldest-first for import. "Latest" = newest upload date, tie-broken by the URL's upload id,
 * then by list position (mangago lists newest-first, so the earlier row wins).
 */
function dedupeLatestPerChapter(rows: ChapterRow[]): ScrapedChapter[] {
    interface Candidate { entry: ScrapedChapter; date: number; uploadId: number; index: number; }
    const isMoreRecent = (a: Candidate, b: Candidate): boolean => {
        if (a.date !== b.date) return a.date > b.date;
        if (a.uploadId !== b.uploadId) return a.uploadId > b.uploadId;
        return a.index < b.index;
    };

    const byNumber = new Map<string, Candidate>();
    rows.forEach((row, index) => {
        const parsed = ChapterNumberParser.parse(row.title);
        const candidate: Candidate = {
            entry: { url: row.url, title: parsed.title, number: parsed.number, isSpecial: parsed.isSpecial, specialType: parsed.specialType },
            date: parseChapterDate(row.dateText) ?? -1,
            uploadId: extractUploadId(row.url) ?? -1,
            index,
        };
        const existing = byNumber.get(parsed.number);
        if (!existing || isMoreRecent(candidate, existing)) byNumber.set(parsed.number, candidate);
    });

    return [...byNumber.values()]
        .sort((a, b) => (parseFloat(a.entry.number) || 0) - (parseFloat(b.entry.number) || 0))
        .map(c => c.entry);
}

/**
 * Unscramble a tile-shuffled mangago page. Mirrors the reference reader math: the
 * image is a `cols × cols` grid; `key.split('a')` gives, for each source tile index,
 * the destination cell it belongs in. Integer division leaves any right/bottom
 * remainder margin untouched (as the site's canvas does). Returns a PNG buffer.
 */
async function unscrambleImage(buffer: Buffer, key: string, cols: number): Promise<Buffer> {
    const { data, info } = await sharp(buffer, { failOn: 'none' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const stride = info.width * channels;
    const unitWidth = Math.floor(info.width / cols);
    const unitHeight = Math.floor(info.height / cols);
    const keyArray = key.split('a');
    const out = Buffer.from(data); // start from the original so remainder margins stay intact

    for (let idx = 0; idx < cols * cols; idx++) {
        const keyval = parseInt(keyArray[idx] || '0', 10) || 0;
        const sx = (idx % cols) * unitWidth;
        const sy = Math.floor(idx / cols) * unitHeight;
        const dx = (keyval % cols) * unitWidth;
        const dy = Math.floor(keyval / cols) * unitHeight;
        for (let row = 0; row < unitHeight; row++) {
            const srcStart = (sy + row) * stride + sx * channels;
            const dstStart = (dy + row) * stride + dx * channels;
            data.copy(out, dstStart, srcStart, srcStart + unitWidth * channels);
        }
    }

    return sharp(out, { raw: { width: info.width, height: info.height, channels } }).png().toBuffer();
}

export class MangagoScraper implements IChapterScraper {
    private readonly metadata: ScraperMetadata = {
        id: 'mangago',
        name: 'Mangago',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.mangago.priority,
        enabled: appConfig.scraper.mangago.enabled,
        searchTimeoutMs: 22_000, // interactive admin search must fit the aggregate deadline; a hung CF solve is bounded here
    };

    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 2;
    private static cfSessionCache: CfSession | null = null;

    // Egress (agents + proxy + ban detection) centralized in scraperEgress; flag off → plain keep-alive axios.
    private static readonly axiosInstance = buildAxios({
        scraperId: 'mangago',
        timeout: appConfig.scraper.mangago.timeout,
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
        if (MangagoScraper.browserPool.length > 0) return MangagoScraper.browserPool.pop();
        // Headful (under Xvfb, so DISPLAY is set) to pass Cloudflare; headless where no display exists.
        const headless = !process.env.DISPLAY;
        logger.debug(`[Mangago] Launching new browser for pool (headless=${headless})`, { service: SERVICE });
        return chromium.launch({ headless, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-blink-features=AutomationControlled'] });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            if (!browser.isConnected()) { await browser.close().catch(() => {}); return; }
            if (MangagoScraper.browserPool.length < MangagoScraper.MAX_BROWSERS) MangagoScraper.browserPool.push(browser);
            else await browser.close().catch(() => {});
        } catch {
            await browser.close().catch(() => {});
        }
    }

    /** Resolve a cf_clearance cookie to seed a fresh context (cache → env → FlareSolverr); null → rely on in-browser solve. */
    private async getSeedCfSession(): Promise<CfSession | null> {
        const cached = MangagoScraper.cfSessionCache;
        if (cached && Date.now() < cached.expiresAt - 60_000) return cached;

        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.mangago.flareSolverrUrl);
        if (flareSolverrUrl) {
            try {
                const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: `${SITE_BASE}/`, maxTimeout: 120000 });
                this.cacheClearanceFromFlareSolverr(result);
                if (MangagoScraper.cfSessionCache) return MangagoScraper.cfSessionCache;
            } catch (error) {
                logger.warn(`[Mangago] FlareSolverr clearance failed: ${error}`, { service: SERVICE });
            }
        }
        return null;
    }

    /**
     * Create a browser context with UA/viewport, anti-automation init script, and cookies.
     * `targetUrl` is the page we're about to open: mangago serves chapters from rotating
     * mirror domains (mangago.zone, youhim.me, …), so the "adult content unlocked" cookie
     * `_m_superu` is set on that domain too (cf_clearance is zone-bound to mangago.me, so
     * the browser re-solves Cloudflare on the mirror during navigation).
     */
    private async createContext(browser: any, targetUrl?: string): Promise<{ context: any; userAgent: string }> {
        const seed = await this.getSeedCfSession();
        const userAgent = seed?.userAgent || appConfig.scraper.mangago.userAgent;
        const context = await browser.newContext({ userAgent, viewport: { width: 1366, height: 900 }, locale: 'en-US' });
        await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
        // Trap CryptoJS.enc.Hex.parse so we capture the rotating AES key/iv from chapter.js.
        await context.addInitScript(() => {
            try {
                const hexKeys: string[] = [];
                (window as any).__mangago_keys = hexKeys;
                let real: any;
                Object.defineProperty(window, 'CryptoJS', {
                    configurable: true,
                    get() { return real; },
                    set(v: any) {
                        real = v;
                        try {
                            const hx = v && v.enc && v.enc.Hex;
                            if (hx && typeof hx.parse === 'function' && !hx.__hooked) {
                                const origParse = hx.parse;
                                hx.parse = function (this: any, s: any) { try { if (typeof s === 'string' && /^[0-9a-fA-F]{16,}$/.test(s) && hexKeys.indexOf(s) === -1) hexKeys.push(s); } catch { /* ignore */ } return origParse.apply(this, arguments as any); };
                                hx.__hooked = true;
                            }
                        } catch { /* ignore */ }
                    },
                });
            } catch { /* ignore */ }
        });
        const cookies: any[] = [{ name: '_m_superu', value: '1', domain: '.mangago.me', path: '/' }];
        if (seed?.cookie) cookies.push({ name: 'cf_clearance', value: seed.cookie, domain: '.mangago.me', path: '/' });
        if (targetUrl) { try { cookies.push({ name: '_m_superu', value: '1', url: new URL(targetUrl).origin }); } catch { /* ignore bad url */ } }
        await context.addCookies(cookies);
        return { context, userAgent };
    }

    private invalidateCfSession(): void {
        MangagoScraper.cfSessionCache = null;
    }

    /** Wait for Cloudflare's "Just a moment…" interstitial to clear; throw if it never does. */
    private async waitForCloudflare(page: any, url: string, stage: 'search' | 'scan' | 'navigate' | 'extract_images'): Promise<void> {
        for (let i = 0; i < 180; i++) {
            const title = await page.title().catch(() => '');
            if (!title.includes(CF_TITLE)) return;
            await page.waitForTimeout(500);
        }
        throw new ScraperStageError({ stage, scraperId: this.metadata.id, scraperName: this.metadata.name, url, message: 'Cloudflare challenge did not clear. Set MANGAGO_FLARESOLVERR_URL or run the worker headful (Xvfb).' });
    }

    /** Harvest a fresh cf_clearance cookie from a cleared context and cache it for reuse. */
    private async harvestCfSession(context: any, userAgent: string): Promise<void> {
        try {
            const cookies = await context.cookies();
            const clearance = cookies.find((c: { name: string; value: string; expires?: number }) => c.name === 'cf_clearance');
            if (clearance?.value) {
                MangagoScraper.cfSessionCache = { cookie: clearance.value, userAgent, expiresAt: (clearance.expires && clearance.expires > 0 ? clearance.expires : Math.floor(Date.now() / 1000) + 1800) * 1000 };
            }
        } catch {
            // best-effort
        }
    }

    /** Cache the cf_clearance cookie from a FlareSolverr solve (best-effort; used by the axios image-download path). */
    private cacheClearanceFromFlareSolverr(result: FlareSolverrResult): void {
        const clearance = result.solution?.cookies?.find(c => c.name === 'cf_clearance');
        if (!clearance?.value) return;
        const expirySeconds = clearance.expiry && clearance.expiry > 0 ? clearance.expiry : Math.floor(Date.now() / 1000) + 1800;
        MangagoScraper.cfSessionCache = { cookie: clearance.value, userAgent: result.solution?.userAgent || appConfig.scraper.mangago.userAgent, expiresAt: expirySeconds * 1000 };
    }

    private buildSearchVariants(mangaName: string, options?: SearchOptions): string[] {
        const baseVariants = [mangaName, options?.romanizedTitle, options?.nativeTitle, ...(options?.secondaryTitles || [])].filter((v): v is string => !!v && v.length > 0);
        const normalizedExtras = baseVariants.map(v => normalizeForSearch(v)).filter(v => v && !baseVariants.includes(v));
        return [...baseVariants, ...normalizedExtras];
    }

    private searchUrl(term: string): string {
        return `${SITE_BASE}/r/l_search/?name=${encodeURIComponent(term)}`;
    }

    /** Parse the ul#search_list results out of a solved search page. */
    private parseSearchHtml(html: string): Array<{ href: string; title: string }> {
        const doc = new JSDOM(html, { url: SITE_BASE }).window.document;
        const items = Array.from(doc.querySelectorAll('#search_list li'));
        const seen = new Set<string>();
        const out: Array<{ href: string; title: string }> = [];
        for (const li of items) {
            const anchor = li.querySelector('a[href*="/read-manga/"]') as HTMLAnchorElement | null;
            if (!anchor) continue;
            const href = anchor.href;
            if (!href || seen.has(href)) continue;
            // Title: prefer the dedicated title link/attr, fall back to the cover img alt or anchor text.
            const title = (li.querySelector('.tit a, a.tit, h2 a') as HTMLElement | null)?.textContent?.trim()
                || anchor.getAttribute('title')?.trim()
                || (li.querySelector('img') as HTMLImageElement | null)?.getAttribute('alt')?.trim()
                || anchor.textContent?.replace(/\s+/g, ' ').trim()
                || '';
            if (!title) continue;
            seen.add(href);
            out.push({ href, title });
        }
        return out;
    }

    /** Reliable path: FlareSolverr solves Cloudflare and returns the search HTML (solution.response). Null when unconfigured/failed. */
    private async searchViaFlareSolverr(query: string): Promise<Array<{ href: string; title: string }> | null> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.mangago.flareSolverrUrl);
        if (!flareSolverrUrl) return null;
        try {
            const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: this.searchUrl(query), maxTimeout: 30000 });
            this.cacheClearanceFromFlareSolverr(result);
            const html = result.solution?.response;
            if (!html || html.includes(CF_TITLE)) return null;
            const results = this.parseSearchHtml(html);
            logger.debug(`[Mangago] FlareSolverr search "${query}" -> ${results.length} result(s)`, { service: SERVICE });
            return results;
        } catch (error: any) {
            logger.warn(`[Mangago] FlareSolverr search failed: ${error?.message || error}`, { service: SERVICE });
            return null;
        }
    }

    /** Fallback: solve Cloudflare in a real browser and read the search list from the DOM. */
    private async searchViaPlaywright(query: string): Promise<Array<{ href: string; title: string }>> {
        const browser = await MangagoScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser);
        const page = await context.newPage();
        const url = this.searchUrl(query);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
            try {
                await this.waitForCloudflare(page, url, 'search');
            } catch (error) {
                this.invalidateCfSession();
                throw error;
            }
            await this.harvestCfSession(context, userAgent);
            return this.parseSearchHtml(await page.content());
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await MangagoScraper.releaseBrowser(browser);
        }
    }

    private async searchRaw(query: string): Promise<Array<{ href: string; title: string }>> {
        const fs = await this.searchViaFlareSolverr(query);
        if (fs) return fs;
        return this.searchViaPlaywright(query);
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
        logger.info(`[Mangago] Trying ${variants.length} search variant(s)`, { service: SERVICE });

        for (const variant of variants) {
            try {
                const results = await this.searchRaw(variant);
                const scored = this.scoreAndRank(results, variant, 70, 1);
                if (scored.length > 0) {
                    const best = scored[0];
                    logger.info(`[Mangago] Best match: "${best.title}" score=${best.score} → ${best.href}`, { service: SERVICE });
                    return best;
                }
            } catch (error: any) {
                logger.debug(`[Mangago] Search failed for variant "${variant}": ${error?.message || error}`, { service: SERVICE });
            }
        }

        logger.warn(`[Mangago] Could not find manga for "${mangaName}"`, { service: SERVICE });
        return undefined;
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];
        try {
            const results = await this.searchRaw(q);
            return this.scoreAndRank(results, q, 50, limit);
        } catch (error: any) {
            logger.warn(`[Mangago] Interactive search failed for "${q}": ${error?.message || error}`, { service: SERVICE });
            return [];
        }
    }

    /**
     * Parse chapter rows from a solved series page. All rows live in table#chapter_table
     * already — the "click to show all chapters" control only removes a CSS height clamp,
     * so parsing the HTML sees every chapter without clicking anything.
     */
    private parseChapterListHtml(html: string): ChapterRow[] {
        const doc = new JSDOM(html, { url: SITE_BASE }).window.document;
        const rows = Array.from(doc.querySelectorAll('table#chapter_table tr'));
        const seen = new Set<string>();
        const out: ChapterRow[] = [];
        for (const tr of rows) {
            const anchor = tr.querySelector('a.chico, a[href*="/read-manga/"]') as HTMLAnchorElement | null;
            if (!anchor) continue;
            const url = anchor.href;
            if (!url || seen.has(url)) continue;
            const title = cleanChapterTitle(anchor.textContent || '');
            if (!title) continue;
            // The upload date lives in its own cell — grab the last td that looks like a date.
            let dateText: string | undefined;
            for (const td of Array.from(tr.querySelectorAll('td'))) {
                const txt = td.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (/\bago\b/i.test(txt) || /\b(19|20)\d{2}\b/.test(txt) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(txt)) dateText = txt;
            }
            seen.add(url);
            out.push({ url, title, dateText });
        }
        // Document order (mangago lists newest-first); dedup/ordering happens in dedupeLatestPerChapter.
        return out;
    }

    private async scanChaptersViaFlareSolverr(pageUrl: string): Promise<ChapterRow[] | null> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.mangago.flareSolverrUrl);
        if (!flareSolverrUrl) return null;
        try {
            const result = await requestFlareSolverr(flareSolverrUrl, { cmd: 'request.get', url: pageUrl, maxTimeout: 120000 });
            this.cacheClearanceFromFlareSolverr(result);
            const html = result.solution?.response;
            if (!html || html.includes(CF_TITLE)) return null;
            const rows = this.parseChapterListHtml(html);
            logger.debug(`[Mangago] FlareSolverr chapter scan -> ${rows.length} row(s)`, { service: SERVICE });
            return rows;
        } catch (error: any) {
            logger.warn(`[Mangago] FlareSolverr chapter scan failed: ${error?.message || error}`, { service: SERVICE });
            return null;
        }
    }

    private async scanChaptersViaPlaywright(pageUrl: string): Promise<ChapterRow[]> {
        const browser = await MangagoScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser, pageUrl);
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
            return this.parseChapterListHtml(await page.content());
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await MangagoScraper.releaseBrowser(browser);
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
            logger.info(`[Mangago] Using saved URL for "${mangaName}"`, { service: SERVICE });
        } else {
            const bestMatch = await this.findBestMatch(mangaName, { seriesId, romanizedTitle, nativeTitle, secondaryTitles, coverUrl });
            if (!bestMatch) {
                throw new ScraperStageError({ stage: 'match', scraperId: this.metadata.id, scraperName: this.metadata.name, message: `Could not find manga link for "${mangaName}"` });
            }
            pageUrl = bestMatch.href;
            logger.info(`[Mangago] Found series page: ${bestMatch.href} (${bestMatch.title})`, { service: SERVICE });
        }

        const chapterRows = await this.scanChaptersViaFlareSolverr(pageUrl);
        const rows = chapterRows?.length ? chapterRows : await this.scanChaptersViaPlaywright(pageUrl);

        // Collapse multi-uploader duplicates to the latest upload per chapter number.
        const chapters = dedupeLatestPerChapter(rows ?? []);
        logger.info(`[Mangago] ${rows?.length ?? 0} row(s) → ${chapters.length} unique chapter(s) after dedupe`, { service: SERVICE });

        for (const chap of chapters) {
            if (await checkExists(chap.number)) {
                logger.debug(`[Mangago] Skipping chapter ${chap.number} - already exists`, { service: SERVICE });
                continue;
            }
            yield chap;
        }
    }

    /**
     * Resolve all page image URLs via input#curl + total_pages (keiyoushi Mangago.kt pageListParse).
     * Decrypts the embedded imgsrcs on the loaded page, then batch-fetches any missing pg-N slices
     * via parallel fetch in the same browser session. Works for /read-manga/ and /chapter/ mirror readers.
     * In-page code must not use async/await — Playwright serializes evaluate() into the browser
     * where TypeScript's __awaiter helper does not exist; use Promise chains instead.
     */
    private async extractPages(page: any, chapterUrl: string, expectedCount: number): Promise<MangagoPage[]> {
        const raw = await page.evaluate((expectedHint: number) => {
            return new Promise<{ images: string[]; cols: number | null; descKeys: Record<string, string>; diag: string }>((resolve) => {
                const out: { images: string[]; cols: number | null; descKeys: Record<string, string>; diag: string } = { images: [], cols: null, descKeys: {}, diag: '' };
                const w = window as any;
                const isImg = (s: any) => typeof s === 'string' && (/^https?:\/\/[^\s'"]+\.(?:jpe?g|png|webp|gif)/i.test(s.trim()) || /^https?:\/\/[^\s'"]*(?:cspiclink|mangapicgallery)/i.test(s.trim()));
                const C = w.CryptoJS;
                const hexes: string[] = Array.isArray(w.__mangago_keys) ? w.__mangago_keys.slice() : [];
                const scriptJoin = () => Array.from(document.scripts).map(s => s.textContent || '').join('\n');
                const scriptTotal = (() => { const m = scriptJoin().match(/total_pages\s*=\s*(\d+)/); return m ? parseInt(m[1], 10) : 0; })();
                const tipMatch = document.querySelector('.multi_pg_tip')?.textContent?.match(/\(\s*\d+\s*\/\s*(\d+)\s*\)/);
                const tipTotal = tipMatch ? parseInt(tipMatch[1], 10) : 0;
                const totalPages = Math.max(scriptTotal, tipTotal, expectedHint || 0);
                const curlEl = document.querySelector('input#curl') as HTMLInputElement | null;
                const urlTemplate = (curlEl?.value || '').trim().replace(/^\//, '');
                if (!totalPages || !urlTemplate.includes('{page}')) {
                    out.diag = `missing-meta script=${scriptTotal} tip=${tipTotal} hint=${expectedHint} template=${urlTemplate ? 'y' : 'n'}`;
                    resolve(out);
                    return;
                }

                const decryptImgsrcsFromHtml = (html: string): string[] => {
                    if (!C || !hexes.length) return [];
                    const cands: string[] = [];
                    const re = /var\s+imgsrcs\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/g;
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(html)) !== null) cands.push(m[1]);
                    cands.sort((a, b) => b.length - a.length);
                    const enc = cands[0];
                    if (!enc) return [];
                    const keyCands = hexes.filter((h: string) => h.length >= 48);
                    const ivCands = hexes.filter((h: string) => h.length === 32);
                    const tryDec = (kHex: string, ivHex: string): string[] => {
                        try {
                            const pt = C.AES.decrypt({ ciphertext: C.enc.Base64.parse(enc) }, C.enc.Hex.parse(kHex), { iv: C.enc.Hex.parse(ivHex), mode: C.mode.CBC, padding: C.pad.ZeroPadding }).toString(C.enc.Utf8);
                            return pt && pt.includes('http') ? pt.split(',').map((x: string) => x.trim()).filter(isImg) : [];
                        } catch { return []; }
                    };
                    let best: string[] = [];
                    outer: for (const k of (keyCands.length ? keyCands : hexes)) for (const iv of (ivCands.length ? ivCands : hexes)) {
                        const got = tryDec(k, iv);
                        if (got.length > best.length) best = got;
                        if (best.length >= totalPages) break outer;
                    }
                    return best;
                };

                const buildPrefix = (): string => {
                    const seg = urlTemplate.split('/')[0];
                    const parts = location.pathname.split('/').filter(Boolean);
                    if (location.hostname.endsWith('mangago.me') && parts[0] === 'read-manga' && parts.length > 3 && parts[2] === seg) {
                        return `https://www.mangago.me/read-manga/${parts[1]}`;
                    }
                    if (!location.hostname.endsWith('mangago.me') && parts[0] === seg) return location.origin;
                    return location.origin;
                };

                const prefix = buildPrefix();
                const fetchHtml = (url: string) => fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.text() : ''));

                const firstList = decryptImgsrcsFromHtml(scriptJoin());
                const images: string[] = new Array(totalPages).fill('');
                for (let i = 0; i < Math.min(firstList.length, totalPages); i++) {
                    if (firstList[i]) images[i] = firstList[i];
                }

                const missing: number[] = [];
                for (let p = 1; p <= totalPages; p++) { if (!images[p - 1]) missing.push(p); }

                let fetched = 0;
                const parallel = 8;

                const finish = () => {
                    while (images.length > 0 && !images[images.length - 1]) images.pop();
                    out.images = images;
                    out.diag = `curl script=${scriptTotal} tip=${tipTotal} total=${totalPages} first=${firstList.length} fetched=${fetched} got=${out.images.length}`;
                    if (typeof w.cols === 'number') out.cols = w.cols;
                    if (typeof w.getDescramblingKey === 'function') {
                        for (const u of out.images) {
                            if (u.includes('cspiclink')) {
                                try { out.descKeys[u] = String(w.getDescramblingKey(u)); } catch { /* ignore */ }
                            }
                        }
                    }
                    resolve(out);
                };

                const processBatch = (startIdx: number) => {
                    if (startIdx >= missing.length) { finish(); return; }
                    const batch = missing.slice(startIdx, startIdx + parallel);
                    Promise.all(batch.map((p) => {
                        const pageUrl = `${prefix}/${urlTemplate.replace('{page}', String(p))}`;
                        return fetchHtml(pageUrl).then((html) => {
                            const list = decryptImgsrcsFromHtml(html);
                            const img = list[p - 1] || list[0] || '';
                            return { p, img };
                        });
                    })).then((results) => {
                        for (const { p, img } of results) { if (img) { images[p - 1] = img; fetched++; } }
                        processBatch(startIdx + parallel);
                    }).catch(() => finish());
                };

                processBatch(0);
            });
        }, expectedCount);

        const images: string[] = Array.isArray(raw?.images) ? raw.images : [];
        if (images.length === 0) {
            throw new ScraperStageError({ stage: 'extract_images', scraperId: this.metadata.id, scraperName: this.metadata.name, url: chapterUrl, message: `Reader found no images (${raw?.diag || 'none'})` });
        }
        if (expectedCount > 0 && images.length < expectedCount) {
            logger.warn(`[Mangago] Resolved ${images.length}/${expectedCount} page(s) for ${chapterUrl} (${raw?.diag || 'none'})`, { service: SERVICE });
        } else {
            logger.info(`[Mangago] Resolved ${images.length} page(s) for ${chapterUrl} (${raw?.diag || 'none'})`, { service: SERVICE });
        }

        const cols = typeof raw.cols === 'number' && raw.cols > 1 ? raw.cols : undefined;
        return images.map(url => {
            const descKey = raw.descKeys?.[url];
            return descKey && cols ? { url, descKey, cols } : { url };
        });
    }

    /** Read the "(1/24)" page-count hint if present (sanity check only). */
    private async readExpectedCount(page: any): Promise<number> {
        const text = await page.evaluate(() => document.querySelector('.multi_pg_tip')?.textContent?.trim() || '').catch(() => '');
        const match = text.match(/\(\s*\d+\s*\/\s*(\d+)\s*\)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    async downloadChapter(url: string, seriesId: number, chapterNumber: string, mangaName: string, folderName: string): Promise<DownloadedChapter> {
        logger.info(`[Mangago] Downloading chapter ${chapterNumber} from ${url}`, { service: SERVICE });
        const browser = await MangagoScraper.getBrowser();
        const { context, userAgent } = await this.createContext(browser, url);
        const page = await context.newPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
            try {
                await this.waitForCloudflare(page, url, 'navigate');
            } catch (error) {
                this.invalidateCfSession();
                throw error;
            }
            await this.harvestCfSession(context, userAgent);

            const expectedCount = await this.readExpectedCount(page);
            const pages = await this.extractPages(page, url, expectedCount);
            logger.info(`[Mangago] Resolved ${pages.length} page(s) for chapter ${chapterNumber} (${pages.filter(p => p.descKey).length} scrambled)`, { service: SERVICE });

            const storagePrefix = `${seriesId}/${chapterNumber}`;
            const cfSession = MangagoScraper.cfSessionCache;
            // Referer must be the reader's own (possibly mirror) origin — the CDN checks it.
            let referer = `${SITE_BASE}/`;
            try { referer = `${new URL(page.url()).origin}/`; } catch { /* keep default */ }
            const headers: Record<string, string> = { Referer: referer, 'User-Agent': cfSession?.userAgent || userAgent };
            if (cfSession?.cookie) headers.Cookie = `cf_clearance=${cfSession.cookie}; _m_superu=1`;
            else headers.Cookie = '_m_superu=1';

            const scrambled = pages.some(p => p.descKey);
            if (!scrambled) {
                // Fast path: no descramble needed → hand the ordered URLs to the shared downloader.
                await downloadAndStoreChapter({
                    storagePrefix,
                    images: pages.map(p => p.url),
                    client: MangagoScraper.axiosInstance,
                    batchSize: MANGAGO_IMAGE_BATCH_SIZE,
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    chapterUrl: url,
                    headers,
                    service: SERVICE,
                });
            } else {
                await this.downloadWithDescramble(pages, storagePrefix, headers, url);
            }
            return { storagePrefix, pageCount: pages.length };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await MangagoScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download every page, unscrambling `cspiclink` pages before upload. Preserves page
     * order/indexing across the whole chapter (so mixed scrambled/plain chapters stay
     * correct). Sliding-window concurrency mirrors the shared downloader.
     */
    private async downloadWithDescramble(pages: MangagoPage[], storagePrefix: string, headers: Record<string, string>, chapterUrl: string): Promise<void> {
        const concurrency = Math.max(1, MANGAGO_IMAGE_BATCH_SIZE);
        const maxRetries = 3;
        let nextIndex = 0;

        const downloadOne = async (pageInfo: MangagoPage, index: number) => {
            let lastError: Error | undefined;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await MangagoScraper.axiosInstance.get(pageInfo.url, { responseType: 'arraybuffer', timeout: 20000, headers });
                    let buffer = Buffer.from(response.data);
                    if (pageInfo.descKey && pageInfo.cols) buffer = await unscrambleImage(buffer, pageInfo.descKey, pageInfo.cols);
                    await objectStorageService.transformAndUploadPage(storagePrefix, index, buffer);
                    return;
                } catch (err: any) {
                    lastError = err;
                    if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                }
            }
            throw new ScraperStageError({ stage: 'download_image', scraperId: this.metadata.id, scraperName: this.metadata.name, url: chapterUrl, pageNumber: index + 1, pageCount: pages.length, imageUrl: pageInfo.url, attempts: maxRetries, message: lastError?.message || 'download failed', cause: lastError });
        };

        const runWorker = async () => {
            while (true) {
                const i = nextIndex++;
                if (i >= pages.length) return;
                await downloadOne(pages[i], i);
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => runWorker()));
    }

    private static keepAliveTimer: NodeJS.Timeout | null = null;
    private static warming: Promise<void> | null = null;
    private static readonly CLEARANCE_REFRESH_MS = 20 * 60 * 1000; // refresh before the ~30min cf_clearance lifetime

    /** Warm now and periodically so FlareSolverr keeps a cleared mangago session ready for fast interactive search. Idempotent; timer unref'd. */
    startClearanceKeepAlive(): void {
        if (MangagoScraper.keepAliveTimer) return;
        if (!resolveFlareSolverrUrl(appConfig.scraper.mangago.flareSolverrUrl)) return; // no FlareSolverr → nothing to keep warm
        this.warmClearanceInBackground();
        MangagoScraper.keepAliveTimer = setInterval(() => this.warmClearanceInBackground(), MangagoScraper.CLEARANCE_REFRESH_MS);
        MangagoScraper.keepAliveTimer.unref?.();
        logger.info(`[Mangago] Cloudflare keep-alive started (refresh every ${Math.round(MangagoScraper.CLEARANCE_REFRESH_MS / 60000)}m)`, { service: SERVICE });
    }

    private warmClearanceInBackground(): void {
        if (MangagoScraper.warming) return;
        MangagoScraper.warming = this.getSeedCfSession()
            .then(() => { logger.debug('[Mangago] Warmed FlareSolverr session', { service: SERVICE }); })
            .catch(err => { logger.debug(`[Mangago] Background warm failed: ${err?.message || err}`, { service: SERVICE }); })
            .finally(() => { MangagoScraper.warming = null; }) as Promise<void>;
    }
}
