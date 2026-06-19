/**
 * Structured scraper errors.
 *
 * Every scraper failure now flows through `ScraperStageError`, which records
 * *which stage* failed (searching the source, finding the chapter, navigating,
 * extracting the image list, downloading a specific page, transcoding, …) plus
 * the concrete detail for that stage (page index, image URL, HTTP status, the
 * underlying cause). The error's `message` is a single dense line so it reads
 * well as the BullMQ `failedReason` shown on the admin queue page, and
 * `toLogDetail()` exposes the same fields as structured data for logs/Sentry.
 *
 * The whole point: a failed chapter should say *what* broke — "WeebCentral:
 * page 5/20 failed after 3 attempts — HTTP 404" — not just "failed to download".
 */

/** The pipeline stage a scraper failure happened in. */
export type ScraperStage =
    /** Searching the source site for the manga (findBestMatch / search). */
    | 'search'
    /** Resolved a search but found no acceptable manga match. */
    | 'match'
    /** Listing/scanning the chapters on the manga page. */
    | 'scan'
    /** Loading the chapter page (browser navigation / HTTP fetch). */
    | 'navigate'
    /** Extracting the page-image URL list from the chapter. */
    | 'extract_images'
    /** Downloading a specific page image. */
    | 'download_image'
    /** Transcoding/uploading a downloaded page to storage. */
    | 'store'
    /** No enabled scraper could handle the URL/manga (config/routing issue). */
    | 'routing'
    /** Anything that doesn't fit the buckets above. */
    | 'unknown';

/** Human-readable label per stage, used when building messages. */
export const SCRAPER_STAGE_LABEL: Record<ScraperStage, string> = {
    search: 'Search source',
    match: 'Find manga match',
    scan: 'Scan chapter list',
    navigate: 'Load chapter page',
    extract_images: 'Extract page images',
    download_image: 'Download page image',
    store: 'Store page',
    routing: 'Select scraper',
    unknown: 'Scrape',
};

export interface ScraperStageErrorInit {
    stage: ScraperStage;
    /** Short description of what went wrong (without the stage prefix). */
    message: string;
    /** Scraper that produced the failure (e.g. 'weebcentral'). */
    scraperId?: string;
    /** Human name of the scraper (e.g. 'WeebCentral'). */
    scraperName?: string;
    /** The URL being processed (chapter URL, manga URL, …). */
    url?: string;
    /** 1-based page number that failed (for image/store stages). */
    pageNumber?: number;
    /** Total page count when known (for "5/20" style context). */
    pageCount?: number;
    /** The specific image URL that failed. */
    imageUrl?: string;
    /** How many attempts were made before giving up. */
    attempts?: number;
    /** HTTP status code, when the failure came from an HTTP response. */
    httpStatus?: number;
    /** Network/error code (ETIMEDOUT, ECONNRESET, …). */
    code?: string;
    /** Underlying error that triggered this. */
    cause?: unknown;
}

/** Extracted, normalized detail from an arbitrary thrown value. */
export interface ErrorDescription {
    message: string;
    httpStatus?: number;
    code?: string;
}

/**
 * Pull a concise, human-useful description out of any thrown value — including
 * axios errors (HTTP status / network code) and Playwright navigation errors.
 */
export function describeError(err: unknown): ErrorDescription {
    if (err instanceof ScraperStageError) {
        return { message: err.detailMessage, httpStatus: err.httpStatus, code: err.code };
    }

    const anyErr = err as any;
    const httpStatus: number | undefined =
        typeof anyErr?.response?.status === 'number' ? anyErr.response.status : undefined;
    const code: string | undefined =
        typeof anyErr?.code === 'string' ? anyErr.code : undefined;

    let message: string;
    if (err instanceof Error) {
        // Playwright stuffs a huge call log after the first line; keep line one.
        message = err.message.split('\n')[0].trim() || err.name;
    } else if (typeof err === 'string') {
        message = err;
    } else {
        message = String(err);
    }

    if (httpStatus && !/\b\d{3}\b/.test(message)) {
        message = `HTTP ${httpStatus}${message ? `: ${message}` : ''}`;
    }

    return { message, httpStatus, code };
}

/**
 * Error carrying the failed scraper stage plus concrete detail. The constructed
 * `message` is a single line suitable for display as a queue `failedReason`.
 */
export class ScraperStageError extends Error {
    readonly stage: ScraperStage;
    readonly detailMessage: string;
    readonly scraperId?: string;
    readonly scraperName?: string;
    readonly url?: string;
    readonly pageNumber?: number;
    readonly pageCount?: number;
    readonly imageUrl?: string;
    readonly attempts?: number;
    readonly httpStatus?: number;
    readonly code?: string;

    constructor(init: ScraperStageErrorInit) {
        super(ScraperStageError.buildMessage(init));
        this.name = 'ScraperStageError';
        this.stage = init.stage;
        this.detailMessage = init.message;
        this.scraperId = init.scraperId;
        this.scraperName = init.scraperName;
        this.url = init.url;
        this.pageNumber = init.pageNumber;
        this.pageCount = init.pageCount;
        this.imageUrl = init.imageUrl;
        this.attempts = init.attempts;
        this.httpStatus = init.httpStatus;
        this.code = init.code;
        if (init.cause !== undefined) {
            (this as any).cause = init.cause;
        }
    }

    /** Build the dense one-line message shown to operators. */
    private static buildMessage(init: ScraperStageErrorInit): string {
        const label = SCRAPER_STAGE_LABEL[init.stage];
        const source = init.scraperName ?? init.scraperId;
        const parts: string[] = [];

        // e.g. "[WeebCentral] Download page image"
        parts.push(`${source ? `[${source}] ` : ''}${label} failed`);

        const context: string[] = [];
        if (init.pageNumber != null) {
            context.push(init.pageCount != null ? `page ${init.pageNumber}/${init.pageCount}` : `page ${init.pageNumber}`);
        }
        if (init.attempts != null) {
            context.push(`after ${init.attempts} attempt${init.attempts === 1 ? '' : 's'}`);
        }
        if (context.length) parts[0] += ` (${context.join(', ')})`;

        let line = `${parts[0]}: ${init.message}`;

        const suffix: string[] = [];
        if (init.httpStatus != null && !init.message.includes(String(init.httpStatus))) {
            suffix.push(`HTTP ${init.httpStatus}`);
        }
        if (init.imageUrl) suffix.push(init.imageUrl);
        if (suffix.length) line += ` — ${suffix.join(' ')}`;

        return line;
    }

    /** Structured fields for logging / Sentry context. */
    toLogDetail(): Record<string, unknown> {
        return {
            stage: this.stage,
            stage_label: SCRAPER_STAGE_LABEL[this.stage],
            scraper_id: this.scraperId,
            scraper_name: this.scraperName,
            url: this.url,
            page_number: this.pageNumber,
            page_count: this.pageCount,
            image_url: this.imageUrl,
            attempts: this.attempts,
            http_status: this.httpStatus,
            code: this.code,
            detail: this.detailMessage,
        };
    }

    /**
     * Wrap any thrown value as a `ScraperStageError`. An existing
     * `ScraperStageError` is returned enriched with any missing context (so the
     * innermost stage — e.g. which image failed — is preserved as the manager
     * adds scraper identity on the way up).
     */
    static from(err: unknown, init: Omit<ScraperStageErrorInit, 'message'> & { message?: string }): ScraperStageError {
        if (err instanceof ScraperStageError) {
            return new ScraperStageError({
                stage: err.stage,
                message: err.detailMessage,
                scraperId: err.scraperId ?? init.scraperId,
                scraperName: err.scraperName ?? init.scraperName,
                url: err.url ?? init.url,
                pageNumber: err.pageNumber ?? init.pageNumber,
                pageCount: err.pageCount ?? init.pageCount,
                imageUrl: err.imageUrl ?? init.imageUrl,
                attempts: err.attempts ?? init.attempts,
                httpStatus: err.httpStatus ?? init.httpStatus,
                code: err.code ?? init.code,
                cause: (err as any).cause ?? err,
            });
        }
        const described = describeError(err);
        return new ScraperStageError({
            ...init,
            message: init.message ?? described.message,
            httpStatus: init.httpStatus ?? described.httpStatus,
            code: init.code ?? described.code,
            cause: err,
        });
    }
}
