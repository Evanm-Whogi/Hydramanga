/**
 * Archive Candidate Scorer
 *
 * Gates + ranks indexer hits for a series. Disambiguation is the #1 matching risk
 * (risks §0c): bare-keyword search floods with shared-prefix sequels
 * ("…Mars Chronicle") and shared-word franchises ("Berserk of Gluttony") that can
 * outrank the target by seeders. So we never do "title contains query": we require
 * tight boundary token matching with a heavy penalty for extra/subtitle tokens,
 * matched against the series' native + secondary titles too.
 *
 * Ranking (after gates) follows risks §0a/§0b: parsed chapter-range width × scope
 * weight × size sanity × seeders — NOT raw seeders (floods with weekly single
 * chapters) and NOT download count (favors stale old batches). B&W canonical
 * (colored deprioritized); JXL deprioritized so a non-JXL twin wins naturally.
 */
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { parseArchiveTitle, normalizeForMatch } from './lib/archiveTitleParser';
import type { ArchiveCandidate, ScoredArchiveCandidate } from './interfaces/types';

export interface SeriesMatchInput {
    /** Primary + native + secondary titles to match against. */
    titles: string[];
    /** Expected chapter count, when known (drives the size-sanity lower bound). */
    expectedChapters?: number;
}

const SCOPE_WEIGHT: Record<string, number> = {
    series: 1.0,
    volume: 0.7,
    unknown: 0.3,
    chapter: 0.1,
};

function uniqTokens(s: string): string[] {
    return normalizeForMatch(s).split(' ').filter(Boolean);
}

/**
 * Boundary-aware title match score (0–100) for one query/candidate pair.
 * - exact normalized equality → 100
 * - all query tokens present → 100 minus a heavy per-extra-token (subtitle) penalty
 * - any query token missing → capped partial score (likely wrong/partial series)
 */
function scoreTitlePair(query: string, candidate: string): number {
    const qt = uniqTokens(query);
    const ct = uniqTokens(candidate);
    if (qt.length === 0 || ct.length === 0) return 0;

    const qn = qt.join(' ');
    const cn = ct.join(' ');
    if (qn === cn) return 100;

    const cset = new Set(ct);
    const missing = qt.filter((t) => !cset.has(t)).length;
    const qset = new Set(qt);
    const extra = ct.filter((t) => !qset.has(t)).length;

    if (missing > 0) {
        // Query tokens absent from the candidate → partial/wrong series. Cap low.
        const covered = qt.length - missing;
        const base = (covered / qt.length) * 55;
        return Math.max(0, base - extra * 5);
    }

    // All query tokens present. Penalize extra subtitle tokens heavily (sequels add
    // a couple: "Mars Chronicle", "of Gluttony"). Lighter penalty when the candidate
    // is a clean prefix of (i.e. starts with) the query — same-series, extra tags.
    const isPrefix = cn.startsWith(qn + ' ');
    const score = 100 - extra * (isPrefix ? 12 : 18);
    return Math.max(0, score);
}

/** Best title-match score across all series titles × all candidate (dual) titles. */
function bestTitleScore(seriesTitles: string[], candidate: ArchiveCandidate): number {
    const parsed = candidate.parsed ?? parseArchiveTitle(candidate.title);
    const candidateTitles = parsed.titles.length ? parsed.titles : [parsed.cleanTitle];
    let best = 0;
    for (const q of seriesTitles) {
        if (!q?.trim()) continue;
        for (const c of candidateTitles) {
            best = Math.max(best, scoreTitlePair(q, c));
            if (best === 100) return 100;
        }
    }
    return best;
}

/** Explicit non-English markers that disqualify a candidate (English-only, Q3). */
function looksNonEnglish(candidate: ArchiveCandidate): boolean {
    if (candidate.languageGuess && candidate.languageGuess.toLowerCase().startsWith('en')) return false;
    if (candidate.languageGuess && !candidate.languageGuess.toLowerCase().startsWith('en')) return true;
    return /\b(\[jp\]|\(japanese\)|japanese raws?|\braw\b|\[kr\]|\(korean\)|\[cn\]|\(chinese\))\b/i.test(
        candidate.title
    );
}

export class ArchiveCandidateScorer {
    private get cfg() {
        return appConfig.archive.candidate;
    }

    /** Gate + score every candidate; returns all (passing first, by score desc). */
    scoreAll(candidates: ArchiveCandidate[], series: SeriesMatchInput): ScoredArchiveCandidate[] {
        const scored = candidates.map((c) => this.scoreOne(c, series));
        return scored.sort((a, b) => {
            // Passing candidates first, then by composite score.
            const aPass = a.rejectedReason === null ? 1 : 0;
            const bPass = b.rejectedReason === null ? 1 : 0;
            if (aPass !== bPass) return bPass - aPass;
            return b.score - a.score;
        });
    }

    /** The single best candidate that passes all gates, or null if none qualify. */
    bestArchive(candidates: ArchiveCandidate[], series: SeriesMatchInput): ScoredArchiveCandidate | null {
        const ranked = this.scoreAll(candidates, series);
        const best = ranked[0];
        return best && best.rejectedReason === null ? best : null;
    }

    private scoreOne(candidate: ArchiveCandidate, series: SeriesMatchInput): ScoredArchiveCandidate {
        const parsed = candidate.parsed ?? parseArchiveTitle(candidate.title);
        candidate.parsed = parsed;
        candidate.scope = parsed.scope;

        const titleScore = bestTitleScore(series.titles, candidate);
        const reject = (reason: string): ScoredArchiveCandidate => ({
            candidate,
            score: 0,
            titleScore,
            rejectedReason: reason,
        });

        // --- Hard gates ---
        if (parsed.isVideo) return reject('video/anime content (non-manga)');
        if (parsed.isAudiobook) return reject('audiobook (non-manga)');
        if (parsed.isNovel) return reject('prose/light-novel (non-manga)');
        if (looksNonEnglish(candidate)) return reject('non-English language');
        if (candidate.seeders < this.cfg.minSeeders) {
            return reject(`too few seeders (${candidate.seeders} < ${this.cfg.minSeeders})`);
        }
        if (candidate.sizeBytes > this.cfg.maxArchiveBytes) {
            return reject(`oversized (${candidate.sizeBytes} > ${this.cfg.maxArchiveBytes})`);
        }
        if (series.expectedChapters && series.expectedChapters > 0) {
            const minBytes = this.cfg.minBytesPerChapter * series.expectedChapters;
            if (candidate.sizeBytes < minBytes) {
                return reject(`undersized for ${series.expectedChapters} ch (${candidate.sizeBytes} < ${minBytes})`);
            }
        }
        if (titleScore < this.cfg.minTitleScore) {
            return reject(`title score ${titleScore} < ${this.cfg.minTitleScore} (likely wrong series)`);
        }

        // --- Composite rank (higher = better) ---
        // Coverage = chapter span + volume span (≈8 ch/volume). Summed so a compound
        // "v001-111 + 1134-1176" (volumes + recent loose chapters) outranks a smaller
        // volume-only batch, instead of counting only the loose-chapter portion.
        const chWidth = parsed.chapterRange ? parsed.chapterRange.end - parsed.chapterRange.start + 1 : 0;
        const volWidth = parsed.volumeRange ? (parsed.volumeRange.end - parsed.volumeRange.start + 1) * 8 : 0;
        const rangeWidth = Math.max(1, chWidth + volWidth);
        const scopeWeight = SCOPE_WEIGHT[parsed.scope] ?? 0.3;
        // Diminishing returns on seeders (a healthy swarm matters; a huge one doesn't 10×).
        const seedersFactor = 1 + Math.log10(1 + Math.max(0, candidate.seeders));
        const completeBonus = parsed.isComplete ? 1.25 : 1;
        const coloredPenalty = parsed.isColored ? 0.25 : 1; // B&W canonical (Q10)
        const jxlPenalty = parsed.isJxl ? 0.5 : 1; // prefer the non-JXL twin
        // Recency tiebreak: small boost for newer torrents (favor the 2026 batch).
        const recencyFactor = candidate.ageDays != null ? 1 + Math.max(0, 365 - candidate.ageDays) / 3650 : 1;

        const titleFactor = titleScore / 100;
        const score =
            rangeWidth *
            scopeWeight *
            seedersFactor *
            completeBonus *
            coloredPenalty *
            jxlPenalty *
            recencyFactor *
            titleFactor;

        return { candidate, score, titleScore, rejectedReason: null };
    }

    /** Log a concise ranking summary for an acquisition decision. */
    logRanking(seriesId: number, ranked: ScoredArchiveCandidate[], take = 5): void {
        const lines = ranked.slice(0, take).map((r, i) => {
            const c = r.candidate;
            const status = r.rejectedReason ? `REJECT(${r.rejectedReason})` : `score=${r.score.toFixed(1)}`;
            return `  #${i + 1} ts=${r.titleScore} ${status} seed=${c.seeders} scope=${c.scope} «${c.title.slice(0, 70)}»`;
        });
        logger.info(`[ARCHIVE] Candidate ranking for series ${seriesId}:\n${lines.join('\n')}`, {
            service: 'archiveCandidateScorer',
        });
    }
}

export const archiveCandidateScorer = new ArchiveCandidateScorer();
