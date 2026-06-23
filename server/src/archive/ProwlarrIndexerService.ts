/**
 * Prowlarr indexer service.
 *
 * Fronts all configured torrent indexers (nyaa et al.) through Prowlarr's single
 * normalized search API (`/api/v1/search`), so the pipeline integrates against one
 * service. Returns ungated/unranked `ArchiveCandidate`s — gating + ranking is the
 * `ArchiveCandidateScorer`'s job.
 */
import axios from 'axios';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import type { IArchiveIndexer, ArchiveSearchInput } from './interfaces/IArchiveIndexer';
import type { ArchiveCandidate } from './interfaces/types';

/** Subset of Prowlarr's ReleaseResource we consume. */
interface ProwlarrRelease {
    title?: string;
    size?: number;
    seeders?: number;
    leechers?: number;
    /** Age in days (Prowlarr-computed). */
    age?: number;
    publishDate?: string;
    protocol?: string; // 'torrent' | 'usenet'
    magnetUrl?: string;
    downloadUrl?: string;
    infoHash?: string;
    indexer?: string;
    indexerId?: number;
}

const MAX_QUERIES = 3;

export class ProwlarrIndexerService implements IArchiveIndexer {
    readonly id = 'prowlarr';

    private get cfg() {
        return appConfig.archive.prowlarr;
    }

    async search(input: ArchiveSearchInput, limit = 50): Promise<ArchiveCandidate[]> {
        if (!this.cfg.apiKey) {
            logger.warn('[PROWLARR] No API key configured; skipping search', { service: 'prowlarrIndexerService' });
            return [];
        }

        // Search the primary title plus a couple of alt titles (native/secondary),
        // since releases often dual-encode and nyaa indexes both forms.
        const queries = this.dedupeQueries([input.query, ...(input.altTitles ?? [])]);
        const byHash = new Map<string, ArchiveCandidate>();

        for (const query of queries) {
            try {
                const releases = await this.searchOne(query, limit);
                for (const r of releases) {
                    const candidate = this.toCandidate(r);
                    if (!candidate) continue;
                    const key = candidate.infoHash || candidate.downloadUri;
                    if (!byHash.has(key)) byHash.set(key, candidate);
                }
            } catch (err) {
                logger.warn(
                    `[PROWLARR] Search failed for "${query}" (series ${input.seriesId ?? 'n/a'}): ${err instanceof Error ? err.message : err}`,
                    { service: 'prowlarrIndexerService' }
                );
            }
        }

        const candidates = [...byHash.values()];
        logger.info(
            `[PROWLARR] ${candidates.length} unique candidate(s) for "${input.query}" across ${queries.length} quer(ies)`,
            { service: 'prowlarrIndexerService' }
        );
        return candidates;
    }

    private async searchOne(query: string, limit: number): Promise<ProwlarrRelease[]> {
        // Build params manually so indexerIds serializes as repeated keys (Prowlarr's form).
        const params = new URLSearchParams();
        params.set('query', query);
        params.set('type', 'search');
        params.set('limit', String(limit));
        for (const id of this.cfg.indexerIds) params.append('indexerIds', String(id));

        const resp = await axios.get(`${this.cfg.url.replace(/\/$/, '')}/api/v1/search`, {
            params,
            headers: { 'X-Api-Key': this.cfg.apiKey },
            timeout: this.cfg.timeout,
        });
        return Array.isArray(resp.data) ? resp.data : [];
    }

    private toCandidate(r: ProwlarrRelease): ArchiveCandidate | null {
        if (r.protocol && r.protocol !== 'torrent') return null; // torrent-only (v1)
        const downloadUri = r.magnetUrl || r.downloadUrl;
        if (!downloadUri || !r.title) return null;

        const ageDays =
            r.age != null
                ? r.age
                : r.publishDate
                  ? Math.max(0, (Date.now() - new Date(r.publishDate).getTime()) / 86_400_000)
                  : undefined;

        return {
            title: r.title,
            protocol: 'torrent',
            downloadUri,
            infoHash: r.infoHash ? r.infoHash.toLowerCase() : undefined,
            sizeBytes: r.size ?? 0,
            seeders: r.seeders ?? 0,
            leechers: r.leechers,
            ageDays,
            indexer: r.indexer ?? 'unknown',
            indexerId: r.indexerId,
            scope: 'unknown',
        };
    }

    private dedupeQueries(queries: string[]): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const q of queries) {
            const trimmed = (q || '').trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(trimmed);
            if (out.length >= MAX_QUERIES) break;
        }
        return out;
    }
}

export const prowlarrIndexerService = new ProwlarrIndexerService();
