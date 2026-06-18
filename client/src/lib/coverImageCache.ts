const NOT_FOUND = '/notFound.png';

const resolvedUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const imageWarmups = new Map<string, Promise<void>>();

function isCarouselDragging(): boolean {
    return typeof document !== 'undefined' && document.querySelector('[data-carousel-dragging]') !== null;
}

function warmupImage(url: string): Promise<void> {
    const existing = imageWarmups.get(url);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
    });
    imageWarmups.set(url, promise);
    return promise;
}

async function fetchToBlobUrl(url: string): Promise<string> {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error(`cover fetch failed: ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

export function isCoverCached(url: string): boolean {
    return resolvedUrls.has(url);
}

export async function resolveCoverImageUrl(url: string): Promise<string> {
    if (!url || url === NOT_FOUND || url.startsWith('/') || url.startsWith('data:')) return url;
    if (resolvedUrls.has(url)) return resolvedUrls.get(url)!;

    const pending = inflight.get(url);
    if (pending) return pending;

    const promise = (async () => {
        try {
            const blobUrl = await fetchToBlobUrl(url);
            resolvedUrls.set(url, blobUrl);
            return blobUrl;
        } catch {
            await warmupImage(url);
            resolvedUrls.set(url, url);
            return url;
        } finally {
            inflight.delete(url);
        }
    })();

    inflight.set(url, promise);
    return promise;
}

function schedulePrefetch(url: string, delayMs: number): void {
    const start = () => {
        if (isCarouselDragging()) {
            setTimeout(start, 120);
            return;
        }
        void resolveCoverImageUrl(url);
    };

    if (delayMs <= 0) start();
    else setTimeout(start, delayMs);
}

export function prefetchCoverImages(urls: string[]): void {
    const unique = [...new Set(urls)].filter((url) => url && url !== NOT_FOUND && !resolvedUrls.has(url));
    unique.forEach((url, index) => schedulePrefetch(url, index * 60));
}

export function scheduleCarouselPrefetch(urls: string[]): void {
    const unique = [...new Set(urls)].filter((url) => url && url !== NOT_FOUND);
    if (unique.length === 0) return;

    const run = () => prefetchCoverImages(unique);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 300);
}
