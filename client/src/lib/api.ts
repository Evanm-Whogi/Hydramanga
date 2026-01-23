"use server";
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerApiBase } from './env';

const instance = axios.create({
    baseURL: getServerApiBase(),
    withCredentials: true,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    validateStatus: (status) => status >= 200 && status < 400, // Only accept 2xx and 3xx
    timeout: 10000
});

instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const cookieStore = await cookies();
    config.headers['Cookie'] = cookieStore.toString();
    
    // Forward the real client IP from Next.js to backend for tracking
    // Next.js provides this via headers() in server components/actions
    try {
        const { headers } = await import('next/headers');
        const headersList = await headers();
        const forwarded = headersList.get('x-forwarded-for');
        const realIp = headersList.get('x-real-ip');
        
        if (forwarded) {
            config.headers['x-forwarded-for'] = forwarded;
        } else if (realIp) {
            config.headers['x-real-ip'] = realIp;
        }
    } catch (e) {
        // Silently ignore - headers might not be available in all contexts
    }
    
    return config;
});

// Helper function to handle backend connection errors
const handleBackendError = (error: any) => {
    // Check if it's a network error (backend unreachable)
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' || 
        error.message?.includes('Network Error') ||
        !error.response) {
        console.error('Backend unreachable:', error.message);
        redirect('/error-500');
    }
    
    // Check if it's a 500-level server error
    if (error.response && error.response.status >= 500) {
        console.error('Server error:', error.response.status, error.response.data);
        redirect('/error-500');
    }
    
    throw error;
};

// Export a clean wrapper instead of the raw Axios instance
export const apiPost = async (url: string, data?: any) => {
    try {
        const res = await instance.post(url, data);
        return res.data;
    } catch (error: any) {
        // Extract error response if available and throw as proper Error
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        handleBackendError(error);
    }
};

export const apiGet = async (url: string) => {
    try {
        const res = await instance.get(url);
        return res.data;
    } catch (error: any) {
        // Extract error response if available and throw as proper Error
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        handleBackendError(error);
    }
};

export const apiDelete = async (url: string) => {
    try {
        const res = await instance.delete(url);
        return res.data;
    } catch (error: any) {
        // Extract error response if available and throw as proper Error
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || 'Request failed';
            throw new Error(errorMessage);
        }
        handleBackendError(error);
    }
}