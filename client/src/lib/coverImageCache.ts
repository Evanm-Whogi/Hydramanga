const NOT_FOUND = '/notFound.png';

const resolvedUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const imageWarmups = new Map<string, Promise<void>>();

const MAX_CONCURRENT = 4;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];
let prefetchDelayMs = 0;

function isCarouselDragging(): boolean {
    return typeof document !== 'undefined' && document.querySelector('[data-carousel-dragging]') !== null;
}

function drainFetchQueue(): void {
    while (activeFetches < MAX_CONCURRENT && fetchQueue.length > 0) {
        activeFetches++;
        fetchQueue.shift()!();
    }
}

function enqueueFetch(task: () => Promise<void>): void {
    fetchQueue.push(() => {
        void task().finally(() => {
            activeFetches--;
            drainFetchQueue();
        });
    });
    drainFetchQueue();
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

async function loadCoverUrl(url: string): Promise<string> {
    try {
        const blobUrl = await fetchToBlobUrl(url);
        resolvedUrls.set(url, blobUrl);
        return blobUrl;
    } catch {
        await warmupImage(url);
        resolvedUrls.set(url, url);
        return url;
    }
}

export function isCoverCached(url: string): boolean {
    return resolvedUrls.has(url);
}

export function resolveCoverImageUrl(url: string): Promise<string> {
    if (!url || url === NOT_FOUND || url.startsWith('/') || url.startsWith('data:')) return Promise.resolve(url);
    if (resolvedUrls.has(url)) return Promise.resolve(resolvedUrls.get(url)!);

    const pending = inflight.get(url);
    if (pending) return pending;

    const promise = new Promise<string>((resolve) => {
        enqueueFetch(async () => {
            try {
                const src = await loadCoverUrl(url);
                resolve(src);
            } catch {
                resolvedUrls.set(url, url);
                resolve(url);
            } finally {
                inflight.delete(url);
            }
        });
    });

    inflight.set(url, promise);
    return promise;
}

function schedulePrefetch(url: string): void {
    const delayMs = prefetchDelayMs;
    prefetchDelayMs += 80;

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
    const unique = [...new Set(urls)].filter((url) => url && url !== NOT_FOUND && !resolvedUrls.has(url) && !inflight.has(url));
    for (const url of unique) schedulePrefetch(url);
}

export function scheduleCarouselPrefetch(urls: string[]): void {
    const unique = [...new Set(urls)].filter((url) => url && url !== NOT_FOUND);
    if (unique.length === 0) return;

    const run = () => prefetchCoverImages(unique);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 400);
}
