import axios from 'axios';
import { appConfig } from '@/config/appConfig';

export interface FlareSolverrCookie {
    name: string;
    value: string;
    expiry?: number;
}

export interface FlareSolverrResult {
    status?: string;
    message?: string;
    solution?: {
        status?: number;
        response?: string;
        cookies?: FlareSolverrCookie[];
        userAgent?: string;
    };
}

const FLARESOLVERR_HTTP_TIMEOUT_MS = 120_000;

// One serialization queue PER endpoint URL: requests to different FlareSolverr instances run
// concurrently, while requests to the same instance still queue (a single FlareSolverr solves
// one challenge at a time). This is what lets a pool of instances parallelize across scrapers.
const flareSolverrTails = new Map<string, Promise<void>>();

async function withFlareSolverrLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = flareSolverrTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    flareSolverrTails.set(key, current);
    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (flareSolverrTails.get(key) === current) flareSolverrTails.delete(key);
    }
}

let poolCursor = 0;

/** Resolve a FlareSolverr endpoint: an explicit per-scraper override wins; otherwise round-robin across the pool so concurrent scrapers spread across instances. Undefined when none configured. */
export function resolveFlareSolverrUrl(preferred?: string): string | undefined {
    const explicit = preferred?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const pool = appConfig.scraper.flareSolverrPool;
    if (!pool.length) return undefined;
    const url = pool[poolCursor % pool.length];
    poolCursor = (poolCursor + 1) % pool.length;
    return url;
}

/** Whether any FlareSolverr endpoint is available (explicit override or non-empty pool), without advancing the round-robin cursor. */
export function hasFlareSolverr(preferred?: string): boolean {
    return !!preferred?.trim() || appConfig.scraper.flareSolverrPool.length > 0;
}

export async function requestFlareSolverr(flareSolverrUrl: string, payload: Record<string, unknown>): Promise<FlareSolverrResult> {
    const baseUrl = flareSolverrUrl.replace(/\/$/, '');
    return withFlareSolverrLock(baseUrl, async () => {
        const response = await axios.post<FlareSolverrResult>(`${baseUrl}/v1`, payload, {
            timeout: FLARESOLVERR_HTTP_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            validateStatus: () => true,
        });

        if (response.status < 200 || response.status >= 300) {
            const detail = response.data?.message || (typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? ''));
            throw new Error(`FlareSolverr HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
        }
        if (response.data?.status !== 'ok') {
            throw new Error(`FlareSolverr error: ${response.data?.message || 'unknown error'}`);
        }
        return response.data;
    });
}
