/**
 * Archive Layout Parser — the #1 technical risk (plan §5.1).
 *
 * Given the image files unpacked from an archive (plus the torrent-title parse as a
 * prior), segment them into ingestable units. Release layouts vary wildly, so the
 * parser evaluates THREE interpretations and emits the most confident one:
 *
 *   - `chapter` mode — explicit chapter structure (`Ch.001/`, `c001/`, `Chapter 1/`,
 *     `0001-012.jpg`, loose `<Title> 117/` folders). Each chapter → one reader chapter.
 *   - `volume`  mode — volume-only packs (one `.cbz` per volume, bare-numbered pages,
 *     no chapter boundaries). Each VOLUME becomes one reader chapter, numbered by its
 *     volume number (with `volumeNumber` set + a "Volume N" title). This is the common
 *     digital-publisher layout (Yen Press, Seven Seas …) that used to dead-end in
 *     needs_review.
 *   - single-book — one container of sequential pages with no markers → one unit.
 *
 * The caller (`archiveIngestService`) auto-ingests when `overallConfidence` clears the
 * threshold and routes everything else to `needs_review` (skip-and-log), never silently
 * guessing. Chapter numbers are normalized the same way the scrape path stores them
 * (bare numeric string, decimals preserved) so the `(seriesId, chapterNumber)` unique
 * key lines up and skip-if-present works (plan §11.4). Volume mode numbers are kept
 * numeric so they sort correctly under the reader's integer-cast ordering.
 */
import path from 'path';
import { naturalCompare } from './lib/archiveUnpack';
import type { ParsedArchiveTitle } from './interfaces/types';
import logger from '@/services/loggerService';

/** How an archive was segmented. `none` = nothing usable detected. */
export type ArchiveLayoutMode = 'chapter' | 'volume' | 'single' | 'none';

/**
 * Volume-like modes ingest by whole-volume/whole-book unit (chapterNumber = volume
 * number). Their numbering collides with a scraper's real chapter numbers on the
 * `(seriesId, chapterNumber)` key, so they may only auto-ingest for archive-only series
 * (no scrape will run). `chapter` mode is scrape-compatible and always safe.
 */
export function isVolumeLikeMode(mode: ArchiveLayoutMode): boolean {
    return mode === 'volume' || mode === 'single';
}

export interface ParsedChapterLayout {
    chapterNumber: string;
    volume?: string;
    /** Display title override (e.g. "Volume 3"); when absent the caller defaults to "Chapter N". */
    title?: string;
    pages: string[];
    confidence: number;
}

export interface ArchiveLayout {
    chapters: ParsedChapterLayout[];
    overallConfidence: number;
    /** Which interpretation produced `chapters`. */
    mode: ArchiveLayoutMode;
    /** True when the chosen interpretation is volume-based (one chapter per volume). */
    volumeOnly: boolean;
    totalImages: number;
    assignedImages: number;
    /** Human-readable explanation (stored on needs_review rows). */
    reason: string;
    /** A few example image paths (relative to the archive root) for diagnosis / the v2 dataset. */
    samplePaths: string[];
}

// Chapter marker anywhere in a filename/segment: "c001", "ch 12", "chapter 5",
// "ep07" — bounded so a stray 'c' inside a word (Insomnia[c]s) never matches and
// so volume "(v01)" / page "p009" tokens are not mistaken for chapters.
// Group 2 captures a trailing "xN" split-part suffix (danke-Empire's "c001x1").
// We must still CAPTURE it (otherwise the "x1" tail breaks the match boundary and
// the page goes unassigned), but it is NOT a sub-chapter: in danke releases "xN"
// marks trailing extras/credits or a split part that belongs to the base chapter
// (e.g. "your name. c003x1" is the credits after ch.3, not ch.3.1). chapterKeyFromMarker
// folds it into the BASE chapter; its volume-global page number keeps it in order.
const CHAPTER_MARKER = /(?:^|[\s._\-[(])(?:chapters?|chap|ch|episodes?|ep|c)\.?\s*#?0*(\d+(?:\.\d+)?)(?:x(\d+))?(?=$|[\s._\-)\]])/i;
// Volume marker: "v01", "vol. 3", "(v12)".
const VOLUME_MARKER = /(?:^|[\s._\-[(])v(?:ol(?:ume)?)?\.?\s*0*(\d+)(?=$|[\s._\-)\]])/i;
// Page marker: "p009", "pg 12", "page 4".
const PAGE_MARKER = /(?:^|[\s._\-[(])p(?:g|age)?\.?\s*0*(\d+)(?=$|[\s._\-)\]])/i;
const BARE_NUMBER_SEG = /^0*(\d+(?:\.\d+)?)$/;
/** Two-number filename like `001-012.jpg` / `001_012` (chapter-page). */
const CHAPTER_PAGE_NAME = /^0*(\d+)[\s._-]+0*(\d+)$/;

/**
 * A single-container archive with no chapter/volume markers is ingested as ONE unit
 * (single chapter/volume) only when it's plausibly one book. Above this page count a
 * flat, marker-less pile is more likely a whole un-split catalog, so it drops in
 * confidence and routes to needs_review instead of becoming one giant "chapter".
 */
const SINGLE_BOOK_MAX_PAGES = 120;

function normalizeChapterNumber(raw: string): string {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? String(n) : raw;
}

/** Normalize a volume token ("03" → "3") to a bare numeric string. */
function normalizeVolumeNumber(raw: string): string {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? String(n) : raw;
}

/**
 * Build a chapter key from a CHAPTER_MARKER match. The danke "xN" suffix (group 2) is
 * NOT a sub-chapter — it marks trailing extras/credits or a split part of the base
 * chapter (e.g. "c003x1" is the credits after ch.3, not ch.3.1). It is captured only
 * to consume the tail so the match boundary holds, then dropped: "c003x1" → "3". The
 * extra pages merge into the base chapter and sort after it by their (volume-global)
 * page number.
 */
function chapterKeyFromMarker(m: RegExpMatchArray | null): string | null {
    if (!m) return null;
    return m[1];
}

function lastNumber(name: string): number | null {
    const matches = name.match(/\d+/g);
    if (!matches) return null;
    return parseInt(matches[matches.length - 1], 10);
}

/** Strip bracketed tag groups for cleaner title/number parsing of a folder name. */
function stripTags(s: string): string {
    return s.replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Loose-chapter folder named "<Series Title> <chapter> (tags)" → chapter number.
 * Uses the title prior to strip the series name, preserving decimals (125.1). A
 * volume folder ("…<Title> v03 (…)") returns null — its chapters come from page
 * filenames, not the folder.
 */
function chapterFromTitledSegment(segment: string, titles: string[]): string | null {
    let rest = stripTags(segment);
    for (const t of [...titles].sort((a, b) => b.length - a.length)) {
        const tl = t.trim();
        if (tl && rest.toLowerCase().startsWith(tl.toLowerCase())) {
            rest = rest.slice(tl.length).trim();
            break;
        }
    }
    if (/^v(?:ol)?\.?\s*\d/i.test(rest)) return null; // volume folder, not a loose chapter
    const m = rest.match(/^[-#\s]*0*(\d+(?:\.\d+)?)\b/);
    return m ? m[1] : null;
}

interface ImageAnalysis {
    file: string;
    chapter: string | null;
    page: number | null;
    volume: string | null;
    /** Top-level path segment below the common root (the "book" this page belongs to). */
    container: string;
}

/** First volume marker found in the filename, then dir segments deepest-first. */
function volumeFromPath(base: string, dirSegments: string[]): string | null {
    const inBase = base.match(VOLUME_MARKER);
    if (inBase) return normalizeVolumeNumber(inBase[1]);
    for (let i = dirSegments.length - 1; i >= 0; i--) {
        const m = dirSegments[i].match(VOLUME_MARKER);
        if (m) return normalizeVolumeNumber(m[1]);
    }
    return null;
}

/** Inspect one image's path segments + filename for chapter/page/volume signals. */
function analyzeImage(file: string, rootSegmentsCount: number, titles: string[]): ImageAnalysis {
    const segments = file.split(path.sep);
    // Only consider segments below the common root (the archive's own structure).
    const relSegments = segments.slice(rootSegmentsCount);
    const dirSegments = relSegments.slice(0, -1);
    const base = path.basename(file, path.extname(file));
    const container = dirSegments.length > 0 ? dirSegments[0] : '';

    const volume = volumeFromPath(base, dirSegments);

    // 1) Chapter marker in the page filename (e.g. "… - c001 (v01) - p009 …").
    let chapter: string | null = chapterKeyFromMarker(base.match(CHAPTER_MARKER));

    // 2) Otherwise a chapter folder, deepest-first: "Chapter 5" / "c005" / "005" /
    //    or a loose-chapter folder "<Title> 117 (…)".
    if (!chapter) {
        for (let i = dirSegments.length - 1; i >= 0; i--) {
            const seg = dirSegments[i].trim();
            const m =
                chapterKeyFromMarker(seg.match(CHAPTER_MARKER)) ??
                (BARE_NUMBER_SEG.test(seg) ? seg.match(BARE_NUMBER_SEG)![1] : null) ??
                chapterFromTitledSegment(seg, titles);
            if (m) {
                chapter = m;
                break;
            }
        }
    }

    // Page number: prefer an explicit "pNNN" marker (avoids grabbing a group-tag
    // digit like the "1" in "1r0n"); else fall back to the last number in the name.
    let page = base.match(PAGE_MARKER) ? parseInt(base.match(PAGE_MARKER)![1], 10) : lastNumber(base);

    // 3) Last resort for a still-unassigned page: a `chapter-page` filename like
    //    `079-012.jpg` / `079_012`. Applied per-image (not as a global switch) so a
    //    block of bare-numbered chapters mixed into an otherwise marker-named
    //    compilation gets rescued instead of silently dropped (see §5.1).
    //    Skipped when this page carries a volume marker: there a `NNN-NNN.jpg` name is
    //    a double-page SPREAD (pages 151–152), not a chapter-page, and reading it as a
    //    chapter manufactures bogus chapters out of every spread in a volume-only pack.
    if (!chapter && volume === null) {
        const cp = base.match(CHAPTER_PAGE_NAME);
        if (cp) {
            chapter = cp[1];
            page = parseInt(cp[2], 10);
        }
    }

    return { file, chapter, page, volume, container };
}

/** Order a group's pages by page number, then natural path order as a tie-break. */
function orderPages(items: ImageAnalysis[]): string[] {
    return items
        .slice()
        .sort((x, y) => {
            if (x.page != null && y.page != null && x.page !== y.page) return x.page - y.page;
            return naturalCompare(x.file, y.file);
        })
        .map((it) => it.file);
}

/**
 * Contiguity of a detected numeric sequence: how densely the run [min..max] is filled.
 * A clean c001..c125 (or v01..v17) with few gaps scores ~1; a sparse, scattered set of
 * numbers (the symptom of false-positive matches) scores low.
 */
function sequenceContiguity(nums: number[]): number {
    const finite = nums.filter(Number.isFinite);
    if (finite.length <= 1) return 1;
    const span = Math.max(...finite) - Math.min(...finite) + 1;
    return Math.min(1, finite.length / span);
}

interface Interpretation {
    mode: ArchiveLayoutMode;
    chapters: ParsedChapterLayout[];
    confidence: number;
    assigned: number;
    reason: string;
}

export class ArchiveLayoutParser {
    /**
     * @param images absolute image paths (from `collectImages`)
     * @param titlePrior parsed torrent title (chapter range cross-check), optional
     */
    parseLayout(images: string[], titlePrior?: ParsedArchiveTitle): ArchiveLayout {
        const total = images.length;
        if (total === 0) {
            return { chapters: [], overallConfidence: 0, mode: 'none', volumeOnly: false, totalImages: 0, assignedImages: 0, reason: 'no images found in archive', samplePaths: [] };
        }

        const rootSegmentsCount = commonRootSegmentCount(images);
        // Example paths (relative to the common root) — surfaced for diagnosis and the
        // v2 needs_review dataset, sampled across the archive (not just the first folder).
        const step = Math.max(1, Math.floor(total / 12));
        const samplePaths: string[] = [];
        for (let i = 0; i < total && samplePaths.length < 12; i += step) {
            samplePaths.push(images[i].split(path.sep).slice(rootSegmentsCount).join('/'));
        }

        const titles = titlePrior?.titles ?? [];
        const analyses = images.map((f) => analyzeImage(f, rootSegmentsCount, titles));

        const chapterInterp = this.buildChapterInterpretation(analyses, total);
        const volumeInterp = this.buildVolumeInterpretation(analyses, total);

        // Pick the most confident interpretation. Chapter mode wins ties (it's the more
        // granular, more useful reading unit) so a `v01/c001` release that detects both
        // volumes and chapters ingests by chapter, not by volume.
        let chosen: Interpretation | null = null;
        for (const cand of [chapterInterp, volumeInterp]) {
            if (!cand) continue;
            if (!chosen || cand.confidence > chosen.confidence) chosen = cand;
        }
        if (chapterInterp && volumeInterp && chapterInterp.confidence >= volumeInterp.confidence) {
            chosen = chapterInterp;
        }

        // Surface dropped pages relative to the CHOSEN interpretation so a missing block
        // (a chapter range whose filenames don't match the rest of the archive's
        // convention) is diagnosable instead of silently vanishing into a "done" job.
        if (chosen && chosen.assigned < total) {
            const assignedFiles = new Set(chosen.chapters.flatMap((c) => c.pages));
            const dropped = analyses
                .filter((a) => !assignedFiles.has(a.file))
                .map((a) => a.file.split(path.sep).slice(rootSegmentsCount).join('/'));
            if (dropped.length > 0) {
                logger.warn(
                    `[LAYOUT] ${dropped.length}/${total} page(s) unassigned in ${chosen.mode} mode; sample:\n  ` +
                        dropped.slice(0, 8).join('\n  '),
                    { service: 'archiveLayoutParser' }
                );
            }
        }

        if (!chosen) {
            const anyVolume = analyses.some((a) => a.volume !== null);
            return {
                chapters: [],
                overallConfidence: 0,
                mode: 'none',
                volumeOnly: anyVolume,
                totalImages: total,
                assignedImages: 0,
                reason: anyVolume
                    ? 'volume markers present but volumes were not cleanly separable'
                    : 'could not detect chapter or volume structure',
                samplePaths,
            };
        }

        return {
            chapters: chosen.chapters,
            overallConfidence: chosen.confidence,
            mode: chosen.mode,
            volumeOnly: chosen.mode === 'volume',
            totalImages: total,
            assignedImages: chosen.assigned,
            reason: chosen.reason,
            samplePaths,
        };
    }

    /** Group chapter-assigned pages into chapters; confidence from coverage × contiguity. */
    private buildChapterInterpretation(analyses: ImageAnalysis[], total: number): Interpretation | null {
        const assigned = analyses.filter((a) => a.chapter !== null);
        if (assigned.length === 0) return null;

        const byChapter = new Map<string, ImageAnalysis[]>();
        for (const a of assigned) {
            const key = normalizeChapterNumber(a.chapter!);
            if (!byChapter.has(key)) byChapter.set(key, []);
            byChapter.get(key)!.push(a);
        }

        const chapters: ParsedChapterLayout[] = [...byChapter.entries()]
            .map(([chapterNumber, items]) => ({ chapterNumber, pages: orderPages(items), confidence: 1 }))
            .sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));

        const nums = chapters.map((c) => parseFloat(c.chapterNumber)).filter(Number.isFinite);
        const assignedFraction = assigned.length / total;
        const contiguity = sequenceContiguity(nums);
        const confidence = clamp01(assignedFraction * (0.5 + 0.5 * contiguity));
        const reason =
            `chapter mode: ${assigned.length}/${total} pages → ${chapters.length} chapter(s) ` +
            `[${normalizeChapterNumber(String(Math.min(...nums)))}–${normalizeChapterNumber(String(Math.max(...nums)))}], ` +
            `assignedFrac=${assignedFraction.toFixed(2)}, contiguity=${contiguity.toFixed(2)}`;

        return { mode: 'chapter', chapters, confidence, assigned: assigned.length, reason };
    }

    /**
     * Group pages by volume (one chapter per volume), or — when there are no volume
     * markers but the archive is a single container of sequential pages — emit it as a
     * single unit. Each volume's chapterNumber is its volume number (kept numeric so the
     * reader's integer-cast ordering still works) with `volumeNumber` + a "Volume N" title.
     */
    private buildVolumeInterpretation(analyses: ImageAnalysis[], total: number): Interpretation | null {
        const withVol = analyses.filter((a) => a.volume !== null);
        const volFraction = withVol.length / total;

        // Volume-only pack: an explicit volume marker on (nearly) every page.
        if (withVol.length > 0 && volFraction >= 0.9) {
            const byVolume = new Map<string, ImageAnalysis[]>();
            for (const a of withVol) {
                if (!byVolume.has(a.volume!)) byVolume.set(a.volume!, []);
                byVolume.get(a.volume!)!.push(a);
            }
            const chapters: ParsedChapterLayout[] = [...byVolume.entries()]
                .map(([vol, items]) => ({ chapterNumber: vol, volume: vol, title: `Volume ${vol}`, pages: orderPages(items), confidence: 1 }))
                .sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));
            const nums = chapters.map((c) => parseFloat(c.chapterNumber)).filter(Number.isFinite);
            const contiguity = sequenceContiguity(nums);
            const confidence = clamp01(volFraction * (0.5 + 0.5 * contiguity));
            const reason =
                `volume mode: ${chapters.length} volume(s) ` +
                `[${normalizeVolumeNumber(String(Math.min(...nums)))}–${normalizeVolumeNumber(String(Math.max(...nums)))}] → ` +
                `${chapters.length} chapter(s), volFrac=${volFraction.toFixed(2)}, contiguity=${contiguity.toFixed(2)}`;
            return { mode: 'volume', chapters, confidence, assigned: withVol.length, reason };
        }

        // Single-book fallback: one container, no chapter/volume markers, sequential
        // pages. Ingest as a single chapter "1" when it's plausibly one book.
        const containers = new Set(analyses.map((a) => a.container));
        if (containers.size === 1) {
            const pages = orderPages(analyses);
            const confidence = total <= SINGLE_BOOK_MAX_PAGES ? 0.9 : 0.4;
            const reason =
                `single-book mode: 1 container, ${total} page(s), no chapter/volume markers ` +
                `(confidence ${total <= SINGLE_BOOK_MAX_PAGES ? 'ok' : 'low — pile too large to assume one chapter'})`;
            return {
                mode: 'single',
                chapters: [{ chapterNumber: '1', volume: '1', title: 'Volume 1', pages, confidence }],
                confidence,
                assigned: total,
                reason,
            };
        }

        return null;
    }
}

function commonRootSegmentCount(paths: string[]): number {
    if (paths.length === 0) return 0;
    const split = paths.map((p) => path.dirname(p).split(path.sep));
    let count = 0;
    const first = split[0];
    for (let i = 0; i < first.length; i++) {
        if (split.every((s) => s[i] === first[i])) count++;
        else break;
    }
    return count;
}

function clamp01(n: number): number {
    return Math.max(0, Math.min(1, n));
}

export const archiveLayoutParser = new ArchiveLayoutParser();
