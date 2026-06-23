/**
 * Archive Layout Parser — the #1 technical risk (plan §5.1).
 *
 * Given the image files unpacked from an archive (plus the torrent-title parse as a
 * prior), segment them into chapters: `{ chapterNumber, volume?, pages[], confidence }`.
 * Release layouts vary wildly (`Ch.001/`, `c001/`, `Chapter 1/`, `0001-012.jpg`,
 * `v01/` volume-only packs, nested group folders), so this emits a CONFIDENCE score
 * and the caller auto-ingests only high-confidence chapter-structured archives —
 * everything else routes to `needs_review` (skip-and-log), never auto-guessed.
 *
 * Chapter numbers are normalized the same way the scrape path stores them (bare
 * numeric string, decimals preserved) so the `(seriesId, chapterNumber)` unique key
 * lines up and skip-if-present works (plan §11.4).
 */
import path from 'path';
import { naturalCompare } from './lib/archiveUnpack';
import type { ParsedArchiveTitle } from './interfaces/types';
import logger from '@/services/loggerService';

export interface ParsedChapterLayout {
    chapterNumber: string;
    volume?: string;
    pages: string[];
    confidence: number;
}

export interface ArchiveLayout {
    chapters: ParsedChapterLayout[];
    overallConfidence: number;
    /** True when only volumes (no chapter boundaries) could be identified. */
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

function normalizeChapterNumber(raw: string): string {
    const n = parseFloat(raw);
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
    sawVolume: boolean;
}

/** Inspect one image's path segments + filename for a chapter key + page number. */
function analyzeImage(file: string, rootSegmentsCount: number, titles: string[]): ImageAnalysis {
    const segments = file.split(path.sep);
    // Only consider segments below the common root (the archive's own structure).
    const relSegments = segments.slice(rootSegmentsCount);
    const dirSegments = relSegments.slice(0, -1);
    const base = path.basename(file, path.extname(file));

    const sawVolume =
        VOLUME_MARKER.test(base) || dirSegments.some((seg) => VOLUME_MARKER.test(seg));

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
    if (!chapter) {
        const cp = base.match(CHAPTER_PAGE_NAME);
        if (cp) {
            chapter = cp[1];
            page = parseInt(cp[2], 10);
        }
    }

    return { file, chapter, page, sawVolume };
}

export class ArchiveLayoutParser {
    /**
     * @param images absolute image paths (from `collectImages`)
     * @param titlePrior parsed torrent title (chapter range cross-check), optional
     */
    parseLayout(images: string[], titlePrior?: ParsedArchiveTitle): ArchiveLayout {
        const total = images.length;
        if (total === 0) {
            return { chapters: [], overallConfidence: 0, volumeOnly: false, totalImages: 0, assignedImages: 0, reason: 'no images found in archive', samplePaths: [] };
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
        const assigned = analyses.filter((a) => a.chapter !== null);
        const anyVolume = analyses.some((a) => a.sawVolume);

        const assignedFraction = assigned.length / total;

        // Surface dropped pages: an unassigned block (e.g. a chapter range whose
        // filenames don't match the rest of the archive's convention) would otherwise
        // vanish into a "done" job. Log a sample so it's diagnosable, not silent.
        if (assigned.length < total) {
            const dropped = analyses
                .filter((a) => a.chapter === null)
                .map((a) => a.file.split(path.sep).slice(rootSegmentsCount).join('/'));
            logger.warn(
                `[LAYOUT] ${total - assigned.length}/${total} page(s) unassigned (no chapter detected); sample:\n  ` +
                    dropped.slice(0, 8).join('\n  '),
                { service: 'archiveLayoutParser' }
            );
        }

        // Volume-only / unsegmentable → low confidence, route to needs_review.
        if (assigned.length === 0) {
            return {
                chapters: [],
                overallConfidence: 0,
                volumeOnly: anyVolume,
                totalImages: total,
                assignedImages: 0,
                reason: anyVolume
                    ? 'volume-only pack: no chapter boundaries detected'
                    : 'could not detect chapter structure',
                samplePaths,
            };
        }

        // Group pages by chapter, natural-sorted within each chapter.
        const byChapter = new Map<string, ImageAnalysis[]>();
        for (const a of assigned) {
            const key = normalizeChapterNumber(a.chapter!);
            if (!byChapter.has(key)) byChapter.set(key, []);
            byChapter.get(key)!.push(a);
        }

        const chapters: ParsedChapterLayout[] = [...byChapter.entries()]
            .map(([chapterNumber, items]) => {
                const pages = items
                    .slice()
                    .sort((x, y) => {
                        if (x.page != null && y.page != null && x.page !== y.page) return x.page - y.page;
                        return naturalCompare(x.file, y.file);
                    })
                    .map((it) => it.file);
                return { chapterNumber, pages, confidence: 1 };
            })
            .sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));

        // Confidence = how many pages got a chapter × how contiguous the detected
        // chapter sequence is. A clean run (e.g. c001..c125 with few gaps) scores high
        // regardless of the torrent title's range (which, for compound titles like
        // "v01-13 + 117-125.1", only describes part of the catalog).
        const nums = chapters.map((c) => parseFloat(c.chapterNumber)).filter(Number.isFinite);
        const minc = Math.min(...nums);
        const maxc = Math.max(...nums);
        const span = maxc - minc + 1;
        const contiguity = nums.length <= 1 ? 1 : Math.min(1, nums.length / span);
        const overallConfidence = clamp01(assignedFraction * (0.5 + 0.5 * contiguity));

        const reason =
            `${assigned.length}/${total} pages → ${chapters.length} chapter(s) ` +
            `[${normalizeChapterNumber(String(minc))}–${normalizeChapterNumber(String(maxc))}], ` +
            `assignedFrac=${assignedFraction.toFixed(2)}, contiguity=${contiguity.toFixed(2)}`;

        return {
            chapters,
            overallConfidence,
            volumeOnly: false,
            totalImages: total,
            assignedImages: assigned.length,
            reason,
            samplePaths,
        };
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
