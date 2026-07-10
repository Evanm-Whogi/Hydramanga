/**
 * Shared chapter-image downloader.
 *
 * Previously every scraper implemented a near-identical `downloadImages()`:
 * batched-parallel download + per-image retry/backoff + sharp transform + write,
 * with either a placeholder fallback or a hard failure for irrecoverable pages.
 * That loop now lives here once; scrapers only build the image-URL list (the
 * scraper-specific part) and call `downloadAndStoreChapter`. Pages are uploaded to
 * object storage (Garage) via `objectStorageService` — no scraper touches disk.
 *
 * Failure policy: a page that exhausts its retries throws and fails the whole
 * chapter, so the queue retries it (and it stays in the failed set for manual
 * retry) rather than silently storing a placeholder that looks like success.
 * Placeholders are only written where retrying is pointless: `isPlaceholder`
 * URLs (sources that advertise a known-broken/fallback image), and — when
 * `detectKnownBrokenImages` is on — pages whose downloaded bytes are the
 * source's known broken-image graphic or simply aren't a decodable image
 * (a corrupt/zero-filled 200 standing in for a missing page).
 */
import { type AxiosInstance } from 'axios';
import { objectStorageService, type PageTransformOptions } from '@/services/objectStorageService';
import { buildAxios } from './scraperEgress';
import logger from '@/services/loggerService';
import { matchKnownBrokenImage } from './knownBrokenImages';
import { ScraperStageError, describeError, isTrue404Error } from './scraperError';
import { placeholderTrackingService, seriesIdFromStoragePrefix, type PlaceholderReason } from '@/services/placeholderTrackingService';

/**
 * True when sharp rejected the downloaded bytes because they aren't a decodable
 * image — e.g. a CDN returned HTTP 200 with a corrupt/zero-filled body in place
 * of a missing page. These are deterministic: retrying just re-fetches the same
 * un-decodable bytes, so sources that do this should store a placeholder instead.
 *
 * Deliberately excludes truncation errors ("premature end …"): a short download
 * is usually transient, so it's left to the normal retry loop rather than being
 * placeholdered on the first attempt.
 */
export function isUndecodableImageError(err: any): boolean {
    const msg: string = (err?.message || String(err)).toLowerCase();
    return (
        msg.includes('unsupported image format') ||
        msg.includes('corrupt header') ||
        msg.includes('buffer is empty') ||
        msg.includes('not in a known format')
    );
}

/** Transient network errors that several scrapers consider worth retrying. */
export function isNetworkRetryableError(err: any): boolean {
    const msg: string = err?.message || String(err);
    return (
        msg.includes('stream has been aborted') ||
        msg.includes('ERR_HTTP2_STREAM_CANCEL') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ECONNABORTED') ||
        msg.includes('ETIMEDOUT') ||
        err?.code === 'ERR_HTTP2_STREAM_CANCEL' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ETIMEDOUT'
    );
}

/**
 * For scrapers that run their own per-image download loop (not `downloadAndStoreChapter`):
 * if `err` is a genuine HTTP 404, store a placeholder for this one page, record it in the
 * ledger, and return `true` so the caller continues instead of failing the chapter. Returns
 * `false` for any other error — the caller must then throw and fail the chapter (which the
 * queue `onFailed` handler records as `download_failed`).
 */
export async function store404PlaceholderIfMissing(err: unknown, ctx: { storagePrefix: string; pageIndex: number; imageUrl: string; scraperId?: string; service?: string }): Promise<boolean> {
    if (!isTrue404Error(err)) return false;
    const described = describeError(err);
    logger.warn(`Image ${ctx.pageIndex + 1} not found (HTTP 404); storing placeholder`, { service: ctx.service ?? 'chapterImageDownloader' });
    await objectStorageService.uploadPlaceholderSlot(ctx.storagePrefix, ctx.pageIndex);
    const seriesId = seriesIdFromStoragePrefix(ctx.storagePrefix);
    if (seriesId != null) {
        await placeholderTrackingService.record({ seriesId, storagePrefix: ctx.storagePrefix, pageNumber: ctx.pageIndex + 1, reason: 'http_404', imageUrl: ctx.imageUrl, httpStatus: 404, errorMessage: described.message, scraperId: ctx.scraperId ?? null });
    }
    return true;
}

export interface DownloadAndStoreOptions {
    /** Storage prefix / object-key base, e.g. `${seriesId}/${chapterNumber}`. */
    storagePrefix: string;
    /** Ordered list of page image URLs to download. */
    images: string[];
    /** Axios instance to use for downloads (defaults to a proxy-aware client per `scraperId`). */
    client?: AxiosInstance;
    /** Request headers (Referer, User-Agent, …) for the image downloads. */
    headers?: Record<string, string>;
    /** Parallel downloads per batch (default 10). */
    batchSize?: number;
    /** Per-image download attempts (default 3). */
    maxRetries?: number;
    /** Per-request timeout in ms (default 15000). */
    timeoutMs?: number;
    /** Axios `maxRedirects` for the image request (optional). */
    maxRedirects?: number;
    /** Delay between batches in ms, to ease CDN rate limits (default 100). */
    batchDelayMs?: number;
    /** Log-tag service name, e.g. `weebCentralScraper`. */
    service?: string;
    /** Scraper id/name for error attribution (surfaced in the queue failure reason). */
    scraperId?: string;
    scraperName?: string;
    /** Chapter URL these images came from (surfaced in the failure reason). */
    chapterUrl?: string;
    /** Predicate marking a URL as a known-broken source → store a placeholder, skip download. */
    isPlaceholder?: (url: string) => boolean;
    /**
     * When `true`, each downloaded page is buffered and compared against the
     * source's known broken-image fingerprints (`knownBrokenImages`). A match —
     * the source returned its static "broken image" graphic in place of a real
     * page — stores a placeholder slot instead. Only an exact byte match counts;
     * download *errors* are never placeholdered. Off by default (keeps the
     * streaming, no-buffer path for sources that don't do this).
     */
    detectKnownBrokenImages?: boolean;
    /**
     * When all attempts fail: `false` (default) throws, failing the chapter so it
     * can be retried; `true` stores a placeholder in the page slot and continues
     * (treating the chapter as a success). Prefer the default — a placeholder hides
     * the failure and there's no way to tell a chapter needs re-downloading.
     */
    placeholderOnFailure?: boolean;
    /**
     * When `true`, a genuine HTTP 404 is thrown like any other failure instead of being
     * substituted with a placeholder. Used by scrapers with a whole-chapter fallback path
     * (e.g. Onisaga's canvas capture) that may still recover a page whose direct URL 404s.
     */
    throw404?: boolean;
    /** Whether a thrown error should be retried (default: always retry until maxRetries). */
    isRetryable?: (err: any) => boolean;
    /** Per-page webp transform overrides (quality/effort/width); e.g. higher quality for clean line-art sources. */
    transform?: PageTransformOptions;
}

/**
 * Download every page and store it. Pages flagged by `isPlaceholder` are stored as
 * a shared placeholder image (known-broken source). A page that exhausts its
 * retries throws and fails the chapter, unless `placeholderOnFailure` is set, in
 * which case it too falls back to a placeholder.
 *
 * @returns the number of pages stored (always `images.length`).
 */
export async function downloadAndStoreChapter(
    opts: DownloadAndStoreOptions
): Promise<{ pageCount: number }> {
    const {
        storagePrefix,
        images,
        // Default to a proxy-aware client (scoped to this scraper) so image-CDN
        // downloads honour the egress proxy + feed ban detection when no explicit
        // client is passed. With the proxy flag off this is a bare keep-alive client.
        client = buildAxios({ scraperId: opts.scraperId }),
        headers,
        batchSize = 10,
        maxRetries = 3,
        timeoutMs = 15000,
        maxRedirects,
        batchDelayMs = 100,
        service = 'chapterImageDownloader',
        scraperId,
        scraperName,
        chapterUrl,
        isPlaceholder,
        detectKnownBrokenImages = false,
        placeholderOnFailure = false,
        throw404 = false,
        isRetryable,
        transform,
    } = opts;

    const retryDelayMs = 1000;

    // Flag-gated diagnostics: split source-download time vs transcode+upload time so we
    // can tell whether a slow chapter is CDN-bound or storage/CPU-bound. Off by default.
    const timed = process.env.STORE_TIMING === '1';
    let dlMs = 0, stMs = 0, dlBytes = 0;

    // Durable per-page failure/placeholder ledger. Every placeholder we write (and any
    // permanent per-page failure) is recorded so the admin panel has a reliable history —
    // the BullMQ failed set is a rolling buffer and can't be relied on.
    const seriesId = seriesIdFromStoragePrefix(storagePrefix);
    const placeholderedPages: number[] = [];
    const storePlaceholder = async (i: number, reason: PlaceholderReason, imageUrl: string, httpStatus?: number | null, errorMessage?: string | null) => {
        await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
        placeholderedPages.push(i + 1);
        if (seriesId != null) {
            await placeholderTrackingService.record({ seriesId, storagePrefix, pageNumber: i + 1, reason, imageUrl, httpStatus: httpStatus ?? null, errorMessage: errorMessage ?? null, scraperId: scraperId ?? null });
        }
    };

    const downloadOne = async (imageUrl: string, i: number) => {
        if (isPlaceholder?.(imageUrl)) {
            await storePlaceholder(i, 'source_placeholder', imageUrl);
            return;
        }

        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (timed) {
                    const t0 = Date.now();
                    const response = await client.get(imageUrl, { responseType: 'arraybuffer', timeout: timeoutMs, ...(maxRedirects !== undefined ? { maxRedirects } : {}), headers });
                    const buf = Buffer.from(response.data);
                    dlMs += Date.now() - t0; dlBytes += buf.length;
                    const t1 = Date.now();
                    await objectStorageService.transformAndUploadPage(storagePrefix, i, buf, transform);
                    stMs += Date.now() - t1;
                    return;
                }
                const response = await client.get(imageUrl, {
                    // Content detection needs the whole image in hand to fingerprint it;
                    // otherwise stream straight into the transform to avoid buffering.
                    responseType: detectKnownBrokenImages ? 'arraybuffer' : 'stream',
                    timeout: timeoutMs,
                    ...(maxRedirects !== undefined ? { maxRedirects } : {}),
                    headers,
                });
                if (detectKnownBrokenImages) {
                    const buffer = Buffer.from(response.data);
                    const brokenSource = matchKnownBrokenImage(buffer);
                    if (brokenSource) {
                        logger.warn(
                            `Image ${i + 1} is ${brokenSource}'s broken-image graphic; storing placeholder`,
                            { service }
                        );
                        await storePlaceholder(i, 'known_broken', imageUrl, null, `matched ${brokenSource} broken-image graphic`);
                        return;
                    }
                    try {
                        await objectStorageService.transformAndUploadPage(storagePrefix, i, buffer, transform);
                    } catch (transformErr: any) {
                        // The source returned a 200 with bytes that aren't a decodable
                        // image (corrupt/zero-filled stand-in for a missing page).
                        // Retrying re-fetches the same garbage, so store a placeholder.
                        if (isUndecodableImageError(transformErr)) {
                            logger.warn(
                                `Image ${i + 1} downloaded but is not a decodable image (${transformErr.message}); storing placeholder`,
                                { service }
                            );
                            await storePlaceholder(i, 'undecodable', imageUrl, null, transformErr.message);
                            return;
                        }
                        throw transformErr;
                    }
                    return; // success
                }
                await objectStorageService.transformAndUploadPage(storagePrefix, i, response.data, transform);
                return; // success
            } catch (err: any) {
                lastError = err;
                // A 404 is deterministic — retrying just re-fetches the 404. Stop early
                // and fall through to the placeholder branch below.
                const retryable = (isRetryable ? isRetryable(err) : true) && !isTrue404Error(err);
                if (retryable && attempt < maxRetries) {
                    const delay = retryDelayMs * Math.pow(2, attempt - 1);
                    logger.warn(
                        `Image ${i + 1} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms…`,
                        { service }
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    break;
                }
            }
        }

        const described = describeError(lastError);

        // A true 404 means the page is genuinely missing: substitute a placeholder for
        // this one page (recorded as http_404) rather than failing the whole chapter.
        // This is independent of `placeholderOnFailure` — 404s always placeholder — unless
        // the scraper opted into `throw404` to run a whole-chapter fallback instead.
        if (!throw404 && isTrue404Error(lastError)) {
            logger.warn(
                `Image ${i + 1} not found (HTTP 404); storing placeholder`,
                { service }
            );
            await storePlaceholder(i, 'http_404', imageUrl, 404, described.message);
            return;
        }

        if (!placeholderOnFailure) {
            const stageError = new ScraperStageError({
                stage: 'download_image',
                message: described.message,
                scraperId,
                scraperName,
                url: chapterUrl,
                pageNumber: i + 1,
                pageCount: images.length,
                imageUrl,
                attempts: maxRetries,
                httpStatus: described.httpStatus,
                code: described.code,
                cause: lastError,
            });
            logger.error(stageError.message, { service, ...stageError.toLogDetail() });
            throw stageError;
        }

        logger.warn(
            `Failed to download image ${i + 1} after ${maxRetries} attempts, using placeholder: ${lastError?.message}`,
            { service }
        );
        await storePlaceholder(i, 'download_failed', imageUrl, described.httpStatus ?? null, lastError?.message ?? null);
    };

    // Sliding-window pool: keep `batchSize` page tasks in flight instead of fixed
    // batches that block on their slowest member. `batchDelayMs` (previously an
    // inter-batch sleep) becomes a per-launch spacing so a slow page no longer
    // stalls the rest while still easing sources that need paced requests (MangaDex).
    const concurrency = Math.max(1, batchSize);
    const launchSpacingMs = batchDelayMs > 0 ? Math.ceil(batchDelayMs / concurrency) : 0;
    let nextIndex = 0;
    let nextLaunchAt = 0;
    const runWorker = async () => {
        while (true) {
            const i = nextIndex++;
            if (i >= images.length) return;
            if (launchSpacingMs > 0) {
                const now = Date.now();
                const scheduledAt = Math.max(now, nextLaunchAt);
                nextLaunchAt = scheduledAt + launchSpacingMs; // reserve slot synchronously
                if (scheduledAt > now) await new Promise((resolve) => setTimeout(resolve, scheduledAt - now));
            }
            await downloadOne(images[i], i);
        }
    };
    const wallStart = Date.now();
    await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, () => runWorker()));

    // Any page that previously had a placeholder/failure row but succeeded this run is
    // now resolved. One query per chapter (keyed on the indexed storage prefix), and
    // only pages still placeholdered this run stay unresolved.
    if (seriesId != null) {
        await placeholderTrackingService.resolveByPrefixExcept(storagePrefix, placeholderedPages);
    }

    if (timed) {
        const wall = Date.now() - wallStart;
        const kbps = dlMs > 0 ? Math.round(dlBytes / 1024 / (dlMs / 1000)) : 0;
        logger.info(`[STORE_TIMING] ${images.length} pages in ${wall}ms wall — download(sum) ${dlMs}ms (${Math.round(dlBytes / 1024)}KB, ${kbps}KB/s/conn), transcode+upload(sum) ${stMs}ms, concurrency ${concurrency}`, { service });
    }

    return { pageCount: images.length };
}
