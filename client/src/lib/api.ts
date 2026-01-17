"use server";
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { cookies } from 'next/headers';

const instance = axios.create({
    baseURL: 'http://localhost:3000/api',
    withCredentials: true,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    validateStatus: (status) => status >= 200 && status < 500,
    timeout: 10000
});

instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const cookieStore = await cookies();
    config.headers['Cookie'] = cookieStore.toString();
    return config;
});

// Export a clean wrapper instead of the raw Axios instance
export const apiPost = async (url: string, data?: any) => {
    const res = await instance.post(url, data);
    return res.data;
};

export const apiGet = async (url: string) => {
    const res = await instance.get(url);
    return res.data;
};

export const apiDelete = async (url: string) => {
    const res = await instance.delete(url);
    return res.data;
}