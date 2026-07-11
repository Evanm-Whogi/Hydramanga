/**
 * Scraper ban detection — decides when egress is *actually* IP-banned (vs. ordinary
 * scraping noise) and, when so, triggers an exit-IP rotation.
 *
 * Sibling to the network/image predicates in `chapterImageDownloader.ts`. The whole
 * point here is **not over-rotating**: a missing chapter (404), a stale URL (410),
 * a one-off edge 4xx, or a generic auth 403 are normal and must never burn an IP.
 *
 * Two safeguards:
 *  (a) Only true IP-ban signals count — HTTP 429, or a 403 whose body/headers say
 *      "rate limited / access denied / blocked" — and only when *sustained*: a
 *      per-source sliding window must reach `banThreshold` distinct ban signals
 *      within `banWindowMs`. Successful responses decay the counter, so isolated
 *      errors interleaved with successes can never slowly accumulate into a false
 *      rotation.
 *  (b) Cloudflare challenges are classified separately (`challenge`) and do NOT
 *      feed the ban window from here — they're handled by FlareSolverr first
 *      (Kagane/Comix). Only an *unsolvable* challenge escalates via
 *      `recordChallengeUnsolved`, which counts as a ban.
 *
 * Combined with the rotation service's own in-flight lock + cooldown, a false
 * rotation from incidental 4xx is effectively impossible.
 */
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { scraperVpnRotationService } from '@/services/scraperVpnRotationService';

export type BanSignal = 'ban' | 'challenge' | 'ignore';

interface SignalInput {
    status?: number;
    headers?: Record<string, unknown>;
    body?: string;
}

/** Markers in a 403 body/headers that indicate an IP/rate block rather than auth. */
const BAN_BODY_MARKERS = [
    'rate limit',
    'rate-limit',
    'too many requests',
    'access denied',
    'access is denied',
    'you have been blocked',
    'unable to access',
    'ip address has been',
    'your ip',
    'temporarily blocked',
];

/** Markers of a Cloudflare interstitial challenge page. */
const CHALLENGE_BODY_MARKERS = [
    'just a moment',
    '__cf_chl',
    'cf-browser-verification',
    'checking your browser',
    'cf_chl_opt',
    'attention required',
];

/**
 * Detect Cloudflare challenge / hard-block pages from Playwright title+body.
 * Used when navigation "succeeds" (often HTTP 200) but the DOM is an interstitial.
 */
export function isCloudflareInterstitial(title: string, body: string): 'ban' | 'challenge' | null {
    const titleLower = lower(title);
    const bodyLower = lower(body);
    if (BAN_BODY_MARKERS.some((m) => bodyLower.includes(m))) return 'ban';
    if (
        titleLower.includes('attention required') ||
        titleLower.includes('just a moment') ||
        CHALLENGE_BODY_MARKERS.some((m) => bodyLower.includes(m) || titleLower.includes(m))
    ) {
        return 'challenge';
    }
    return null;
}

function lower(value: unknown): string {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

/** Normalize an axios error / response / synthetic descriptor into `SignalInput`. */
function toSignalInput(errOrResponse: any): SignalInput {
    if (!errOrResponse) return {};
    // Axios error with a response, or a raw response object.
    const response = errOrResponse.response ?? (errOrResponse.status !== undefined ? errOrResponse : undefined);
    if (response) {
        const data = response.data;
        const body = typeof data === 'string' ? data : '';
        return { status: response.status, headers: response.headers ?? {}, body };
    }
    return {};
}

/**
 * Classify a request outcome. Network errors (ECONNRESET/timeouts) and ordinary
 * 4xx (400/404/410/generic 403) return `ignore` and never count toward rotation.
 */
export function classifySignal(errOrResponse: any): BanSignal {
    const { status, headers, body } = toSignalInput(errOrResponse);
    if (status === undefined) return 'ignore'; // network error, no HTTP response

    const headerBag = headers ?? {};
    const cfMitigated = lower(headerBag['cf-mitigated'] ?? (headerBag as any)['Cf-Mitigated']);
    const bodyLower = lower(body);

    // Cloudflare challenge: header marker, or a 503/429 challenge body.
    if (cfMitigated === 'challenge' || ((status === 503 || status === 429) && CHALLENGE_BODY_MARKERS.some((m) => bodyLower.includes(m)))) {
        return 'challenge';
    }

    // Hard rate limit.
    if (status === 429) return 'ban';

    // Hard IP/rate block markers — Playwright often lands on these with status 200.
    if (BAN_BODY_MARKERS.some((m) => bodyLower.includes(m))) return 'ban';

    // A 403 only counts when it carries Retry-After (body markers already handled above);
    // a generic 403 is auth/permission noise → ignore.
    if (status === 403) {
        const retryAfter = headerBag['retry-after'] ?? (headerBag as any)['Retry-After'];
        if (retryAfter) return 'ban';
        return 'ignore';
    }

    return 'ignore';
}

// Per-source sliding window of ban-signal timestamps (epoch ms).
const banWindows = new Map<string, number[]>();

function pruneWindow(times: number[], now: number): number[] {
    const cutoff = now - appConfig.scraper.egressVpn.banWindowMs;
    return times.filter((t) => t >= cutoff);
}

/**
 * Record one confirmed ban signal for a source. Returns `true` and triggers a
 * rotation when the sliding window crosses the threshold (the window is then
 * cleared so the post-rotation backoff isn't immediately re-tripped).
 */
function recordBan(scraperId: string, reason: string): boolean {
    const now = Date.now();
    const times = pruneWindow(banWindows.get(scraperId) ?? [], now);
    times.push(now);
    const { banThreshold } = appConfig.scraper.egressVpn;

    if (times.length >= banThreshold) {
        banWindows.set(scraperId, []);
        logger.warn(
            `[banDetection] ${scraperId}: ${times.length} ban signals within window (${reason}) — rotating exit IP`,
            { service: 'scraperBanDetection' }
        );
        void scraperVpnRotationService.rotate(`ban:${scraperId}:${reason}`);
        return true;
    }

    banWindows.set(scraperId, times);
    logger.debug(
        `[banDetection] ${scraperId}: ban signal ${times.length}/${banThreshold} (${reason})`,
        { service: 'scraperBanDetection' }
    );
    return false;
}

/**
 * A successful response decays the counter for a source, so isolated errors
 * interleaved with successes can't accumulate into a false rotation.
 */
export function noteScraperSuccess(scraperId: string): void {
    const times = banWindows.get(scraperId);
    if (times && times.length) times.shift();
}

/**
 * Classify an axios error and, if it's a sustained ban, trigger rotation. Called by
 * the interceptor in `scraperEgress.buildAxios`. No-ops when the proxy is disabled
 * (rotating the scraper VPN does nothing for un-proxied direct traffic).
 */
export async function recordScraperError(scraperId: string | undefined, error: any): Promise<void> {
    if (!scraperId || !appConfig.scraper.proxy.enabled) return;
    const signal = classifySignal(error);
    if (signal === 'ban') {
        const status = error?.response?.status;
        recordBan(scraperId, `http_${status ?? '4xx'}`);
    }
    // `challenge` is intentionally NOT counted here — FlareSolverr handles it first;
    // unsolvable challenges escalate via recordChallengeUnsolved().
    // `ignore` never counts.
}

/**
 * Feed a block detected outside axios — e.g. a Playwright page that navigated to a
 * challenge/blocked interstitial. `status`/`body` are best-effort.
 */
export function recordScraperBlockedPage(
    scraperId: string,
    detail: { status?: number; body?: string; headers?: Record<string, unknown> }
): void {
    if (!appConfig.scraper.proxy.enabled) return;
    const signal = classifySignal(detail);
    if (signal === 'ban') recordBan(scraperId, 'playwright_block');
    else if (signal === 'challenge') recordChallengeUnsolved(scraperId, 'playwright_challenge');
}

/**
 * Escalation hook for FlareSolverr-backed scrapers: a Cloudflare challenge that
 * FlareSolverr could NOT solve from this exit IP is treated as a ban and feeds the
 * rotation window. Solvable challenges should NOT call this.
 */
export function recordChallengeUnsolved(scraperId: string, reason = 'unsolvable_challenge'): void {
    if (!appConfig.scraper.proxy.enabled) return;
    recordBan(scraperId, reason);
}

/** Current ban-signal count for a source (diagnostics/admin status). */
export function getBanWindowSize(scraperId: string): number {
    return pruneWindow(banWindows.get(scraperId) ?? [], Date.now()).length;
}
