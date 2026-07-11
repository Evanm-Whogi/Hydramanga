/**
 * Indexer abstraction for the archive pipeline. A single concrete impl
 * (`ProwlarrIndexerService`) fronts all torrent indexers (nyaa et al.) via
 * Prowlarr's Torznab API, so the rest of the pipeline integrates against one
 * service. A Usenet/Newznab tier could be added behind the same interface later.
 */
import type { ArchiveCandidate } from './types';

export interface ArchiveSearchInput {
    /** Primary search title (resolved from `series.titles`). */
    query: string;
    /** Native + secondary titles, used to widen matching (titles often dual-encode). */
    altTitles?: string[];
    /** Series id, for logging/correlation. */
    seriesId?: number;
}

export interface IArchiveIndexer {
    /** Stable id, e.g. `'prowlarr'`. */
    readonly id: string;
    /**
     * Search the indexer(s) and return normalized candidates (ungated, unranked).
     * @param limit max results to return.
     */
    search(input: ArchiveSearchInput, limit?: number): Promise<ArchiveCandidate[]>;
}
