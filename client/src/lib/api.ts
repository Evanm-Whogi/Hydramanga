import axios, { InternalAxiosRequestConfig } from 'axios';
import { getServerApiBase, getClientApiBase } from './env';

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

    // Check if it's a network error (backend unreachable)
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('Network Error') ||
        !error.response) {
        redirect('/error-500');
    }

    // Soft redirect for 401 Unauthorized
    if (error.response && error.response.status === 401) {
        redirect('/login');
    }

    // Check if it's a 500-level server error
    if (error.response && error.response.status >= 500) {
        redirect('/error-500');
    }

    throw error;
};

const clientFetch = async (url: string, options: RequestInit) => {
    const res = await fetch(`${getClientApiBase()}${url}` , {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        ...options,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || 'Request failed');
    }
    return data;
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
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        await handleBackendError(error);
    }
};

export const apiGet = async (url: string) => {
    if (typeof window !== 'undefined') {
        return clientFetch(url, { method: 'GET' });
    }

    try {
        const instance = await getServerInstance();
        const res = await instance.get(url);
        return res.data;
    } catch (error: any) {
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        await handleBackendError(error);
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
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        await handleBackendError(error);
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
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        await handleBackendError(error);
    }
};
