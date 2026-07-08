/**
 * Kagane Scraper Implementation
 *
 * Scraper for kagane.to manga source.
 * Uses yuzuki.kagane.to JSON APIs for search and chapter lists.
 * Chapter images are fetched via the books DRM API (integrity token + manifest)
 * with a Playwright reader fallback for blob-based pages.
 */

import { chromium } from 'playwright';
import axios from 'axios';
import { objectStorageService } from '@/services/objectStorageService';
import { buildAgents, getPlaywrightProxy } from '@/scrapers/lib/scraperEgress';
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
import { requestFlareSolverr, resolveFlareSolverrUrl, hasFlareSolverr, type FlareSolverrCookie, type FlareSolverrResult } from '@/lib/flareSolverrClient';
import { ScraperStageError, describeError } from '../lib/scraperError';

const SITE_BASE = appConfig.scraper.kagane.baseUrl;
const API_BASE = appConfig.scraper.kagane.apiUrl;

interface KaganeSearchItem {
    series_id: string;
    title: string;
    alternate_titles?: string[];
}

interface KaganeSearchResponse {
    content?: KaganeSearchItem[];
}

interface KaganeAlternateTitle {
    title: string;
}

interface KaganeSeriesBook {
    book_id: string;
    title: string;
    chapter_no?: string;
    sort_no?: number;
    page_count?: number;
}

interface KaganeSeriesResponse {
    series_id: string;
    title: string;
    series_alternate_titles?: KaganeAlternateTitle[];
    series_books?: KaganeSeriesBook[];
}

interface KaganeBookPage {
    page_id: string;
    ext: string;
}

interface KaganeBookResponse {
    cache_url: string;
    access_token: string;
    manifest: {
        pages: KaganeBookPage[];
    };
}

interface KaganeIntegrityResponse {
    token: string;
    exp?: number;
}

interface KaganeIntegritySession {
    token: string;
    userAgent: string;
    expiresAt: number;
}

interface KaganeCfSession {
    cfClearance: string;
    userAgent: string;
    expiresAt: number;
}

interface ParsedChapterUrl {
    seriesId: string;
    bookId: string;
    expectedPageCount: number;
}

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

function normalizeForSearch(value?: string): string {
    if (!value) return '';
    return value
        .replace(/[-_.]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function seriesPageUrl(seriesId: string): string {
    return `${SITE_BASE}/series/${seriesId}`;
}

function chapterReaderUrl(seriesId: string, bookId: string, pageCount: number): string {
    const url = new URL(`${SITE_BASE}/series/${seriesId}/reader/${bookId}`);
    if (pageCount > 0) {
        url.searchParams.set('pages', String(pageCount));
    }
    return url.href;
}

function parseChapterUrl(url: string): ParsedChapterUrl {
    const parsed = new URL(url, SITE_BASE);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const seriesIdx = segments.indexOf('series');
    const readerIdx = segments.indexOf('reader');
    if (seriesIdx < 0 || readerIdx < 0 || segments.length < readerIdx + 2) {
        throw new Error(`Invalid Kagane chapter URL: ${url}`);
    }
    const expectedPageCount = Number(parsed.searchParams.get('pages') || '0');
    return {
        seriesId: segments[seriesIdx + 1],
        bookId: segments[readerIdx + 1],
        expectedPageCount: Number.isFinite(expectedPageCount) ? expectedPageCount : 0,
    };
}

function scoreSearchItem(item: KaganeSearchItem, variant: string): number {
    const candidates = [item.title, ...(item.alternate_titles || [])].filter(Boolean);
    return Math.max(...candidates.map(title => calculateTitleSimilarity(title, variant)), 0);
}

const KAGANE_CF_HELP = 'Set KAGANE_FLARESOLVERR_URL (or FLARESOLVERR_URL) for automatic Cloudflare bypass, or export KAGANE_CF_CLEARANCE (+ KAGANE_CF_USER_AGENT) from a browser session on kagane.to.';

function parseFlareSolverrJsonPayload(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error('FlareSolverr returned empty response body');
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (preMatch) {
            const inner = preMatch[1].replace(/\\/g, '').trim();
            return JSON.parse(inner);
        }
        throw new Error(`FlareSolverr response was not JSON: ${trimmed.slice(0, 200)}`);
    }
}

function integrityExpiryMs(data: KaganeIntegrityResponse): number {
    if (typeof data.exp === 'number' && data.exp > 0) {
        return data.exp > 1_000_000_000_000 ? data.exp : data.exp * 1000;
    }
    return Date.now() + 4 * 60 * 1000;
}

export class KaganeScraper implements IChapterScraper {
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 2;
    private static integritySessionCache: KaganeIntegritySession | null = null;
    private static cfSessionCache: KaganeCfSession | null = null;
    private static integritySessionPromise: Promise<KaganeIntegritySession> | null = null;
    private static cfSessionPromise: Promise<KaganeCfSession> | null = null;

    private readonly metadata: ScraperMetadata = {
        id: 'kagane',
        name: 'Kagane',
        baseUrl: SITE_BASE,
        priority: appConfig.scraper.kagane.priority,
        enabled: appConfig.scraper.kagane.enabled,
        searchTimeoutMs: 130_000,
    };

    // Egress agents (bare keep-alive, or proxy agents when the flag is on) come from
    // scraperEgress so Kagane's direct axios calls honour the configured proxy.
    private static readonly agents = buildAgents('kagane');
    private static readonly httpAgent = KaganeScraper.agents.httpAgent;
    private static readonly httpsAgent = KaganeScraper.agents.httpsAgent;

    private static async getBrowser() {
        if (KaganeScraper.browserPool.length > 0) {
            return KaganeScraper.browserPool.pop();
        }
        logger.debug('[Kagane] Launching new browser for pool', { service: 'kaganeScraper' });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
            proxy: getPlaywrightProxy('kagane'),
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            if (!browser.isConnected()) {
                await browser.close().catch(() => {});
                return;
            }
            if (KaganeScraper.browserPool.length < KaganeScraper.MAX_BROWSERS) {
                KaganeScraper.browserPool.push(browser);
            } else {
                await browser.close().catch(() => {});
            }
        } catch {
            await browser.close().catch(() => {});
        }
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    async canHandle(_mangaName: string, _seriesId?: number): Promise<boolean> {
        return true;
    }

    private buildSearchVariants(mangaName: string, options?: SearchOptions): string[] {
        const baseVariants = [
            mangaName,
            options?.romanizedTitle,
            options?.nativeTitle,
            ...(options?.secondaryTitles || []),
        ].filter((v): v is string => !!v && v.length > 0);

        const normalizedExtras = baseVariants
            .map(v => normalizeForSearch(v))
            .filter(v => v && !baseVariants.includes(v));

        return [...baseVariants, ...normalizedExtras];
    }

    private kaganeApiHeaders(session: KaganeIntegritySession, method: 'GET' | 'POST' = 'POST', cfClearance?: string): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: 'application/json, text/plain, */*',
            Origin: SITE_BASE,
            Referer: `${SITE_BASE}/`,
            'User-Agent': session.userAgent,
            'X-Integrity-Token': session.token,
        };
        if (cfClearance) {
            headers.Cookie = `cf_clearance=${cfClearance}`;
        }
        if (method === 'POST') {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    private async resolveCfClearance(): Promise<string | undefined> {
        const cached = KaganeScraper.cfSessionCache;
        if (cached && Date.now() < cached.expiresAt - 60_000) {
            return cached.cfClearance;
        }

        const envClearance = process.env.KAGANE_CF_CLEARANCE?.trim();
        if (envClearance) return envClearance;

        if (hasFlareSolverr(appConfig.scraper.kagane.flareSolverrUrl)) {
            return (await this.getCfSession()).cfClearance;
        }

        return undefined;
    }

    private invalidateKaganeSessions(): void {
        this.invalidateIntegritySession();
        KaganeScraper.cfSessionCache = null;
        KaganeScraper.cfSessionPromise = null;
    }

    private isCloudflareBlock(status: number, body: string): boolean {
        return status === 403 && /just a moment|cloudflare/i.test(body);
    }

    private async searchApi(query: string, limit: number, allowRetry = true): Promise<KaganeSearchItem[]> {
        const q = (query || '').trim();
        if (!q) return [];

        const session = await this.getIntegritySession();
        const cfClearance = await this.resolveCfClearance();
        const response = await axios.post<KaganeSearchResponse>(
            `${API_BASE}/api/v2/search/series?page=0&size=${Math.max(limit, 12)}`,
            { title: q },
            {
                timeout: appConfig.scraper.kagane.timeout,
                httpAgent: KaganeScraper.httpAgent,
                httpsAgent: KaganeScraper.httpsAgent,
                headers: this.kaganeApiHeaders(session, 'POST', cfClearance),
                validateStatus: () => true,
            }
        );

        if ((response.status === 401 || response.status === 403) && allowRetry) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
            if (this.isCloudflareBlock(response.status, body)) {
                logger.warn('[Kagane] Search API blocked by Cloudflare — refreshing CF and integrity session', { service: 'kaganeScraper' });
                this.invalidateKaganeSessions();
                return this.searchApi(query, limit, false);
            }
            logger.warn(`[Kagane] Search API returned ${response.status} — refreshing integrity session`, { service: 'kaganeScraper' });
            this.invalidateIntegritySession();
            return this.searchApi(query, limit, false);
        }

        if (response.status < 200 || response.status >= 300) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
            throw new Error(`Search API failed (${response.status}): ${body.slice(0, 300)}`);
        }

        return response.data?.content || [];
    }

    private async fetchSeries(seriesId: string, allowRetry = true): Promise<KaganeSeriesResponse> {
        const session = await this.getIntegritySession();
        const cfClearance = await this.resolveCfClearance();
        const response = await axios.get<KaganeSeriesResponse>(
            `${API_BASE}/api/v2/series/${seriesId}`,
            {
                timeout: appConfig.scraper.kagane.timeout,
                httpAgent: KaganeScraper.httpAgent,
                httpsAgent: KaganeScraper.httpsAgent,
                headers: this.kaganeApiHeaders(session, 'GET', cfClearance),
                validateStatus: () => true,
            }
        );

        if ((response.status === 401 || response.status === 403) && allowRetry) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
            if (this.isCloudflareBlock(response.status, body)) {
                logger.warn('[Kagane] Series API blocked by Cloudflare — refreshing CF and integrity session', { service: 'kaganeScraper' });
                this.invalidateKaganeSessions();
                return this.fetchSeries(seriesId, false);
            }
            logger.warn(`[Kagane] Series API returned ${response.status} — refreshing integrity session`, { service: 'kaganeScraper' });
            this.invalidateIntegritySession();
            return this.fetchSeries(seriesId, false);
        }

        if (response.status < 200 || response.status >= 300) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
            throw new Error(`Series API failed (${response.status}): ${body.slice(0, 300)}`);
        }

        if (!response.data?.series_id) {
            throw new Error(`Invalid series response for ${seriesId}`);
        }
        return response.data;
    }

    async findBestMatch(mangaName: string, options?: SearchOptions): Promise<MangaSearchResult | undefined> {
        try {
            const variants = this.buildSearchVariants(mangaName, options);
            logger.info(`[Kagane] Trying ${variants.length} search variants`, { service: 'kaganeScraper' });

            for (const variant of variants) {
                logger.info(`[Kagane] Searching for "${variant}"`, { service: 'kaganeScraper' });
                const results = await this.searchApi(variant, 12);
                if (results.length === 0) continue;

                const scored = results
                    .map(item => ({
                        href: seriesPageUrl(item.series_id),
                        title: item.title,
                        score: scoreSearchItem(item, variant),
                    }))
                    .filter(r => r.title && r.score >= 70)
                    .sort((a, b) => b.score - a.score);

                if (scored.length > 0) {
                    const best = scored[0];
                    logger.info(`[Kagane] Found match: "${best.title}" (score: ${best.score})`, { service: 'kaganeScraper' });
                    return best;
                }
            }

            logger.warn(`[Kagane] Could not find manga for "${mangaName}"`, { service: 'kaganeScraper' });
            return undefined;
        } catch (error) {
            logger.error(`[Kagane] Search error: ${error}`, { service: 'kaganeScraper' });
            throw error;
        }
    }

    async search(query: string, _options?: SearchOptions, limit = 10): Promise<MangaSearchResult[]> {
        const q = (query || '').trim();
        if (!q) return [];

        try {
            const results = await this.searchApi(q, Math.max(limit, 20));
            return results
                .map(item => ({
                    href: seriesPageUrl(item.series_id),
                    title: item.title,
                    score: scoreSearchItem(item, q),
                }))
                .filter(r => r.title && r.score >= 50)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        } catch (error) {
            logger.error(`[Kagane] search() failed: ${error}`, { service: 'kaganeScraper' });
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
        let seriesUuid: string;

        if (mangaPageUrl) {
            const segments = new URL(mangaPageUrl, SITE_BASE).pathname.split('/').filter(Boolean);
            const seriesIdx = segments.indexOf('series');
            seriesUuid = seriesIdx >= 0 ? segments[seriesIdx + 1] : segments[segments.length - 1];
            logger.info(`[Kagane] Using saved URL for "${mangaName}"`, { service: 'kaganeScraper' });
        } else {
            const bestMatch = await this.findBestMatch(mangaName, {
                seriesId,
                romanizedTitle,
                nativeTitle,
                secondaryTitles,
                coverUrl,
            });
            if (!bestMatch) {
                throw new Error(`Could not find manga link for "${mangaName}"`);
            }
            seriesUuid = new URL(bestMatch.href, SITE_BASE).pathname.split('/').filter(Boolean).pop() || '';
            logger.info(`[Kagane] Found series page: ${bestMatch.href} (${bestMatch.title})`, { service: 'kaganeScraper' });
        }

        if (!seriesUuid) {
            throw new Error(`Could not extract series ID from URL for "${mangaName}"`);
        }

        const series = await this.fetchSeries(seriesUuid);
        const books = [...(series.series_books || [])].sort((a, b) => {
            const aSort = a.sort_no ?? Number(a.chapter_no) ?? 0;
            const bSort = b.sort_no ?? Number(b.chapter_no) ?? 0;
            return aSort - bSort;
        });

        logger.info(`[Kagane] Found ${books.length} chapters (API)`, { service: 'kaganeScraper' });

        for (const book of books) {
            const title = book.title || (book.chapter_no ? `Chapter ${book.chapter_no}` : 'Chapter');
            const parsed = ChapterNumberParser.parse(title);

            if (await checkExists(parsed.number)) {
                logger.debug(`[Kagane] Skipping chapter ${parsed.number} - already exists`, { service: 'kaganeScraper' });
                continue;
            }

            yield {
                url: chapterReaderUrl(seriesUuid, book.book_id, book.page_count || 0),
                title: parsed.title,
                number: parsed.number,
                isSpecial: parsed.isSpecial,
                specialType: parsed.specialType,
            };
        }
    }

    private async requestFlareSolverr(payload: Record<string, unknown>): Promise<FlareSolverrResult> {
        const flareSolverrUrl = resolveFlareSolverrUrl(appConfig.scraper.kagane.flareSolverrUrl);
        if (!flareSolverrUrl) {
            throw new Error('FlareSolverr URL is not configured');
        }
        return requestFlareSolverr(flareSolverrUrl, payload);
    }

    private flareSessionFromSolution(solution: FlareSolverrResult['solution']): KaganeCfSession {
        const cookies = solution?.cookies || [];
        const clearance = cookies.find(cookie => cookie.name === 'cf_clearance');
        if (!clearance?.value) {
            throw new Error('FlareSolverr response missing cf_clearance cookie');
        }

        const expirySeconds = clearance.expiry && clearance.expiry > 0 ? clearance.expiry : Math.floor(Date.now() / 1000) + 1800;
        return {
            cfClearance: clearance.value,
            userAgent: solution?.userAgent || appConfig.scraper.kagane.userAgent,
            expiresAt: expirySeconds * 1000,
        };
    }

    private async getCfSessionViaFlareSolverr(): Promise<KaganeCfSession> {
        logger.info('[Kagane] Requesting Cloudflare clearance via FlareSolverr', { service: 'kaganeScraper' });
        const result = await this.requestFlareSolverr({
            cmd: 'request.get',
            url: `${SITE_BASE}/`,
            maxTimeout: 120000,
        });
        return this.flareSessionFromSolution(result.solution);
    }

    private async getCfSessionViaPlaywright(): Promise<KaganeCfSession> {
        const browser = await KaganeScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.kagane.userAgent,
            viewport: { width: 1366, height: 768 },
            locale: 'en-US',
        });
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        const envClearance = process.env.KAGANE_CF_CLEARANCE?.trim();
        if (envClearance) {
            await context.addCookies([
                { name: 'cf_clearance', value: envClearance, domain: '.kagane.to', path: '/' },
            ]);
        }

        const page = await context.newPage();
        try {
            await page.goto(SITE_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
            for (let i = 0; i < 60; i++) {
                const cookies = await context.cookies();
                const clearance = cookies.find((cookie: { name: string; value: string; expires?: number }) => cookie.name === 'cf_clearance');
                if (clearance?.value) {
                    return {
                        cfClearance: clearance.value,
                        userAgent: appConfig.scraper.kagane.userAgent,
                        expiresAt: (clearance.expires && clearance.expires > 0 ? clearance.expires : Math.floor(Date.now() / 1000) + 1800) * 1000,
                    };
                }
                const title = await page.title();
                if (!title.includes('Just a moment')) break;
                await page.waitForTimeout(2000);
            }
            throw new Error(`Playwright could not obtain cf_clearance within timeout. ${KAGANE_CF_HELP}`);
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await KaganeScraper.releaseBrowser(browser);
        }
    }

    private async getCfSession(): Promise<KaganeCfSession> {
        if (KaganeScraper.cfSessionCache && Date.now() < KaganeScraper.cfSessionCache.expiresAt - 60_000) {
            return KaganeScraper.cfSessionCache;
        }

        const envClearance = process.env.KAGANE_CF_CLEARANCE?.trim();
        if (envClearance) {
            const session: KaganeCfSession = {
                cfClearance: envClearance,
                userAgent: process.env.KAGANE_CF_USER_AGENT?.trim() || appConfig.scraper.kagane.userAgent,
                expiresAt: Date.now() + 30 * 60 * 1000,
            };
            KaganeScraper.cfSessionCache = session;
            return session;
        }

        if (!KaganeScraper.cfSessionPromise) {
            KaganeScraper.cfSessionPromise = (async () => {
                try {
                    if (hasFlareSolverr(appConfig.scraper.kagane.flareSolverrUrl)) {
                        return await this.getCfSessionViaFlareSolverr();
                    }
                    return await this.getCfSessionViaPlaywright();
                } finally {
                    KaganeScraper.cfSessionPromise = null;
                }
            })();
        }

        const session = await KaganeScraper.cfSessionPromise;
        KaganeScraper.cfSessionCache = session;
        return session;
    }

    private async fetchIntegrityViaAxios(session: KaganeCfSession): Promise<KaganeIntegrityResponse> {
        const response = await axios.post<KaganeIntegrityResponse>(
            `${SITE_BASE}/api/integrity`,
            {},
            {
                timeout: appConfig.scraper.kagane.timeout,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Origin: SITE_BASE,
                    Referer: `${SITE_BASE}/`,
                    'User-Agent': session.userAgent,
                    Cookie: `cf_clearance=${session.cfClearance}`,
                },
                validateStatus: () => true,
            }
        );

        if (response.status < 200 || response.status >= 300) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            throw new Error(`Integrity request failed (${response.status}): ${body.slice(0, 300)}`);
        }
        if (!response.data?.token) {
            throw new Error('Integrity response missing token');
        }
        return response.data;
    }

    private async fetchIntegrityViaFlareSolverr(): Promise<{ data: KaganeIntegrityResponse; userAgent: string }> {
        logger.info('[Kagane] Requesting integrity token via FlareSolverr', { service: 'kaganeScraper' });
        const result = await this.requestFlareSolverr({
            cmd: 'request.post',
            url: `${SITE_BASE}/api/integrity`,
            postData: '',
            maxTimeout: 120000,
        });
        const raw = result.solution?.response || '';
        const parsed = parseFlareSolverrJsonPayload(raw) as KaganeIntegrityResponse;
        if (!parsed?.token) {
            throw new Error('FlareSolverr integrity response missing token');
        }
        const userAgent = result.solution?.userAgent || appConfig.scraper.kagane.userAgent;
        const session = this.flareSessionFromSolution(result.solution);
        KaganeScraper.cfSessionCache = { ...session, userAgent };
        return { data: parsed, userAgent };
    }

    private async resolveIntegritySession(): Promise<KaganeIntegritySession> {
        if (KaganeScraper.integritySessionCache && Date.now() < KaganeScraper.integritySessionCache.expiresAt - 30_000) {
            return KaganeScraper.integritySessionCache;
        }

        const envToken = process.env.KAGANE_INTEGRITY_TOKEN?.trim();
        if (envToken) {
            return {
                token: envToken,
                userAgent: process.env.KAGANE_CF_USER_AGENT?.trim() || appConfig.scraper.kagane.userAgent,
                expiresAt: Date.now() + 4 * 60 * 1000,
            };
        }

        let data: KaganeIntegrityResponse;
        let userAgent = appConfig.scraper.kagane.userAgent;
        if (hasFlareSolverr(appConfig.scraper.kagane.flareSolverrUrl)) {
            const flareResult = await this.fetchIntegrityViaFlareSolverr();
            data = flareResult.data;
            userAgent = flareResult.userAgent;
        } else {
            const cfSession = await this.getCfSession();
            data = await this.fetchIntegrityViaAxios(cfSession);
            userAgent = cfSession.userAgent;
        }

        const session: KaganeIntegritySession = {
            token: data.token,
            userAgent,
            expiresAt: integrityExpiryMs(data),
        };
        KaganeScraper.integritySessionCache = session;
        return session;
    }

    private async getIntegritySession(): Promise<KaganeIntegritySession> {
        if (KaganeScraper.integritySessionCache && Date.now() < KaganeScraper.integritySessionCache.expiresAt - 30_000) {
            return KaganeScraper.integritySessionCache;
        }

        const envToken = process.env.KAGANE_INTEGRITY_TOKEN?.trim();
        if (envToken) {
            return {
                token: envToken,
                userAgent: process.env.KAGANE_CF_USER_AGENT?.trim() || appConfig.scraper.kagane.userAgent,
                expiresAt: Date.now() + 4 * 60 * 1000,
            };
        }

        if (!KaganeScraper.integritySessionPromise) {
            KaganeScraper.integritySessionPromise = this.resolveIntegritySession()
                .catch((error) => {
                    KaganeScraper.integritySessionCache = null;
                    throw error;
                })
                .finally(() => {
                    KaganeScraper.integritySessionPromise = null;
                });
        }

        return KaganeScraper.integritySessionPromise;
    }

    private invalidateIntegritySession(): void {
        KaganeScraper.integritySessionCache = null;
        KaganeScraper.integritySessionPromise = null;
    }

    private async fetchBookManifest(bookId: string, allowRetry = true): Promise<KaganeBookResponse> {
        const session = await this.getIntegritySession();
        const cfClearance = await this.resolveCfClearance();
        const response = await axios.post<KaganeBookResponse>(
            `${API_BASE}/api/v2/books/${bookId}?is_datasaver=false`,
            {},
            {
                timeout: appConfig.scraper.kagane.timeout,
                httpAgent: KaganeScraper.httpAgent,
                httpsAgent: KaganeScraper.httpsAgent,
                headers: this.kaganeApiHeaders(session, 'POST', cfClearance),
                validateStatus: () => true,
            }
        );

        if ((response.status === 401 || response.status === 403) && allowRetry) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
            if (this.isCloudflareBlock(response.status, body)) {
                logger.warn('[Kagane] Books API blocked by Cloudflare — refreshing CF and integrity session', { service: 'kaganeScraper' });
                this.invalidateKaganeSessions();
                return this.fetchBookManifest(bookId, false);
            }
            logger.warn(`[Kagane] Books API returned ${response.status} — refreshing integrity session`, { service: 'kaganeScraper' });
            this.invalidateIntegritySession();
            return this.fetchBookManifest(bookId, false);
        }

        if (response.status < 200 || response.status >= 300) {
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            throw new Error(`Books API failed (${response.status}): ${body.slice(0, 300)}`);
        }

        const manifest = response.data?.manifest;
        if (!manifest?.pages?.length || !response.data.cache_url || !response.data.access_token) {
            throw new Error(`Invalid book manifest for ${bookId}`);
        }
        return response.data;
    }

    private buildPageUrls(bookId: string, bookData: KaganeBookResponse): string[] {
        const cacheBase = bookData.cache_url.endsWith('/') ? bookData.cache_url : `${bookData.cache_url}/`;
        return bookData.manifest.pages.map(page => {
            const url = new URL(`api/v2/books/page/${bookId}/${page.page_id}.${page.ext}`, cacheBase);
            url.searchParams.set('is_datasaver', 'false');
            url.searchParams.set('token', bookData.access_token);
            return url.href;
        });
    }

    private async downloadImages(imageUrls: string[], seriesId: number, chapterNumber: string, referer: string, userAgent: string): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        const maxRetries = 3;
        const retryDelayMs = 1000;
        const batchSize = 8;

        const downloadImage = async (imageUrl: string, i: number) => {
            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await axios.get(imageUrl, {
                        responseType: 'stream',
                        timeout: 20000,
                        maxRedirects: 5,
                        httpAgent: KaganeScraper.httpAgent,
                        httpsAgent: KaganeScraper.httpsAgent,
                        headers: {
                            Referer: referer,
                            'User-Agent': userAgent,
                            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        },
                    });

                    await objectStorageService.transformAndUploadPage(storagePrefix, i, response.data);
                    return;
                } catch (err: any) {
                    lastError = err;
                    const errorMsg = err.message || String(err);
                    const isRetryable =
                        errorMsg.includes('ECONNRESET') ||
                        errorMsg.includes('ECONNABORTED') ||
                        errorMsg.includes('ETIMEDOUT') ||
                        err.code === 'ECONNRESET' ||
                        err.code === 'ECONNABORTED' ||
                        err.code === 'ETIMEDOUT';

                    if (isRetryable && attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
                        continue;
                    }
                    const described = describeError(lastError);
                    const stageError = new ScraperStageError({
                        stage: 'download_image',
                        message: described.message,
                        scraperId: this.metadata.id,
                        scraperName: this.metadata.name,
                        url: referer,
                        pageNumber: i + 1,
                        pageCount: imageUrls.length,
                        imageUrl,
                        attempts: attempt,
                        httpStatus: described.httpStatus,
                        code: described.code,
                        cause: lastError,
                    });
                    logger.error(stageError.message, { service: 'kaganeScraper', ...stageError.toLogDetail() });
                    throw stageError;
                }
            }
        };

        for (let batchStart = 0; batchStart < imageUrls.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, imageUrls.length);
            await Promise.all(
                imageUrls.slice(batchStart, batchEnd).map((imageUrl, localIndex) =>
                    downloadImage(imageUrl, batchStart + localIndex)
                )
            );
        }

        return storagePrefix;
    }

    private async saveDataUrlImages(dataUrls: string[], seriesId: number, chapterNumber: string): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;

        for (let i = 0; i < dataUrls.length; i++) {
            const base64 = dataUrls[i].replace(/^data:image\/[^;]+;base64,/, '');
            const buffer = Buffer.from(base64, 'base64');
            await objectStorageService.transformAndUploadPage(storagePrefix, i, buffer);
        }

        return storagePrefix;
    }

    private async downloadViaReader(url: string, seriesId: number, chapterNumber: string, expectedPageCount: number): Promise<DownloadedChapter> {
        const cfSession = await this.getCfSession();
        const browser = await KaganeScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: cfSession.userAgent,
            viewport: { width: 1280, height: 900 },
        });
        await context.addCookies([
            { name: 'cf_clearance', value: cfSession.cfClearance, domain: '.kagane.to', path: '/' },
        ]);

        const page = await context.newPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
            for (let i = 0; i < 45; i++) {
                const title = await page.title();
                if (!title.includes('Just a moment')) break;
                await page.waitForTimeout(2000);
            }

            await page.waitForSelector('.reader-pages-content', { timeout: 30000 }).catch(() => {});

            let lastCount = 0;
            for (let scrollAttempt = 0; scrollAttempt < 20; scrollAttempt++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
                await page.waitForTimeout(500);
                const count = await page.locator('[data-page] img').count();
                if (count === lastCount && count > 0 && (expectedPageCount <= 0 || count >= expectedPageCount)) {
                    break;
                }
                lastCount = count;
            }

            const dataUrls = await page.evaluate((expected: number) => {
                const containers = Array.from(document.querySelectorAll('.reader-pages-content [data-page]'));
                const sorted = containers.sort((a, b) => {
                    const aPage = Number(a.getAttribute('data-page') || '0');
                    const bPage = Number(b.getAttribute('data-page') || '0');
                    return aPage - bPage;
                });

                const results: string[] = [];
                for (const container of sorted) {
                    const img = container.querySelector('img');
                    if (!img) continue;

                    const width = img.naturalWidth || img.width;
                    const height = img.naturalHeight || img.height;
                    if (!width || !height) continue;

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;
                    ctx.drawImage(img, 0, 0);
                    results.push(canvas.toDataURL('image/webp', 0.92));
                }

                if (expected > 0 && results.length < expected) {
                    throw new Error(`Expected ${expected} pages but extracted ${results.length} from reader DOM`);
                }
                return results;
            }, expectedPageCount);

            if (dataUrls.length === 0) {
                throw new ScraperStageError({
                    stage: 'extract_images',
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    url,
                    message: 'Reader DOM produced no page images (Cloudflare block or layout change?)',
                });
            }

            const storagePrefix = await this.saveDataUrlImages(dataUrls, seriesId, chapterNumber);
            return { storagePrefix, pageCount: dataUrls.length };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await KaganeScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(url: string, seriesId: number, chapterNumber: string, mangaName: string, folderName: string): Promise<DownloadedChapter> {
        const { bookId, expectedPageCount } = parseChapterUrl(url);
        const referer = url;

        try {
            const integritySession = await this.getIntegritySession();
            const bookData = await this.fetchBookManifest(bookId);
            const imageUrls = this.buildPageUrls(bookId, bookData);

            if (expectedPageCount > 0 && imageUrls.length !== expectedPageCount) {
                logger.warn(
                    `[Kagane] Page count mismatch for ${folderName}: expected ${expectedPageCount}, manifest has ${imageUrls.length}`,
                    { service: 'kaganeScraper' }
                );
            }

            logger.info(
                `[Kagane] Downloading ${imageUrls.length} pages for chapter ${chapterNumber} (books API)`,
                { service: 'kaganeScraper' }
            );

            const storagePrefix = await this.downloadImages(imageUrls, seriesId, chapterNumber, referer, integritySession.userAgent);
            return { storagePrefix, pageCount: imageUrls.length };
        } catch (apiError: any) {
            const message = apiError?.message || String(apiError);
            const isCloudflareBlock = message.includes('Integrity request failed (403)') || message.includes('cf_clearance') || message.includes('FlareSolverr');
            const isBooksAuthFailure = message.includes('Books API failed (401)') || message.includes('status code 401');
            if (isBooksAuthFailure) {
                this.invalidateIntegritySession();
            }
            if (isCloudflareBlock) {
                throw new Error(`[Kagane] ${folderName}: ${message}. ${KAGANE_CF_HELP}`);
            }

            logger.warn(
                `[Kagane] Books API failed for ${folderName}: ${message}. Falling back to reader.`,
                { service: 'kaganeScraper' }
            );
            return this.downloadViaReader(url, seriesId, chapterNumber, expectedPageCount);
        }
    }
}
