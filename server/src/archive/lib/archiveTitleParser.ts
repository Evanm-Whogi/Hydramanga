/**
 * Torrent-title parser for the archive pipeline.
 *
 * Release naming is chaotic and the chapter range + volume mapping usually live in
 * the TITLE (`001-017 as v01-03`, `v001-111 + 1134-1176`) — a strong prior for both
 * disambiguation (which series) and segmentation (which chapters). This extracts:
 *   - dual titles (`Kimi wa Houkago Insomnia | Insomniacs After School`)
 *   - chapter / volume ranges incl. compound + decimals
 *   - format/status markers (complete, colored, JXL, audiobook, novel)
 *   - release group
 * See docs/archive-ingestion-risks.md §0a/§0b/§0c.
 */
import type { ParsedArchiveTitle, ParsedRange, ArchiveScope } from '../interfaces/types';

/** Tag tokens that are never the release group (format/quality/source markers). */
const NON_GROUP_TOKENS = new Set([
    'digital', 'digital-compilation', 'compilation', 'completed', 'complete', 'ongoing',
    'webrip', 'web', 'manga', 'manhua', 'manhwa', 'webtoon', 'colored', 'full color',
    'definitive edition', 'new translation edition', 'jpeg-xl', 'jxl', 'audiobook',
    'light novel', 'novel', 'omnibus', 'hd', 'uhd', 'raw', 'scan', 'scans',
]);

/** A 4-digit year or year-range (so `(2003-2026)` isn't read as a chapter range). */
const YEAR_RANGE = /^(?:19|20)\d{2}(?:\s*-\s*(?:19|20)\d{2})?$/;

/** Split a string into bracketed/parenthesized/braced tag groups + the bare remainder. */
function extractTagGroups(raw: string): { tags: string[]; bare: string } {
    const tags: string[] = [];
    const bare = raw.replace(/[([{]([^)\]}]*)[)\]}]/g, (_m, inner: string) => {
        tags.push(inner.trim());
        return ' ';
    });
    return { tags, bare: bare.replace(/\s+/g, ' ').trim() };
}

/** Parse a "NN-MM" (or single "NN") numeric range, tolerating decimals + zero-pad. */
function parseRange(text: string): ParsedRange | undefined {
    const m = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
    if (m) {
        const start = parseFloat(m[1]);
        const end = parseFloat(m[2]);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return { start, end };
    }
    const single = text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    if (single) {
        const n = parseFloat(single[1]);
        if (Number.isFinite(n)) return { start: n, end: n };
    }
    return undefined;
}

/** Extract a volume range like `v01-13` / `v001-111` / `vol. 1-3` from a fragment. */
function parseVolumeRange(fragment: string): ParsedRange | undefined {
    const m = fragment.match(/\bv(?:ol)?\.?\s*(\d+)\s*(?:-\s*v?(\d+))?/i);
    if (!m) return undefined;
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    if (Number.isFinite(start) && end >= start) return { start, end };
    return undefined;
}

/** Volume token (`v01`, `v001-111`, `vol. 1-3`) used to strip volumes before chapter parsing. */
const VOLUME_TOKEN = /\bv(?:ol)?\.?\s*\d+(?:\s*-\s*v?\d+)?/gi;

/**
 * Extract a chapter range from the FULL title (ranges often live inside brackets,
 * e.g. `(Chapter 01-91)`, so we don't restrict to the bare remainder). Handles
 * `001-072`, `001-017 as v01-03`, compound `v01-13 + 117-125.1`, and decimals.
 * Volume tokens are removed first so volume digits are never read as chapters
 * (the compound `v001-111 + 1134-1176` → chapter range `1134-1176`).
 */
function parseChapterRange(title: string): ParsedRange | undefined {
    const noVol = title.replace(VOLUME_TOKEN, ' ');

    // Prefer an explicit "Chapter NN-MM" form.
    const kw = noVol.match(/\b(?:chapters?|chap|ch)\.?\s*(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?)/i);
    if (kw) {
        const r = parseRange(kw[1]);
        if (r) return r;
    }

    // First numeric range that isn't a year (e.g. `(2003-2026)`).
    const ranges = noVol.matchAll(/(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?)/g);
    for (const rm of ranges) {
        if (YEAR_RANGE.test(rm[1].replace(/\s/g, ''))) continue;
        const r = parseRange(rm[1]);
        if (r) return r;
    }

    return undefined;
}

function inferScope(chapterRange?: ParsedRange, volumeRange?: ParsedRange): ArchiveScope {
    if (chapterRange) {
        return chapterRange.end > chapterRange.start ? 'series' : 'chapter';
    }
    if (volumeRange) {
        return volumeRange.end > volumeRange.start ? 'series' : 'volume';
    }
    return 'unknown';
}

/** Split dual titles on `|` and ` / ` (native romaji + english), keeping non-empty parts. */
function splitTitles(cleanTitle: string): string[] {
    return cleanTitle
        .split(/\s*[|]\s*|\s+\/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

/**
 * Remove range/volume/`as`/year fragments from the bare title to recover the human
 * series title used for matching. Stops at the first range-like or volume token.
 */
function deriveCleanTitle(bare: string): string {
    // Cut everything from the first volume/range/year/`as`/connector-range marker.
    const cut = bare.search(
        /\b(?:v(?:ol)?\.?\s*\d|chapters?\b|chap\b|ch\.?\s*\d|\d+\s*-\s*\d|\bas\s+v|\((?:19|20)\d{2})/i
    );
    let head = cut >= 0 ? bare.slice(0, cut) : bare;
    // Trailing lone numbers (single-chapter torrents like "One Piece 1185").
    head = head.replace(/\s+\d+(?:\.\d+)?\s*$/, '');
    return head.replace(/[\s_.+-]+$/, '').replace(/\s+/g, ' ').trim();
}

function pickGroup(tags: string[]): string | undefined {
    // Release group is usually a short tag that isn't a known format/quality marker,
    // isn't a year, and isn't a range. Prefer the last such tag (nyaa convention).
    for (let i = tags.length - 1; i >= 0; i--) {
        const t = tags[i].trim();
        const lower = t.toLowerCase().replace(/-jxl$/, '');
        if (!t) continue;
        if (NON_GROUP_TOKENS.has(lower)) continue;
        if (YEAR_RANGE.test(t.replace(/\s/g, ''))) continue;
        if (/\d+\s*-\s*\d+/.test(t)) continue;
        if (/^v?\d+$/i.test(t)) continue;
        return t;
    }
    return undefined;
}

export function parseArchiveTitle(raw: string): ParsedArchiveTitle {
    const title = (raw || '').trim();
    const lower = title.toLowerCase();
    const { tags, bare } = extractTagGroups(title);

    const isComplete = /\b(complete|completed)\b/i.test(title);
    const isColored = /\b(colored|full[\s-]?color|definitive edition)\b/i.test(title);
    const isJxl = /\bjpe?g[\s-]?xl\b|\bjxl\b|-jxl\b/i.test(title);
    const isAudiobook = /\baudiobook\b|\.m4b\b/i.test(title);
    const isNovel = /\.epub\b|\bj-?novel\b|\blight novel\b|\bln\b/i.test(lower);
    // Video/anime releases flood an unfiltered Nyaa search and many manga share a
    // title with their anime adaptation, so reject on strong video markers.
    const isVideo =
        /\b(1080p|720p|480p|2160p|4k|hevc|x26[45]|h\.?26[45]|av1|10bit|bdrip|blu-?ray|web-?dl|webrip|hdtv|dvdrip|vostfr|hardsub|dual[\s-]?audio)\b/i.test(title) ||
        /\.(mkv|mp4|avi)\b/i.test(title);

    // Ranges can live inside brackets, so parse them from the full title; the human
    // title (for matching) comes from the bracket-stripped bare remainder.
    const chapterRange = parseChapterRange(title);
    const volumeRange = parseVolumeRange(title);
    const cleanTitle = deriveCleanTitle(bare);

    return {
        raw: title,
        cleanTitle,
        titles: splitTitles(cleanTitle),
        chapterRange,
        volumeRange,
        group: pickGroup(tags),
        isComplete,
        isColored,
        isJxl,
        isAudiobook,
        isNovel,
        isVideo,
        scope: inferScope(chapterRange, volumeRange),
    };
}

/**
 * Normalize a title for fuzzy matching: lowercase, strip diacritics, collapse
 * connectors/punctuation to spaces. Used by the candidate scorer.
 */
export function normalizeForMatch(input: string): string {
    return (input || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
