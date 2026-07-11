/**
 * WeebCentral Scraper Implementation
 *
 * Scraper for weebcentral.com manga source.
 * Implements the IChapterScraper interface for integration with ScraperManager.
 *
 * Features:
 * - Chapter list scraping with Playwright
 * - Images-first chapter download via /images HTMX fragment
 * - CF 429 Retry-After shared cooldown
 * - Search API integration via WeebCentralSearcher
 */

import { chromium } from 'playwright';
import { getPlaywrightProxy } from '@/scrapers/lib/scraperEgress';
import { isCloudflareInterstitial, recordScraperBlockedPage } from '@/scrapers/lib/scraperBanDetection';
import {
    IChapterScraper,
    ScrapedChapter,
    DownloadedChapter,
    MangaSearchResult,
    MangaSearchResponse,
    SearchOptions,
    ScraperMetadata,
} from '../interfaces/IChapterScraper';
import { WeebCentralSearcher } from '@/services/weebCentralSearcher';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { downloadAndStoreChapter } from '../lib/chapterImageDownloader';
import { ScraperStageError } from '../lib/scraperError';

const SERVICE = 'weebCentralScraper';
const DEFAULT_RETRY_AFTER_SEC = 10;
const MAX_RETRY_AFTER_SEC = 60;
const RETRY_AFTER_BUFFER_MS = 500;

/** Chapter image list fragment (HTMX) — preferred over the full reader page. */
function chapterImagesUrl(chapterUrl: string): string {
    return `${chapterUrl.replace(/\/$/, '')}/images?is_prev=False&current_page=1&reading_style=long_strip`;
}

/**
 * WeebCentral Scraper
 */
export class WeebCentralScraper implements IChapterScraper {
    private static browserPool: any[] = [];
    private static readonly MAX_BROWSERS = 2; // match queue concurrency
    private static rateLimitedUntil = 0;

    private readonly metadata: ScraperMetadata = {
        id: 'weebcentral',
        name: 'WeebCentral',
        baseUrl: 'https://weebcentral.com',
        priority: appConfig.scraper.weebCentral.priority,
        enabled: appConfig.scraper.weebCentral.enabled,
    };

    private static async getBrowser() {
        if (WeebCentralScraper.browserPool.length > 0) {
            return WeebCentralScraper.browserPool.pop();
        }
        logger.debug('[WeebCentral] Launching new browser for pool', { service: SERVICE });
        return chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
            proxy: getPlaywrightProxy('weebcentral'),
        });
    }

    private static async releaseBrowser(browser: any) {
        if (!browser) return;
        try {
            if (!browser.isConnected()) {
                await browser.close().catch(() => {});
                return;
            }
            if (WeebCentralScraper.browserPool.length < WeebCentralScraper.MAX_BROWSERS) {
                WeebCentralScraper.browserPool.push(browser);
                logger.debug(`[WeebCentral] Browser returned to pool (${WeebCentralScraper.browserPool.length}/${WeebCentralScraper.MAX_BROWSERS})`, { service: SERVICE });
            } else {
                await browser.close().catch(() => {});
                logger.debug('[WeebCentral] Browser closed (pool full)', { service: SERVICE });
            }
        } catch (error) {
            logger.warn(`[WeebCentral] Error releasing browser: ${error}`, { service: SERVICE });
            await browser.close().catch(() => {});
        }
    }

    private static markRateLimited(retryAfterSec: number): void {
        const sec = Math.min(MAX_RETRY_AFTER_SEC, Math.max(1, Math.ceil(retryAfterSec)));
        const until = Date.now() + sec * 1000 + RETRY_AFTER_BUFFER_MS;
        if (until <= WeebCentralScraper.rateLimitedUntil) return;
        WeebCentralScraper.rateLimitedUntil = until;
        logger.warn(`[WeebCentral] Cloudflare 429 — pausing navigations until ${new Date(until).toISOString()} (${sec}s)`, { service: SERVICE });
    }

    private static parseRetryAfterSec(response: { headers: () => Record<string, string> } | null | undefined): number {
        if (!response) return DEFAULT_RETRY_AFTER_SEC;
        const raw = response.headers()['retry-after'];
        if (!raw) return DEFAULT_RETRY_AFTER_SEC;
        const asNum = Number(raw);
        if (!Number.isNaN(asNum) && asNum >= 0) return asNum;
        const asDate = Date.parse(raw);
        if (!Number.isNaN(asDate)) return Math.max(1, Math.ceil((asDate - Date.now()) / 1000));
        return DEFAULT_RETRY_AFTER_SEC;
    }

    /** Wait out a shared CF 429 cooldown so parallel jobs don't stampede. */
    private static async awaitRateLimitCooldown(): Promise<void> {
        const waitMs = WeebCentralScraper.rateLimitedUntil - Date.now();
        if (waitMs <= 0) return;
        logger.info(`[WeebCentral] Waiting ${Math.ceil(waitMs / 1000)}s for rate-limit cooldown`, { service: SERVICE });
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    getMetadata(): ScraperMetadata {
        return { ...this.metadata };
    }

    /**
     * Navigate with shared 429 cooldown. On HTTP 429, records Retry-After and throws
     * ScraperStageError(RATE_LIMITED) so callers can wait+retry without VPN rotation.
     */
    private async gotoWithRateLimit(page: any, url: string, stage: 'scan' | 'navigate' | 'extract_images', options: { waitUntil?: 'domcontentloaded' | 'load'; timeout?: number } = {}): Promise<any> {
        await WeebCentralScraper.awaitRateLimitCooldown();
        const response = await page.goto(url, {
            waitUntil: options.waitUntil ?? 'domcontentloaded',
            timeout: options.timeout ?? 45000,
        });
        const status = response?.status?.() as number | undefined;
        if (status === 429) {
            const retryAfterSec = WeebCentralScraper.parseRetryAfterSec(response);
            WeebCentralScraper.markRateLimited(retryAfterSec);
            throw new ScraperStageError({
                stage,
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url,
                message: `Cloudflare rate limited (Retry-After ${retryAfterSec}s)`,
                httpStatus: 429,
                code: 'RATE_LIMITED',
            });
        }
        return response;
    }

    /** Throw when Playwright landed on a Cloudflare block/challenge instead of real content. */
    private async assertSeriesPageUsable(page: any, pageUrl: string, stage: 'scan' | 'navigate' = 'scan'): Promise<void> {
        const snapshot = await page.evaluate(() => ({
            title: document.title || '',
            body: (document.body?.innerText || '').slice(0, 4000),
        }));
        const kind = isCloudflareInterstitial(snapshot.title, snapshot.body);
        if (!kind) return;

        // Soft rate-limit page (body markers) — cooldown only, no VPN ban signal.
        const bodyLower = (snapshot.body || '').toLowerCase();
        if (kind === 'ban' && (bodyLower.includes('too many requests') || bodyLower.includes('rate limit'))) {
            WeebCentralScraper.markRateLimited(DEFAULT_RETRY_AFTER_SEC);
            throw new ScraperStageError({
                stage,
                scraperId: this.metadata.id,
                scraperName: this.metadata.name,
                url: pageUrl,
                message: `Cloudflare rate limited ("${snapshot.title.slice(0, 80)}")`,
                httpStatus: 429,
                code: 'RATE_LIMITED',
            });
        }

        recordScraperBlockedPage(this.metadata.id, {
            status: kind === 'ban' ? 403 : 503,
            body: `${snapshot.title}\n${snapshot.body}`,
        });
        throw new ScraperStageError({
            stage,
            scraperId: this.metadata.id,
            scraperName: this.metadata.name,
            url: pageUrl,
            message:
                kind === 'ban'
                    ? `Cloudflare blocked WeebCentral access ("${snapshot.title.slice(0, 80)}")`
                    : `Cloudflare challenge on WeebCentral ("${snapshot.title.slice(0, 80)}")`,
        });
    }

    private async extractImagesFromFragment(page: any, imagesUrl: string): Promise<string[]> {
        await page.waitForSelector('img', { timeout: 5000, state: 'attached' });
        await page.waitForTimeout(800);
        return page.evaluate((base: string) => {
            // Keep broken_image entries: when a page's CDN image fails, WeebCentral's
            // onerror swaps src to a relative /static/images/broken_image.jpg. Resolving
            // and keeping it preserves the page slot so the downloader can store our own
            // placeholder there (isPlaceholder) instead of dropping the page entirely.
            const resolve = (href: string) => {
                if (!href) return '';
                if (href.startsWith('http')) return href;
                try {
                    return new URL(href, base).href;
                } catch {
                    return '';
                }
            };
            return Array.from(document.querySelectorAll('img'))
                .map((img) => img.getAttribute('src') || img.getAttribute('data-src'))
                .map((src) => resolve(src || ''))
                .filter((href): href is string => !!href && href.startsWith('http'));
        }, imagesUrl);
    }

    async canHandle(mangaName: string, seriesId?: number): Promise<boolean> {
        return true;
    }

    async findBestMatch(mangaName: string, options?: SearchOptions): Promise<MangaSearchResult | undefined> {
        try {
            logger.info(`[WeebCentral] Searching for "${mangaName}"`, { service: SERVICE });

            const result = await WeebCentralSearcher.findBestMatch(
                mangaName,
                options?.romanizedTitle,
                options?.nativeTitle,
                options?.secondaryTitles,
                {
                    seriesId: options?.seriesId,
                    coverUrl: options?.coverUrl,
                    secondaryTitles: options?.secondaryTitles,
                }
            );

            if (result) {
                return {
                    href: result.href,
                    title: result.title,
                    score: result.score,
                };
            }

            return undefined;
        } catch (error) {
            logger.error(`[WeebCentral] Search failed for "${mangaName}": ${error}`, { service: SERVICE });
            throw error;
        }
    }

    async search(query: string, options?: SearchOptions, limit = 10): Promise<MangaSearchResponse> {
        try {
            const q = (query || '').trim();
            const results = await WeebCentralSearcher.queryAPI(q);
            const filtered = results
                .filter((r) => r.score > 0)
                .slice(0, limit)
                .map((r) => ({ href: r.href, title: r.title, score: r.score }));
            let summary: string;
            if (!results.length) {
                summary = `Search "${q}" -> 0 results`;
            } else {
                summary = `Top result for "${q}": "${results[0].title}" (score: ${results[0].score}); ${results.length} raw result(s)`;
                if (!filtered.length) summary += '; 0 passed score filter';
                else if (filtered.length < results.length) summary += `; ${filtered.length} shown`;
            }
            return { results: filtered, summary };
        } catch (error) {
            logger.error(`[WeebCentral] search() failed: ${error}`, { service: SERVICE });
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
        await WeebCentralScraper.awaitRateLimitCooldown();

        const browser = await WeebCentralScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        const page = await context.newPage();

        try {
            let pageUrl: string;

            if (mangaPageUrl) {
                pageUrl = mangaPageUrl;
                logger.info(`[WeebCentral] Using saved URL for "${mangaName}"`, { service: SERVICE });
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
                    logger.error(`[WeebCentral] ${error}`, { service: SERVICE });
                    throw new Error(error);
                }

                pageUrl = bestMatch.href;
                logger.info(`[WeebCentral] Found series page: ${bestMatch.href} (${bestMatch.title})`, { service: SERVICE });
            }

            let lastNavError: unknown;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    logger.info(`[WeebCentral] Navigating to series page (attempt ${attempt}/3): ${pageUrl}`, { service: SERVICE });
                    await this.gotoWithRateLimit(page, pageUrl, 'scan', { timeout: 45000 });
                    lastNavError = undefined;
                    break;
                } catch (err) {
                    lastNavError = err;
                    if (err instanceof ScraperStageError && err.code === 'RATE_LIMITED' && attempt < 3) {
                        await WeebCentralScraper.awaitRateLimitCooldown();
                        continue;
                    }
                    if (attempt < 3) {
                        logger.warn(`[WeebCentral] Series page navigation failed on attempt ${attempt}: ${err instanceof Error ? err.message : err}`, { service: SERVICE });
                        await page.waitForTimeout(2000 * attempt);
                    }
                }
            }

            if (lastNavError) {
                throw lastNavError;
            }

            await this.assertSeriesPageUsable(page, pageUrl);

            try {
                await page.waitForSelector('#chapter-list a[href*="/chapters/"]', { timeout: 10000 });
            } catch {
                // May still appear after Show All, or page may be a soft empty list
            }

            const initialChapterCount = await page.evaluate(() => {
                return document.querySelectorAll('#chapter-list a[href*="/chapters/"]').length;
            });

            const showAllBtnSelector = 'button[hx-get*="full-chapter-list"]';
            const btn = await page.$(showAllBtnSelector);
            if (btn) {
                logger.debug(`[WeebCentral] Clicking "Show All" button (initial chapters: ${initialChapterCount})`, { service: SERVICE });

                await btn.click();

                try {
                    await page.waitForFunction(
                        (prevCount: number) =>
                            document.querySelectorAll('#chapter-list a[href*="/chapters/"]').length > prevCount,
                        initialChapterCount,
                        { timeout: 15000 }
                    );
                } catch (err: any) {
                    logger.warn(`[WeebCentral] Chapter list did not grow after "Show All" within timeout: ${err?.message ?? err}`, { service: SERVICE });
                }
            }

            const chapterRows = await page.evaluate(() => {
                const links = Array.from(
                    document.querySelectorAll('#chapter-list a[href*="/chapters/"]')
                );
                return links
                    .map((anchor) => {
                        const url = (anchor as HTMLAnchorElement).href;
                        const textElement = anchor.querySelector('span.grow span:not([x-show])');
                        const fullTitle = textElement?.textContent?.trim() || '';
                        return { url, title: fullTitle };
                    })
                    .reverse();
            });

            logger.info(`[WeebCentral] Scraper found ${chapterRows.length} total chapters`, { service: SERVICE });

            if (chapterRows.length === 0) {
                const hasChapterList = await page.evaluate(() => !!document.querySelector('#chapter-list'));
                if (!hasChapterList) {
                    await this.assertSeriesPageUsable(page, pageUrl);
                    throw new ScraperStageError({
                        stage: 'scan',
                        scraperId: this.metadata.id,
                        scraperName: this.metadata.name,
                        url: pageUrl,
                        message: 'Series page loaded but chapter list was missing (blocked or layout change?)',
                    });
                }
            }

            for (const chap of chapterRows) {
                const parsed = ChapterNumberParser.parse(chap.title);

                if (await checkExists(parsed.number)) {
                    logger.debug(`[WeebCentral] Skipping chapter ${parsed.number} - already exists`, { service: SERVICE });
                    continue;
                }

                yield {
                    url: chap.url,
                    title: parsed.title,
                    number: parsed.number,
                    isSpecial: parsed.isSpecial,
                    specialType: parsed.specialType,
                };
            }
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await WeebCentralScraper.releaseBrowser(browser);
        }
    }

    async downloadChapter(url: string, seriesId: number, chapterNumber: string, mangaName: string, folderName: string): Promise<DownloadedChapter> {
        await WeebCentralScraper.awaitRateLimitCooldown();

        const browser = await WeebCentralScraper.getBrowser();
        const context = await browser.newContext({
            userAgent: appConfig.scraper.weebCentral.userAgent,
        });
        let page = await context.newPage();

        try {
            await page.route('**/*', (route: any) => {
                const request = route.request();
                const resourceType = request.resourceType();

                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    route.continue();
                } else if (resourceType === 'script') {
                    const requestUrl = request.url();
                    if (
                        requestUrl.includes('google') ||
                        requestUrl.includes('facebook') ||
                        requestUrl.includes('ad') ||
                        requestUrl.includes('tracker')
                    ) {
                        route.abort();
                    } else {
                        route.continue();
                    }
                } else {
                    route.continue();
                }
            });

            const imagesUrl = chapterImagesUrl(url);
            let finalImages: string[] = [];

            // Primary: /images fragment only (avoids an extra CF-counted chapter HTML GET)
            let lastImagesError: unknown;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    logger.info(`[WeebCentral] Navigating to /images for ${folderName} (attempt ${attempt}/3)`, { service: SERVICE });
                    await this.gotoWithRateLimit(page, imagesUrl, 'extract_images', { timeout: 25000 });
                    await this.assertSeriesPageUsable(page, imagesUrl, 'navigate');
                    finalImages = await this.extractImagesFromFragment(page, imagesUrl);
                    if (finalImages.length > 0) {
                        logger.debug(`[WeebCentral] Got ${finalImages.length} images from /images endpoint`, { service: SERVICE });
                        lastImagesError = undefined;
                        break;
                    }
                    lastImagesError = new Error('No img tags in /images fragment');
                } catch (err: any) {
                    lastImagesError = err;
                    if (err instanceof ScraperStageError && err.code === 'RATE_LIMITED' && attempt < 3) {
                        await WeebCentralScraper.awaitRateLimitCooldown();
                        continue;
                    }
                    if (
                        attempt < 3 &&
                        err?.message &&
                        (String(err.message).includes('ERR_ABORTED') || String(err.message).includes('net::'))
                    ) {
                        logger.warn(`[WeebCentral] /images navigation error on attempt ${attempt}: ${err.message}`, { service: SERVICE });
                        await page.waitForTimeout(2000 * attempt);
                        await page.close().catch(() => {});
                        page = await context.newPage();
                        continue;
                    }
                    if (attempt < 3) {
                        await page.waitForTimeout(1000 * attempt);
                        continue;
                    }
                    break;
                }
            }

            if (finalImages.length === 0 && lastImagesError) {
                logger.debug(`[WeebCentral] /images unavailable (${lastImagesError instanceof Error ? lastImagesError.message.split('\n')[0] : lastImagesError}), using reader page`, { service: SERVICE });
            }

            // Fallback: full reader DOM with progressive scroll
            let extractAttempt = 0;
            const maxExtractAttempts = 4;

            while (finalImages.length === 0 && extractAttempt < maxExtractAttempts) {
                extractAttempt++;

                try {
                    await this.gotoWithRateLimit(page, url, 'navigate', { timeout: 45000 });
                    await this.assertSeriesPageUsable(page, url, 'navigate');
                } catch (err) {
                    if (err instanceof ScraperStageError && err.code === 'RATE_LIMITED' && extractAttempt < maxExtractAttempts) {
                        await WeebCentralScraper.awaitRateLimitCooldown();
                        continue;
                    }
                    throw err;
                }

                logger.info(`[WeebCentral] Attempting to extract images from reader (attempt ${extractAttempt}/${maxExtractAttempts})`, { service: SERVICE });

                const initialWait = 2000 + (extractAttempt - 1) * 1500;
                await page.waitForTimeout(initialWait);

                try {
                    const scrollSteps = 3;
                    const scrollAmount = await page.evaluate(() => window.innerHeight * 0.8);
                    for (let i = 0; i < scrollSteps; i++) {
                        await page.evaluate((amount: number) => window.scrollBy(0, amount), scrollAmount);
                        await page.waitForTimeout(400);
                    }
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.waitForTimeout(300);
                } catch (err) {
                    logger.warn(`[WeebCentral] Scroll action failed: ${err}`, { service: SERVICE });
                }

                const imageSelector = 'img[alt*="Page"], img.maw-w-full, img[data-src][src*="http"], main img[src^="http"]';
                try {
                    await page.waitForSelector(imageSelector, {
                        timeout: 12000,
                        state: 'visible',
                    });
                    await page.waitForTimeout(1200);
                } catch {
                    logger.warn(`[WeebCentral] Image selector wait timed out on attempt ${extractAttempt}`, { service: SERVICE });
                    if (extractAttempt < maxExtractAttempts) {
                        await page.waitForTimeout(2000 * extractAttempt);
                        continue;
                    }
                }

                finalImages = await page
                    .evaluate(() => {
                        const imgs = document.querySelectorAll('img.maw-w-full, img[alt*="Page"], main img');
                        return Array.from(imgs)
                            .map((img) => img.getAttribute('data-src') || img.getAttribute('src'))
                            .filter(
                                (src): src is string =>
                                    !!src &&
                                    src.startsWith('http') &&
                                    (src.includes('planeptune.us') ||
                                        src.includes('lastation.us') ||
                                        src.includes('googleusercontent') ||
                                        src.includes('lh3.google') ||
                                        /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src))
                            );
                    })
                    .catch(() => []);

                if (finalImages.length === 0) {
                    finalImages = await page
                        .evaluate(() => {
                            const imgs = document.querySelectorAll('img[src^="http"], img[data-src^="http"]');
                            return Array.from(imgs)
                                .map((img) => img.getAttribute('data-src') || img.getAttribute('src'))
                                .filter((src): src is string => !!src && src.startsWith('http'));
                        })
                        .catch(() => []);
                }

                if (finalImages.length === 0 && extractAttempt < maxExtractAttempts) {
                    logger.warn(`[WeebCentral] No images on attempt ${extractAttempt}, retrying...`, { service: SERVICE });
                    await page.waitForTimeout(2000 * extractAttempt);
                }
            }

            logger.info(`[WeebCentral] Found ${finalImages.length} images for ${folderName} after ${extractAttempt} reader attempt(s)`, { service: SERVICE });

            if (finalImages.length === 0) {
                throw new ScraperStageError({
                    stage: 'extract_images',
                    scraperId: this.metadata.id,
                    scraperName: this.metadata.name,
                    url,
                    attempts: maxExtractAttempts,
                    message: 'Chapter page returned no page images (layout change or empty/removed chapter?)',
                });
            }

            const storagePrefix = await this.downloadImages(finalImages, seriesId, chapterNumber, url);

            return {
                storagePrefix,
                pageCount: finalImages.length,
            };
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            await WeebCentralScraper.releaseBrowser(browser);
        }
    }

    /**
     * Download images to object storage (batched parallel, short delay between batches to avoid CDN rate limits).
     * A page whose URL is the provider's known broken/fallback image is stored as a placeholder; any other
     * download that exhausts its retries throws and fails the chapter so it can be retried.
     */
    private async downloadImages(images: string[], seriesId: number, chapterNumber: string, referer: string): Promise<string> {
        const storagePrefix = `${seriesId}/${chapterNumber}`;
        const headers = {
            Referer: referer,
            'User-Agent': appConfig.scraper.weebCentral.userAgent,
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            Pragma: 'no-cache',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
        };

        await downloadAndStoreChapter({
            storagePrefix,
            images,
            headers,
            service: SERVICE,
            scraperId: this.metadata.id,
            scraperName: this.metadata.name,
            chapterUrl: referer,
            isPlaceholder: (imgUrl) => imgUrl.includes('broken_image'),
            detectKnownBrokenImages: true,
            transform: { quality: 85 },
        });

        return storagePrefix;
    }
}
