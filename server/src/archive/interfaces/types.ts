/**
 * Shared types for the archive-ingestion (torrent) pipeline.
 * See docs/archive-ingestion-plan.md.
 */

export type ArchiveProtocol = 'torrent';

/** Coverage scope a candidate/torrent represents, used so a single-chapter torrent
 *  never wins a backfill slot (plan §2 ranking). */
export type ArchiveScope = 'series' | 'volume' | 'chapter' | 'unknown';

/** A numeric range parsed from a torrent title (e.g. `001-072`, `v01-13`). */
export interface ParsedRange {
    start: number;
    end: number;
}

/**
 * Structured signals extracted from a torrent title. Release naming is chaotic
 * (group tags, brackets, romaji|english dual-titles, range forms) — this captures
 * the parts the scorer and segmenter need. See risks §0a/§0b/§0c.
 */
export interface ParsedArchiveTitle {
    /** Original raw title. */
    raw: string;
    /** Title with tag groups, ranges, and format/status markers stripped. */
    cleanTitle: string;
    /** Candidate titles split on dual-title separators (`|`, `/`) — native + english. */
    titles: string[];
    /** Loose chapter range (e.g. `001-017`), when present. */
    chapterRange?: ParsedRange;
    /** Volume range (e.g. `v01-13`), when present. */
    volumeRange?: ParsedRange;
    /** Release-group tag, when detectable (e.g. `Oak`, `1r0n`). */
    group?: string;
    /** Marked complete (`[Completed]`, `(complete)`). */
    isComplete: boolean;
    /** Colored/Full-Color/Definitive variant (deprioritized — B&W canonical, Q10). */
    isColored: boolean;
    /** JPEG-XL release (sharp can't decode; deprioritized when a non-JXL twin exists). */
    isJxl: boolean;
    /** Audiobook (`[Audiobook]`, `.m4b`) — hard reject (cat 3_1 noise). */
    isAudiobook: boolean;
    /** Prose light-novel (`.epub`, `[J-Novel Club]`, `[Light Novel]`) — hard reject. */
    isNovel: boolean;
    /** Video / anime release (`BDRip`, `1080p`, `HEVC`, `.mkv`, …) — hard reject. */
    isVideo: boolean;
    /** Best-guess coverage scope from the title. */
    scope: ArchiveScope;
}

/**
 * A normalized search hit from an indexer (post-Torznab), before gating/ranking.
 */
export interface ArchiveCandidate {
    title: string;
    protocol: ArchiveProtocol;
    /** Magnet URI or .torrent download URL. */
    downloadUri: string;
    /** BitTorrent infohash when known — used as the dedupe hash and client handle. */
    infoHash?: string;
    sizeBytes: number;
    seeders: number;
    leechers?: number;
    ageDays?: number;
    /** Human-readable indexer name (e.g. "Nyaa"). */
    indexer: string;
    /** Prowlarr indexer id. */
    indexerId?: number;
    /** Language guessed from title/Torznab attrs. */
    languageGuess?: string;
    scope: ArchiveScope;
    /** Structured title parse (populated by the scorer). */
    parsed?: ParsedArchiveTitle;
}

/** A candidate that passed the gates, with its scoring breakdown (for logging/audit). */
export interface ScoredArchiveCandidate {
    candidate: ArchiveCandidate;
    /** Final composite rank score (higher = better). */
    score: number;
    /** 0–100 title-match score against the series titles. */
    titleScore: number;
    /** Why a candidate was rejected, when it failed a gate (null = passed). */
    rejectedReason: string | null;
}
