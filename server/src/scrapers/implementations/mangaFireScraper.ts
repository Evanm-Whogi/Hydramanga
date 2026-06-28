/**
 * MangaFire Scraper Implementation
 *
 * Scraper for mangafire.to manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 *
 * Site characteristics (verified from live behaviour + public extractor logs):
 * - Manga pages:   https://mangafire.to/manga/<slug>.<shortId>
 * - Reader pages:  https://mangafire.to/read/<slug>.<shortId>/<lang>/chapter-<n>
 * - Search:        GET /filter?keyword=<q>&vrf=<token>   (HTML; results are `.unit`
 *                  cards linking to /manga/<slug>.<shortId>; VRF from scrapers/lib/mangaFireVrf.ts)
 * - Chapter list:  GET /ajax/read/<shortId>/chapter/<lang>?vrf=<token>
 *                  -> { status, result: { html: "<a data-number=… href=…>…</a>" } }
 *                  VRF input: `<shortId>@chapter@<lang>`.
 * - Chapter images: GET /ajax/read/chapter/<chapterId>?vrf=<token>
 *                  -> { status, result: { images: [[url, type, scrambleOffset], …] } }
 *                  VRF input: `chapter@<chapterId>`. Primary download path uses this
 *                  API; Playwright reader capture is kept as fallback for scrambled pages.
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
import { generateMangaFireVrf } from '@/scrapers/lib/mangaFireVrf';
import { ScraperStageError, describeError } from '@/scrapers/lib/scraperError';

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

/** Decode a handful of common HTML entities found in MangaFire markup. */
function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
    return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function attr(tag: string, name: string): string | undefined {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : undefined;
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
    // MangaFire serves both full manga pages (portrait, ~700-1100px wide) and
    // long-strip webtoons sliced into wide, short horizontal bands (e.g. 720x130).
    // Validation keys off a minimum width shared by both formats plus a small
    // minimum height, so short webtoon slices are kept while thumbnails, icons and
    // CDN error blobs are still rejected. A taller short-edge assumption would
    // discard legitimate webtoon strips and needlessly fail their chapters.
    private static readonly MIN_CHAPTER_IMAGE_WIDTH = 320;
    private static readonly MIN_CHAPTER_IMAGE_HEIGHT = 96;
    private static readonly MIN_IMAGE_NATURAL_WIDTH = 320;
    private static readonly MIN_IMAGE_NATURAL_HEIGHT = 96;
    // Only meant to short-circuit truly empty/error responses; real strips can be
    // very small once compressed, so dimension validation is the real gate.
    private static readonly MIN_IMAGE_DOWNLOAD_BYTES = 256;
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
        return (
            width >= MangaFireScraper.MIN_CHAPTER_IMAGE_WIDTH &&
            height >= MangaFireScraper.MIN_CHAPTER_IMAGE_HEIGHT
        );
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

    /** Extract the short id from a /manga/<slug>.<id> or /read/<slug>.<id>/… URL. */
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
        // The slug segment is the one shaped "<slug>.<id>" (after a /manga/ or
        // /read/ prefix). Prefer the first such segment so /read/<slug>.<id>/<lang>/…
        // resolves to the id, not the trailing chapter segment.
        const idx = segments.findIndex(s => s === 'manga' || s === 'read');
        const slugSeg = idx >= 0 && segments[idx + 1] ? segments[idx + 1] : undefined;
        const candidate = slugSeg || segments.find(s => s.includes('.')) || segments[segments.length - 1] || '';
        const dot = candidate.lastIndexOf('.');
        const id = dot >= 0 ? candidate.slice(dot + 1) : candidate;
        return id || undefined;
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
    // Search  (GET /filter?keyword=…  -> .unit cards)
    // ---------------------------------------------------------------------

    private parseSearchHtml(html: string): Array<{ href: string; title: string }> {
        const results: Array<{ href: string; title: string }> = [];
        const seen = new Set<string>();

        // Each result card links to /manga/<slug>.<id>; the poster anchor carries a
        // title attribute, and a sibling info anchor repeats the title text.
        const anchorRe = /<a\b[^>]*href="([^"]*\/manga\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = anchorRe.exec(html)) !== null) {
            const rawHref = m[1];
            const tag = m[0].slice(0, m[0].indexOf('>') + 1);
            const inner = m[2];

            let href: string;
            try {
                href = rawHref.startsWith('http') ? rawHref : new URL(rawHref, SITE_BASE).href;
            } catch {
                continue;
            }
            // Keep canonical /manga/<slug>.<id> only (skip /read/… deep links).
            if (!/\/manga\/[^/]+/.test(href)) continue;
            href = href.split('#')[0];
            if (seen.has(href)) continue;

            const title =
                decodeHtmlEntities(attr(tag, 'title') || '') ||
                stripTags(inner) ||
                '';
            if (!title) continue;

            seen.add(href);
            results.push({ href, title });
        }
        return results;
    }

    private async searchMangaFire(query: string, limit: number): Promise<MangaSearchResponse> {
        const q = (query || '').trim();
        if (!q) return { results: [], summary: `Search "${q}" -> 0 results` };
        try {
            const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/filter`, {
                params: { keyword: q, vrf: generateMangaFireVrf(q) },
                headers: { Referer: `${SITE_BASE}/` },
                responseType: 'text',
                timeout: appConfig.scraper.mangaFire.timeout,
            });

            const rows = this.parseSearchHtml(String(response.data || ''));
            logger.info(`[MangaFire] Search "${q}" -> ${rows.length} row(s)`, { service: 'mangaFireScraper' });

            const results = rows
                .map(r => ({ href: r.href, title: r.title, score: calculateTitleSimilarity(r.title, q) }))
                .filter(r => r.href && r.title && r.score >= 50)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            const top = results[0];
            const summary = top
                ? `Search "${q}" -> ${rows.length} row(s); top: "${top.title}" (score: ${top.score})`
                : `Search "${q}" -> ${rows.length} row(s)`;
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
    // Chapter discovery  (GET /ajax/read/<shortId>/chapter/<lang>)
    // ---------------------------------------------------------------------

    private parseChapterListHtml(
        html: string,
    ): Array<{ url: string; title: string; number: string; chapterId?: string; isSpecial: boolean; specialType?: string }> {
        const out: Array<{ url: string; title: string; number: string; chapterId?: string; isSpecial: boolean; specialType?: string }> =
            [];

        const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = anchorRe.exec(html)) !== null) {
            const tag = `<a ${m[1]}>`;
            const inner = m[2];
            const rawHref = attr(tag, 'href');
            if (!rawHref) continue;

            let href: string;
            try {
                href = rawHref.startsWith('http') ? rawHref : new URL(rawHref, SITE_BASE).href;
            } catch {
                continue;
            }
            // Reader chapter links look like /read/<slug>.<id>/<lang>/chapter-<n>.
            if (!/\/read\//.test(href)) continue;

            const dataNumber = attr(tag, 'data-number');
            const chapterId = attr(tag, 'data-id');
            const text = stripTags(inner);
            // The anchor text already reads like "Chapter 8: The End"; feed that
            // straight to the parser. data-number is only an authoritative override
            // for the numeric value when present.
            const label = text || (dataNumber ? `Chapter ${dataNumber}` : href);
            const parsed = ChapterNumberParser.parse(label);

            out.push({
                url: href,
                title: parsed.title,
                number: dataNumber || parsed.number,
                chapterId: chapterId || undefined,
                isSpecial: parsed.isSpecial,
                specialType: parsed.specialType,
            });
        }
        return out;
    }

    private async fetchChapterList(
        shortId: string,
        lang: string,
    ): Promise<Array<{ url: string; title: string; number: string; chapterId?: string; isSpecial: boolean; specialType?: string }>> {
        const vrfInput = `${shortId}@chapter@${lang}`;
        const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/ajax/read/${shortId}/chapter/${lang}`, {
            params: { vrf: generateMangaFireVrf(vrfInput) },
            headers: {
                Referer: `${SITE_BASE}/`,
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json, text/javascript, */*; q=0.01',
            },
            responseType: 'json',
            timeout: appConfig.scraper.mangaFire.timeout,
        });

        const data = response.data;
        const html: string | undefined = data?.result?.html ?? (typeof data?.result === 'string' ? data.result : undefined);
        if (!html) {
            logger.warn(
                `[MangaFire] Chapter-list ajax returned no html for shortId=${shortId} lang=${lang} ` +
                    `(status field=${data?.status})`,
                { service: 'mangaFireScraper' },
            );
            return [];
        }

        const chapters = this.parseChapterListHtml(html);
        // De-dupe by chapter number (lowest-position wins) and sort ascending.
        const byNumber = new Map<string, (typeof chapters)[number]>();
        for (const c of chapters) if (!byNumber.has(c.number)) byNumber.set(c.number, c);
        return Array.from(byNumber.values()).sort((a, b) =>
            ChapterNumberParser.compareNumbers(a.number, b.number),
        );
    }

    /** Parse /read/<slug>.<id>/<lang>/chapter-<n> reader URLs. */
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
        const parsed = MangaFireScraper.parseReaderUrl(readerUrl);
        if (!parsed) throw new Error(`[MangaFire] Could not parse reader URL "${readerUrl}"`);

        const targetPath = new URL(readerUrl, SITE_BASE).pathname.replace(/\/$/, '');
        const chapters = await this.fetchChapterList(parsed.shortId, parsed.lang);
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
        const response = await MangaFireScraper.axiosInstance.get(`${SITE_BASE}/ajax/read/chapter/${chapterId}`, {
            params: { vrf: generateMangaFireVrf(`chapter@${chapterId}`) },
            headers: {
                Referer: referer,
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json, text/javascript, */*; q=0.01',
            },
            responseType: 'json',
            timeout: appConfig.scraper.mangaFire.timeout,
        });

        const images: unknown = response.data?.result?.images;
        if (!Array.isArray(images) || !images.length) {
            throw new Error(`[MangaFire] Chapter ${chapterId} returned no images`);
        }

        const assets: MangaFirePageAsset[] = [];
        for (let i = 0; i < images.length; i++) {
            const entry = images[i];
            if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
            const scrambleOffset = Number(entry[2] || 0);
            if (scrambleOffset > 0) {
                throw new Error(`[MangaFire] Chapter ${chapterId} page ${i + 1} requires descrambling (offset=${scrambleOffset})`);
            }
            assets.push({ page: i + 1, imageUrl: entry[0], source: 'url' });
        }
        if (!assets.length) throw new Error(`[MangaFire] Chapter ${chapterId} image list was empty after parsing`);
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

        logger.info(`[MangaFire] "${mangaName}": shortId=${shortId}, lang=${DEFAULT_LANG}`, {
            service: 'mangaFireScraper',
        });

        const chapters = await this.fetchChapterList(shortId, DEFAULT_LANG);
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
        const minW = MangaFireScraper.MIN_IMAGE_NATURAL_WIDTH;
        const minH = MangaFireScraper.MIN_IMAGE_NATURAL_HEIGHT;
        const minCanvasW = MangaFireScraper.MIN_CHAPTER_IMAGE_WIDTH;
        const minCanvasH = MangaFireScraper.MIN_CHAPTER_IMAGE_HEIGHT;
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
                ({ minW, minH, canvasMinW, canvasMinH }: { minW: number; minH: number; canvasMinW: number; canvasMinH: number }) => {
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
                            !!img && img.complete && img.naturalWidth >= minW && img.naturalHeight >= minH;

                        const rect = node.getBoundingClientRect();
                        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight;
                        const canvas = node.querySelector('canvas') as HTMLCanvasElement | null;
                        const cw = canvas?.width || 0;
                        const ch = canvas?.height || 0;
                        const hasCanvas = !!canvas && visible && cw >= canvasMinW && ch >= canvasMinH;

                        if (imgReady && /^https?:\/\//i.test(src) && /\.(webp|jpg|jpeg|png|avif)(\?|$)/i.test(src)) {
                            out.push({ page: pageNum, imageUrl: src, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                        } else if (hasCanvas) {
                            out.push({ page: pageNum, hasCanvas, canvasWidth: cw, canvasHeight: ch });
                        }
                    });

                    return out;
                },
                { minW, minH, canvasMinW: minCanvasW, canvasMinH: minCanvasH },
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
                        const out = await sharp(raw, { failOn: 'none' }).webp({ lossless: true, effort: 4 }).toBuffer();
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
                            const out = await sharp(buffer, { failOn: 'none' }).webp({ quality: 90, effort: 4 }).toBuffer();
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