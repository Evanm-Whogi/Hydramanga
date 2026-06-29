/**
 * Scraper egress abstraction — the single chokepoint every scraper transport goes
 * through (axios, Playwright, image downloads).
 *
 * Goal: make scraper egress **proxy-agnostic**. With the proxy flag off, this is a
 * thin pass-through that hands back the same keep-alive `http`/`https` agents every
 * scraper used to inline — behaviour is byte-for-byte identical to before. With the
 * flag on, the same calls route through one configurable proxy URL
 * (`SCRAPER_PROXY_URL`, today a gluetun HTTP proxy; swap it for a residential
 * provider with zero scraper code changes). Per-scraper overrides win over the
 * global URL.
 *
 * The proxy scheme (`http(s)://` vs `socks5://`) picks the agent implementation.
 * `axios.create` callers get `proxy: false` set so axios doesn't *also* try to
 * proxy on top of the agent.
 *
 * Every axios instance built here also carries a response/error interceptor that
 * feeds ban detection (`scraperBanDetection`), so sustained IP blocks rotate the
 * exit IP without each scraper wiring detection by hand.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { noteScraperSuccess, recordScraperError } from './scraperBanDetection';

/** Keep-alive agent settings shared by every scraper (previously inlined per file). */
const KEEP_ALIVE_OPTS = {
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000,
};

const sharedHttpAgent = new http.Agent(KEEP_ALIVE_OPTS);
const sharedHttpsAgent = new https.Agent(KEEP_ALIVE_OPTS);

// Proxy agents are cached per resolved URL so we don't open a fresh connection
// pool on every scraper instantiation.
const proxyAgentCache = new Map<string, http.Agent>();

export interface ScraperAgents {
    httpAgent: http.Agent;
    httpsAgent: http.Agent;
}

/**
 * Resolve the proxy URL for a scraper: per-scraper override → global URL → none.
 * Returns `undefined` when the proxy is disabled or no URL is configured.
 */
export function resolveProxyUrl(scraperId?: string): string | undefined {
    const cfg = appConfig.scraper.proxy;
    if (!cfg.enabled) return undefined;
    // Per-scraper opt-out: some sites (e.g. Kagane) block datacenter IPs, so the
    // shared gluetun exit hurts them — let them egress directly even when the
    // global proxy is on.
    if (scraperId && cfg.disabled.includes(scraperId)) return undefined;
    const url = (scraperId && cfg.perScraper[scraperId]) || cfg.url;
    return url ? url.trim() || undefined : undefined;
}

function buildProxyAgent(proxyUrl: string): http.Agent {
    const cached = proxyAgentCache.get(proxyUrl);
    if (cached) return cached;
    const scheme = proxyUrl.split(':', 1)[0].toLowerCase();
    // These agents extend agent-base's Agent, which is structurally compatible with
    // http.Agent for our use (axios/node http only call connect/request hooks) but
    // not nominally assignable — cast through unknown.
    const proxyAgent = scheme.startsWith('socks')
        ? new SocksProxyAgent(proxyUrl)
        : new HttpsProxyAgent(proxyUrl);
    const agent = proxyAgent as unknown as http.Agent;
    proxyAgentCache.set(proxyUrl, agent);
    return agent;
}

/**
 * Build the `{ httpAgent, httpsAgent }` pair for a scraper. Bare keep-alive agents
 * when the proxy is off (today's behaviour); a single proxy agent used for both
 * schemes when it's on.
 */
export function buildAgents(scraperId?: string): ScraperAgents {
    const proxyUrl = resolveProxyUrl(scraperId);
    if (!proxyUrl) {
        return { httpAgent: sharedHttpAgent, httpsAgent: sharedHttpsAgent };
    }
    const agent = buildProxyAgent(proxyUrl);
    return { httpAgent: agent, httpsAgent: agent };
}

export interface BuildAxiosOptions {
    /** Scraper id for proxy override + ban-signal attribution. */
    scraperId?: string;
    timeout?: number;
    headers?: Record<string, string>;
    /** Extra axios config merged last (e.g. maxRedirects, validateStatus). */
    extra?: AxiosRequestConfig;
}

/**
 * Drop-in replacement for each scraper's static `axios.create(...)`. Injects the
 * resolved agents, disables axios' own proxy handling, and attaches ban-signal
 * interceptors. With the flag off this is identical to a plain keep-alive axios
 * instance.
 */
export function buildAxios(opts: BuildAxiosOptions = {}): AxiosInstance {
    const { scraperId, timeout, headers, extra } = opts;
    const { httpAgent, httpsAgent } = buildAgents(scraperId);

    const instance = axios.create({
        ...(timeout !== undefined ? { timeout } : {}),
        httpAgent,
        httpsAgent,
        // We supply the proxying via the agent; tell axios not to double-handle it.
        proxy: false,
        ...(headers ? { headers } : {}),
        ...(extra ?? {}),
    });

    instance.interceptors.response.use(
        (response) => {
            if (scraperId) noteScraperSuccess(scraperId);
            return response;
        },
        (error) => {
            // Classify + count in the background; never block the rejection.
            void recordScraperError(scraperId, error);
            return Promise.reject(error);
        }
    );

    return instance;
}

export interface PlaywrightProxy {
    server: string;
    username?: string;
    password?: string;
}

/**
 * Build a Playwright `proxy` option from the resolved proxy URL, or `undefined`
 * when the proxy is off. Playwright wants the server without credentials in the
 * URL and the credentials split out.
 */
export function getPlaywrightProxy(scraperId?: string): PlaywrightProxy | undefined {
    const proxyUrl = resolveProxyUrl(scraperId);
    if (!proxyUrl) return undefined;
    try {
        const parsed = new URL(proxyUrl);
        const server = `${parsed.protocol}//${parsed.host}`;
        const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
        const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
        return { server, ...(username ? { username } : {}), ...(password ? { password } : {}) };
    } catch (err) {
        logger.warn(`[scraperEgress] Invalid proxy URL for Playwright: ${(err as Error).message}`, {
            service: 'scraperEgress',
        });
        return undefined;
    }
}

/**
 * Pick a user agent from the rotation pool (politeness), or `undefined` when no
 * pool is configured so callers fall back to their own UA.
 */
export function pickUserAgent(): string | undefined {
    const pool = appConfig.scraper.userAgents;
    if (!pool.length) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
}
