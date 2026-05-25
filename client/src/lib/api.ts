import axios, { InternalAxiosRequestConfig } from 'axios';
import { getServerApiBase, getClientApiBase } from './env';
import { RateLimitError, parseRetryAfterMs } from './rateLimit';
import { handleBannedApiResponse, handleUnauthorizedApiResponse } from './authSession';

let serverInstance: ReturnType<typeof axios.create> | null = null;

const getServerInstance = async () => {
    if (serverInstance) return serverInstance;

    const instance = axios.create({
        baseURL: getServerApiBase(),
        withCredentials: true,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        validateStatus: (status) => status >= 200 && status < 400, // Only accept 2xx and 3xx
        timeout: 10000
    });

    instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
        const { cookies, headers } = await import('next/headers');
        const cookieStore = await cookies();
        config.headers['Cookie'] = cookieStore.toString();

        // Forward the real client IP and user-agent from Next.js to backend
        try {
            const headersList = await headers();
            const forwarded = headersList.get('x-forwarded-for');
            const realIp = headersList.get('x-real-ip');
            const userAgent = headersList.get('user-agent');

            if (forwarded) {
                config.headers['x-forwarded-for'] = forwarded;
            } else if (realIp) {
                config.headers['x-real-ip'] = realIp;
            }

            if (userAgent) {
                config.headers['user-agent'] = userAgent;
            }
        } catch (e) {
            // Silently ignore - headers might not be available in all contexts
        }

        return config;
    });

    serverInstance = instance;
    return instance;
};

const handleBackendError = async (error: any) => {
    const { redirect } = await import('next/navigation');
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 403 && data?.code === 'BANNED') {
        redirect('/login?banned=1');
    }

    if (status === 401) {
        redirect('/login');
    }

    // Check if it's a network error (backend unreachable)
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('Network Error') ||
        !error.response) {
        redirect('/error-500');
    }

    // Check if it's a 500-level server error
    if (status >= 500) {
        redirect('/error-500');
    }

    throw error;
};

const clientFetch = async (url: string, options: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 30000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
    const res = await fetch(`${getClientApiBase()}${url}` , {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        signal: controller.signal,
        ...fetchOptions,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 403 && data?.code === 'BANNED') {
            await handleBannedApiResponse(data?.message);
        }
        if (res.status === 401) {
            await handleUnauthorizedApiResponse();
        }
        if (res.status === 429) {
            throw new RateLimitError(
                data?.message || 'Too many requests. Please wait before trying again.',
                parseRetryAfterMs(res, data)
            );
        }
        throw new Error(data?.message || 'Request failed');
    }
    return data;
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const apiPost = async (url: string, data?: any) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'POST', body: JSON.stringify(data ?? {}) });
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.post(url, data);
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};

export const apiGet = async (url: string, options?: { timeoutMs?: number }) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'GET', timeoutMs: options?.timeoutMs });
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.get(url);
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};

export const apiDelete = async (url: string, data?: any) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined });
    }

    try {
        const instance = await getServerInstance();
        // axios delete supports request body via the config object
        const res = await instance.delete(url, data ? { data } : undefined);
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};

export const apiPut = async (url: string, data?: any) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'PUT', body: JSON.stringify(data ?? {}) });
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.put(url, data);
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};

export const apiPatch = async (url: string, data?: any) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'PATCH', body: JSON.stringify(data ?? {}) });
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.patch(url, data);
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};
export const apiPostFormData = async (url: string, formData: FormData) => {
    if (typeof window !== 'undefined') {
        const res = await fetch(`${getClientApiBase()}${url}`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 403 && data?.code === 'BANNED') {
                await handleBannedApiResponse(data?.message);
            }
            if (res.status === 401) {
                await handleUnauthorizedApiResponse();
            }
            throw new Error(data?.error || data?.message || 'Request failed');
        }
        return data;
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.post(url, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    } catch (error: any) {
        if (error.response) await handleBackendError(error);
        throw error;
    }
};