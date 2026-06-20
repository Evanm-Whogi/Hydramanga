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
import axios, { type AxiosInstance } from 'axios';
import { objectStorageService } from '@/services/objectStorageService';
import logger from '@/services/loggerService';
import { matchKnownBrokenImage } from './knownBrokenImages';
import { ScraperStageError, describeError } from './scraperError';

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

export interface DownloadAndStoreOptions {
    /** Storage prefix / object-key base, e.g. `${seriesId}/${chapterNumber}`. */
    storagePrefix: string;
    /** Ordered list of page image URLs to download. */
    images: string[];
    /** Axios instance to use for downloads (defaults to the shared `axios`). */
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
    /** Whether a thrown error should be retried (default: always retry until maxRetries). */
    isRetryable?: (err: any) => boolean;
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
        client = axios,
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
        isRetryable,
    } = opts;

    const retryDelayMs = 1000;

    const downloadOne = async (imageUrl: string, i: number) => {
        if (isPlaceholder?.(imageUrl)) {
            await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
            return;
        }

        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
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
                        await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
                        return;
                    }
                    try {
                        await objectStorageService.transformAndUploadPage(storagePrefix, i, buffer);
                    } catch (transformErr: any) {
                        // The source returned a 200 with bytes that aren't a decodable
                        // image (corrupt/zero-filled stand-in for a missing page).
                        // Retrying re-fetches the same garbage, so store a placeholder.
                        if (isUndecodableImageError(transformErr)) {
                            logger.warn(
                                `Image ${i + 1} downloaded but is not a decodable image (${transformErr.message}); storing placeholder`,
                                { service }
                            );
                            await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
                            return;
                        }
                        throw transformErr;
                    }
                    return; // success
                }
                await objectStorageService.transformAndUploadPage(storagePrefix, i, response.data);
                return; // success
            } catch (err: any) {
                lastError = err;
                const retryable = isRetryable ? isRetryable(err) : true;
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

        if (!placeholderOnFailure) {
            const described = describeError(lastError);
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
        await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
    };

    for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, images.length);
        const batch = images.slice(batchStart, batchEnd);
        await Promise.all(batch.map((imageUrl, j) => downloadOne(imageUrl, batchStart + j)));
        if (batchEnd < images.length && batchDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
        }
    }

    return { pageCount: images.length };
}
