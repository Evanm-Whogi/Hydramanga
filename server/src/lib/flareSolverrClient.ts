import axios from 'axios';

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

let flareSolverrTail: Promise<void> = Promise.resolve();

async function withFlareSolverrLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = flareSolverrTail;
    let release!: () => void;
    flareSolverrTail = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        return await fn();
    } finally {
        release();
    }
}

export async function requestFlareSolverr(flareSolverrUrl: string, payload: Record<string, unknown>): Promise<FlareSolverrResult> {
    const baseUrl = flareSolverrUrl.replace(/\/$/, '');
    return withFlareSolverrLock(async () => {
        const response = await axios.post<FlareSolverrResult>(`${baseUrl}/v1`, payload, {
            timeout: FLARESOLVERR_HTTP_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            validateStatus: () => true,
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`FlareSolverr HTTP ${response.status}`);
        }
        if (response.data?.status !== 'ok') {
            throw new Error(`FlareSolverr error: ${response.data?.message || 'unknown error'}`);
        }
        return response.data;
    });
}
