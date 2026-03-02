/**
 * WeebCentral Search Service
 * Handles all search-related functionality for weebcentral.com
 * 
 * Responsibilities:
 * - Query the weebcentral search API
 * - Parse search results from HTML
 * - Score and rank results by relevance
 * - Generate search variants (name, romanized, normalized)
 * - Find the best match using sophisticated scoring
 */

import axios from 'axios';
import { JSDOM } from 'jsdom';
import logger from '@/services/loggerService';
import { discordService } from '@/services/discordService';

export interface SearchResult {
    href: string;
    title?: string;
    score: number;
}

export interface SearchOptions {
    seriesId?: number;
    coverUrl?: string;
    maxVariants?: number;
    /** Native title in original language (alternative search term) */
    nativeTitle?: string;
    /** Secondary/alternative titles from database (additional search terms) */
    secondaryTitles?: string[];
}

/**
 * Scoring tiers for result matching
 * Higher scores = better matches
 */
const SCORE_TIERS = {
    EXACT_MATCH: 100,
    WORD_BOUNDARY: 90,
    URL_SLUG_MATCH: 80,
    STARTS_WITH: 70,
    CONTAINS: 50,
    NO_MATCH: 0,
} as const;

/**
 * User agent for API requests
 */
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * WeebCentral API endpoints
 */
const API_ENDPOINTS = {
    SEARCH: 'https://weebcentral.com/search/simple?location=main',
} as const;

/**
 * Normalize search query strings to improve match rates on finicky search bars
 * Converts: "Jujutsu-Kaisen_2" → "jujutsu kaisen 2"
 * 
 * @param query - Query to normalize
 * @returns Normalized query string
 */
export function normalizeQuery(query?: string): string {
    if (!query) return '';
    return query
        .replace(/[-_.]+/g, ' ')   // turn dashes/underscores/dots into spaces
        .replace(/[^\p{L}\p{N}\s]/gu, '') // drop other punctuation (unicode aware)
        .replace(/\s+/g, ' ')      // collapse multiple spaces
        .trim();
}

export class WeebCentralSearcher {
    /**
     * Query the weebcentral API for a search term
     * 
     * @param searchTerm - Term to search for
     * @returns Array of search results sorted by score (highest first)
     */
    static async queryAPI(searchTerm: string): Promise<SearchResult[]> {
        try {
            console.log(`[WEEB_SEARCH] Querying API for "${searchTerm}"`);

            const params = new URLSearchParams({ text: searchTerm });

            const response = await axios.post(
                API_ENDPOINTS.SEARCH,
                params,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': USER_AGENT,
                    },
                }
            );

            // Parse HTML response
            const results = this.parseSearchResults(response.data, searchTerm);

            console.log(`[WEEB_SEARCH] Found ${results.length} results for "${searchTerm}"`);

            if (results.length > 0) {
                console.log(
                    `[WEEB_SEARCH] Top result: "${results[0].title}" (score: ${results[0].score})`
                );
                logger.info(
                    `[WEEB_SEARCH] Top result for "${searchTerm}": "${results[0].title}" (score: ${results[0].score})`,
                    { service: 'weebCentralSearcher' }
                );
            }

            return results;
        } catch (error) {
            console.error(`[WEEB_SEARCH] API error for "${searchTerm}":`, error);
            logger.error(
                `[WEEB_SEARCH] API error for "${searchTerm}": ${error}`,
                { service: 'weebCentralSearcher' }
            );
            return [];
        }
    }

    /**
     * Parse search results from HTML response
     * 
     * @param html - HTML response from API
     * @param searchTerm - Original search term (for scoring)
     * @returns Parsed and scored results
     */
    private static parseSearchResults(html: string, searchTerm: string): SearchResult[] {
        try {
            const dom = new JSDOM(html);
            const anchors = Array.from(
                dom.window.document.querySelectorAll('a[href*="/series/"]')
            );

            const results = anchors
                .map((anchor) => {
                    const href = (anchor as any).href;
                    const title = anchor.querySelector('div.line-clamp-2')?.textContent?.trim();
                    const score = this.scoreMatch(anchor, searchTerm);

                    return { href, title, score };
                })
                .sort((a, b) => b.score - a.score); // Sort by score descending

            return results;
        } catch (error) {
            console.error(`[WEEB_SEARCH] Failed to parse results:`, error);
            return [];
        }
    }

    /**
     * Score a search result based on match quality
     * Uses multiple heuristics to determine relevance
     * 
     * Scoring factors (in order of specificity):
     * 1. Exact match (100)
     * 2. Word boundary match (90)
     * 3. URL slug match (80)
     * 4. Starts with search term (70)
     * 5. Contains search term (50)
     * 6. No match (0)
     * 
     * @param element - DOM element to score
     * @param searchTerm - Search term to match against
     * @returns Score from 0-100
     */
    private static scoreMatch(element: Element, searchTerm: string): number {
        const rawTitle = element.querySelector('div.line-clamp-2')?.textContent ?? '';
        const titleText = rawTitle.trim().toLowerCase();
        const urlHref = element.getAttribute('href')?.toLowerCase() || '';
        const searchLower = searchTerm.toLowerCase().trim();

        // Normalized forms – strip punctuation / connectors so
        // "Boruto: Naruto Next Generations" and
        // "Boruto - Naruto Next Generations" compare as equal.
        const normalizedTitle = normalizeQuery(rawTitle).toLowerCase();
        const normalizedSearch = normalizeQuery(searchTerm).toLowerCase();

        const escapeRegex = (value: string) =>
            value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 0. Exact match on normalized forms (punctuation-insensitive)
        if (normalizedTitle && normalizedSearch && normalizedTitle === normalizedSearch) {
            return SCORE_TIERS.EXACT_MATCH;
        }

        // 1. Exact match - title exactly matches search
        if (titleText === searchLower) {
            return SCORE_TIERS.EXACT_MATCH;
        }

        // 2. Word boundary match - search term matches as complete word(s)
        // Check both raw and normalized text so small punctuation differences
        // like ":" vs "-" still count as strong matches.
        const wordBoundaryPattern = new RegExp(
            `\\b${escapeRegex(searchLower)}\\b`
        );
        const normalizedBoundaryPattern = normalizedSearch
            ? new RegExp(`\\b${escapeRegex(normalizedSearch)}\\b`)
            : null;
        if (wordBoundaryPattern.test(titleText) || (normalizedBoundaryPattern && normalizedBoundaryPattern.test(normalizedTitle))) {
            return SCORE_TIERS.WORD_BOUNDARY;
        }

        // 3. URL slug match - URL contains search term as slug
        // Use normalized search so "Boruto: Naruto…" slug-matches
        // "boruto-naruto-next-generations".
        const slugSource = normalizedSearch || searchLower;
        const searchSlug = slugSource.replace(/\s+/g, '-');
        if (urlHref.includes(`/${searchSlug}`) || urlHref.endsWith(searchSlug)) {
            return SCORE_TIERS.URL_SLUG_MATCH;
        }

        // 4. Starts with - title begins with search term
        // e.g., "Demon Slayer: Kimetsu no Yaiba" starts with "demon"
        if (titleText.startsWith(searchLower)) {
            return SCORE_TIERS.STARTS_WITH;
        }

        // 5. Contains - title contains search term anywhere
        // e.g., "My Demon Slayer Collection" contains "demon"
        if (titleText.includes(searchLower)) {
            return SCORE_TIERS.CONTAINS;
        }

        // No match
        return SCORE_TIERS.NO_MATCH;
    }

    /**
     * Generate search variants to improve search hit rate
     * Tries multiple formats of the same manga name
     * 
     * @param mangaName - Primary manga name
     * @param romanizedTitle - Romanized alternative name
     * @param nativeTitle - Native title in original language
     * @returns Array of unique search variants
     * 
     * Examples:
     * - Input: "Jujutsu-Kaisen", "Jujutsu Kaisen", "呪術廻戦"
     * - Output: ["Jujutsu-Kaisen", "jujutsu kaisen", "Jujutsu Kaisen", "呪術廻戦"]
     * - Input: "Top Tier Providence, Secretly Cultivate" 
     * - Output: ["Top Tier Providence, Secretly...", "Top Tier Providence", ...]
     */
    static generateSearchVariants(
        mangaName: string,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[]
    ): string[] {
        const secondaryVariants = (secondaryTitles || []).flatMap((title) => [
            title,
            normalizeQuery(title),
        ]);

        const baseVariants = [
            mangaName,
            normalizeQuery(mangaName),
            romanizedTitle,
            normalizeQuery(romanizedTitle),
            nativeTitle,
            normalizeQuery(nativeTitle),
            ...secondaryVariants,
        ]
            .filter((v): v is string => !!v) // Remove undefined/null/empty
            .filter((v, idx, arr) => arr.indexOf(v) === idx); // Remove duplicates

        // Add shortened variants (before comma, colon, or pipe)
        // e.g., "Top Tier Providence, Secretly Cultivate for a Thousand Years" -> "Top Tier Providence"
        const shortenedVariants: string[] = [];
        for (const variant of baseVariants) {
            const shortened = variant
                .split(/[,:|]/)[0] // Split by comma, colon, or pipe and take first part
                .trim();
            if (shortened && shortened !== variant && !baseVariants.includes(shortened)) {
                shortenedVariants.push(shortened);
            }
        }

        return [...baseVariants, ...shortenedVariants];
    }

    /**
     * Find the best manga series match from multiple search variants
     * Tries full title variants first, then falls back to shortened variants
     * 
     * @param mangaName - Primary manga name to search for
     * @param romanizedTitle - Romanized alternative name
     * @param nativeTitle - Native title in original language
     * @param options - Search options (seriesId, coverUrl, includeGenres)
     * @returns Best matching result or undefined if no match found
     * 
     * Algorithm:
     * 1. Generate base variants (full titles only)
     * 2. Try all base variants first
     * 3. If no match found, generate and try shortened variants (before comma/colon)
     * 4. This prevents false positives from shortened versions matching wrong manga
     */
    static async findBestMatch(
        mangaName: string,
        romanizedTitle?: string,
        nativeTitle?: string,
        secondaryTitles?: string[],
        options?: SearchOptions
    ): Promise<SearchResult | undefined> {
        // Generate base variants (full titles only)
        const secondaryVariants = (secondaryTitles || []).flatMap((title) => [
            title,
            normalizeQuery(title),
        ]);

        const baseVariants = [
            mangaName,
            normalizeQuery(mangaName),
            romanizedTitle,
            normalizeQuery(romanizedTitle),
            nativeTitle,
            normalizeQuery(nativeTitle),
            ...secondaryVariants,
        ]
            .filter((v): v is string => !!v)
            .filter((v, idx, arr) => arr.indexOf(v) === idx);

        let bestMatch: SearchResult | undefined;
        let lastResults: SearchResult[] = [];
        const triedVariants: string[] = [];

        // Phase 1: Try full title variants first
        console.log(`[WEEB_SEARCH] Phase 1: Trying ${baseVariants.length} full title variants`);
        for (const variant of baseVariants) {
            triedVariants.push(variant);
            lastResults = await this.queryAPI(variant);
            bestMatch = lastResults.find((r) => r.score > SCORE_TIERS.NO_MATCH);

            if (bestMatch) {
                console.log(
                    `[WEEB_SEARCH] Found match with full title variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`
                );
                return bestMatch; // Found good match with full title
            }
        }

        // Phase 2: Only if no full title match, try shortened variants
        const shortenedVariants: string[] = [];
        for (const variant of baseVariants) {
            const shortened = variant
                .split(/[,:|]/)[0]
                .trim();
            if (shortened && shortened !== variant && !baseVariants.includes(shortened) && !shortenedVariants.includes(shortened)) {
                shortenedVariants.push(shortened);
            }
        }

        if (shortenedVariants.length > 0) {
            console.log(`[WEEB_SEARCH] Phase 2: No full title match found, trying ${shortenedVariants.length} shortened variants as fallback`);
            for (const variant of shortenedVariants) {
                triedVariants.push(variant);
                lastResults = await this.queryAPI(variant);
                bestMatch = lastResults.find((r) => r.score > SCORE_TIERS.NO_MATCH);

                if (bestMatch) {
                    console.log(
                        `[WEEB_SEARCH] Found match with shortened variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`
                    );
                    return bestMatch;
                }
            }
        }

        // Don't use zero-score results - let ScraperManager try other scrapers
        if (!bestMatch && lastResults.length > 0) {
            const firstResult = lastResults[0];
            if (firstResult.score > SCORE_TIERS.NO_MATCH && firstResult.title?.toLowerCase() !== 'random') {
                console.log(
                    `[WEEB_SEARCH] Using lowest-score match: "${firstResult.title}" (score: ${firstResult.score})`
                );
                bestMatch = firstResult;
            } else if (firstResult.score === SCORE_TIERS.NO_MATCH) {
                console.log(
                    `[WEEB_SEARCH] All results scored 0 (no match), deferring to next scraper`
                );
            }
        }

        // No match found
        if (!bestMatch) {
            console.log(
                `[WEEB_SEARCH] Could not find manga link for "${mangaName}". Tried variants: ${triedVariants.join(', ')}`
            );
            logger.warn(
                `[WEEB_SEARCH] Could not find manga link for "${mangaName}". Variants: ${triedVariants.join(', ')}`,
                { service: 'weebCentralSearcher' }
            );
        }

        return bestMatch;
    }

    /**
     * Get top N results for a search term
     * Useful for debugging or showing multiple options
     * 
     * @param searchTerm - Term to search for
     * @param limit - Maximum results to return (default: 5)
     * @returns Top N results sorted by score
     */
    static async getTopResults(searchTerm: string, limit: number = 5): Promise<SearchResult[]> {
        const results = await this.queryAPI(searchTerm);
        return results.slice(0, limit);
    }

    /**
     * Check if a result is likely valid
     * Filters out placeholder or error results
     * 
     * @param result - Result to check
     * @returns true if result appears valid
     */
    static isValidResult(result: SearchResult): boolean {
        if (!result.title) return false;
        const titleLower = result.title.toLowerCase();
        // Filter out known invalid results
        return titleLower !== 'random' && titleLower !== 'error';
    }
}
