/**
 * qBittorrent download client (Web API v2).
 *
 * Submits torrents (download-only, no seeding) and reports status for the poller.
 * In dev, all of qBittorrent's traffic is forced through the Mullvad VPN at the
 * docker level (network_mode: service:gluetun, killswitch); this client ALSO calls
 * `vpnGuardService.assertProtected()` before every submit as an app-level backstop,
 * so a misconfigured tunnel fails the job loudly instead of leaking.
 */
import axios, { type AxiosInstance } from 'axios';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { vpnGuardService } from '@/services/vpnGuardService';
import type { IDownloadClient, DownloadStatus, DownloadState } from './interfaces/IDownloadClient';
import type { ArchiveCandidate } from './interfaces/types';

interface QbtTorrentInfo {
    hash: string;
    name: string;
    state: string;
    progress: number;
    size: number;
    num_seeds: number;
    content_path?: string;
    save_path?: string;
}

/** qBittorrent states that mean the download has finished (it's now seeding/checked). */
const COMPLETED_STATES = new Set([
    'uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP', 'checkingUP',
]);
const ERROR_STATES = new Set(['error', 'missingFiles']);
const STALLED_STATES = new Set(['stalledDL']);

/**
 * Signals that qBittorrent rejected our session (HTTP 403). Because the axios
 * instance treats any status < 500 as a resolved response, a 403 never surfaces
 * as an axios error — so handlers throw this explicitly to let `withAuth` know it
 * should drop the cached cookie, re-login, and retry once.
 */
class QbtUnauthorizedError extends Error {}

export class QbittorrentClient implements IDownloadClient {
    readonly id = 'qbittorrent';
    private http: AxiosInstance;
    private cookie?: string;

    constructor() {
        this.http = axios.create({
            baseURL: appConfig.archive.qbittorrent.url.replace(/\/$/, ''),
            timeout: appConfig.archive.qbittorrent.timeout,
            // qBittorrent returns "Ok."/"Fails." as text for some endpoints.
            validateStatus: (s) => s < 500,
        });
    }

    private get cfg() {
        return appConfig.archive.qbittorrent;
    }

    /** Authenticate and cache the SID cookie; called lazily + on 403. */
    private async login(): Promise<void> {
        const body = new URLSearchParams({ username: this.cfg.username, password: this.cfg.password });
        const resp = await this.http.post('/api/v2/auth/login', body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: this.cfg.url },
        });
        // qBittorrent returns 200 "Ok." OR 204 No Content on success (version-dependent),
        // always with a Set-Cookie. Bad creds → 200 "Fails." and NO cookie; banned → 403.
        const setCookie = resp.headers['set-cookie']?.[0];
        if (resp.status >= 400 || !setCookie || /Fails/i.test(String(resp.data))) {
            throw new Error(`qBittorrent login failed (status ${resp.status})`);
        }
        this.cookie = setCookie.split(';')[0]; // QBT_SID_xxxx=...
    }

    /** Run a request with the auth cookie, transparently re-logging in once on 403. */
    private async withAuth<T>(fn: (headers: Record<string, string>) => Promise<T>): Promise<T> {
        if (!this.cookie) await this.login();
        try {
            return await fn({ Cookie: this.cookie! });
        } catch (err: any) {
            // A 403 surfaces either as our explicit QbtUnauthorizedError (validateStatus
            // swallowed it into a resolved response) or, defensively, as an axios 403.
            if (err instanceof QbtUnauthorizedError || err?.response?.status === 403) {
                this.cookie = undefined;
                await this.login();
                return fn({ Cookie: this.cookie! });
            }
            throw err;
        }
    }

    /** A 403 means the cached session expired; signal withAuth to re-login + retry. */
    private assertSession(resp: { status: number }): void {
        if (resp.status === 403) {
            throw new QbtUnauthorizedError('qBittorrent rejected the session (403)');
        }
    }

    async submit(candidate: ArchiveCandidate): Promise<string> {
        // Belt-and-suspenders: confirm the VPN tunnel before we ever touch a swarm.
        await vpnGuardService.assertProtected();

        const tag = `acq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const uri = candidate.downloadUri;

        if (uri.startsWith('magnet:')) {
            await this.withAuth((h) => this.addByUrl(h, uri, tag));
        } else {
            // The download link is an indexer/Prowlarr URL. qBittorrent runs inside the
            // VPN namespace and can't resolve internal docker names — so the worker
            // fetches the .torrent here and uploads the bytes (or follows a magnet redirect).
            const magnet = await this.fetchTorrentOrMagnet(uri, tag);
            if (magnet.kind === 'magnet') {
                await this.withAuth((h) => this.addByUrl(h, magnet.value, tag));
            } else {
                await this.withAuth((h) => this.addByFile(h, magnet.value, tag));
            }
        }

        // Resolve the infohash handle. Prefer the known hash; otherwise look it up by
        // the unique tag we just attached (robust for magnet AND .torrent submits).
        const handle = candidate.infoHash ?? (await this.resolveHashByTag(tag));
        logger.info(`[QBT] Submitted "${candidate.title.slice(0, 60)}" → handle ${handle}`, {
            service: 'qbittorrentClient',
        });
        return handle;
    }

    /** Add a magnet/URL torrent (qBittorrent fetches it). */
    private async addByUrl(headers: Record<string, string>, url: string, tag: string): Promise<void> {
        const form = new URLSearchParams({
            urls: url,
            savepath: appConfig.archive.pipeline.scratchDir,
            category: this.cfg.category,
            tags: tag,
            stopCondition: 'None', // download-only: never seed
        });
        const resp = await this.http.post('/api/v2/torrents/add', form, {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', Referer: this.cfg.url },
        });
        this.assertSession(resp);
        if (resp.status < 200 || resp.status >= 300 || /Fails/i.test(String(resp.data))) {
            throw new Error(`qBittorrent add (url) failed (status ${resp.status}): ${resp.data}`);
        }
    }

    /** Add a torrent from raw .torrent bytes (multipart upload). */
    private async addByFile(headers: Record<string, string>, bytes: Buffer, tag: string): Promise<void> {
        const fd = new FormData();
        fd.append('torrents', new Blob([new Uint8Array(bytes)], { type: 'application/x-bittorrent' }), 'archive.torrent');
        fd.append('savepath', appConfig.archive.pipeline.scratchDir);
        fd.append('category', this.cfg.category);
        fd.append('tags', tag);
        fd.append('stopCondition', 'None');
        const resp = await this.http.post('/api/v2/torrents/add', fd, {
            headers: { ...headers, Referer: this.cfg.url },
        });
        this.assertSession(resp);
        if (resp.status < 200 || resp.status >= 300 || /Fails/i.test(String(resp.data))) {
            throw new Error(`qBittorrent add (file) failed (status ${resp.status}): ${resp.data}`);
        }
    }

    /** Fetch a torrent download URL: returns the .torrent bytes, or a magnet if it redirects to one. */
    private async fetchTorrentOrMagnet(
        url: string,
        _tag: string
    ): Promise<{ kind: 'file'; value: Buffer } | { kind: 'magnet'; value: string }> {
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: this.cfg.timeout,
            maxRedirects: 0,
            validateStatus: (s) => (s >= 200 && s < 300) || (s >= 300 && s < 400),
        });
        if (resp.status >= 300) {
            const location = resp.headers['location'];
            if (typeof location === 'string' && location.startsWith('magnet:')) {
                return { kind: 'magnet', value: location };
            }
            throw new Error(`torrent download redirected to a non-magnet location: ${location ?? 'unknown'}`);
        }
        return { kind: 'file', value: Buffer.from(resp.data) };
    }

    private async resolveHashByTag(tag: string): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const list = await this.torrentsInfo({ tag });
            if (list[0]?.hash) return list[0].hash.toLowerCase();
            await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error(`qBittorrent: could not resolve torrent hash for tag ${tag}`);
    }

    async status(handle: string): Promise<DownloadStatus> {
        const list = await this.torrentsInfo({ hashes: handle });
        const t = list[0];
        if (!t) return { state: 'missing', progress: 0 };

        let state: DownloadState;
        if (ERROR_STATES.has(t.state)) state = 'error';
        else if (t.progress >= 1 || COMPLETED_STATES.has(t.state)) state = 'completed';
        else if (STALLED_STATES.has(t.state)) state = 'stalled';
        else if (t.state === 'queuedDL' || t.state === 'metaDL' || t.state === 'allocating') state = 'queued';
        else state = 'downloading';

        return {
            state,
            progress: t.progress ?? 0,
            outputDir: t.content_path || t.save_path,
            name: t.name,
            sizeBytes: t.size,
            seeders: t.num_seeds,
            error: state === 'error' ? `qBittorrent state: ${t.state}` : undefined,
        };
    }

    /** List torrents in our category (for orphan reconciliation). */
    async listCategory(): Promise<{ hash: string; name: string; state: string; path?: string }[]> {
        const list = await this.torrentsInfo({ category: this.cfg.category });
        return list.map((t) => ({
            hash: t.hash.toLowerCase(),
            name: t.name,
            state: t.state,
            path: t.content_path || t.save_path,
        }));
    }

    async remove(handle: string, deleteFiles: boolean): Promise<void> {
        const form = new URLSearchParams({ hashes: handle, deleteFiles: String(deleteFiles) });
        await this.withAuth(async (headers) => {
            const resp = await this.http.post('/api/v2/torrents/delete', form, {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', Referer: this.cfg.url },
            });
            this.assertSession(resp);
        });
        logger.info(`[QBT] Removed torrent ${handle} (deleteFiles=${deleteFiles})`, { service: 'qbittorrentClient' });
    }

    private async torrentsInfo(filter: { hashes?: string; tag?: string; category?: string }): Promise<QbtTorrentInfo[]> {
        return this.withAuth(async (headers) => {
            const params = new URLSearchParams();
            if (filter.hashes) params.set('hashes', filter.hashes);
            if (filter.tag) params.set('tag', filter.tag);
            if (filter.category) params.set('category', filter.category);
            const resp = await this.http.get('/api/v2/torrents/info', { headers, params });
            this.assertSession(resp);
            return Array.isArray(resp.data) ? resp.data : [];
        });
    }
}

export const qbittorrentClient = new QbittorrentClient();
