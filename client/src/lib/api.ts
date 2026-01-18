"use server";
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const instance = axios.create({
    baseURL: 'http://localhost:3000/api',
    withCredentials: true,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    validateStatus: (status) => status >= 200 && status < 400, // Only accept 2xx and 3xx
    timeout: 10000
});

instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const cookieStore = await cookies();
    config.headers['Cookie'] = cookieStore.toString();
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
    } catch (error) {
        console.log('API POST error:', error);
        handleBackendError(error);
    }
};

export const apiGet = async (url: string) => {
    try {
        const res = await instance.get(url);

        return res.data;
    } catch (error) {
        console.log('API GET error:', error);
        handleBackendError(error);
    }
};

export const apiDelete = async (url: string) => {
    try {
        const res = await instance.delete(url);
        return res.data;
    } catch (error) {
        console.log('API DELETE error:', error);
        handleBackendError(error);
    }
}