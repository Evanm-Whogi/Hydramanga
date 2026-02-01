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

            const response = await axios.post(
                API_ENDPOINTS.SEARCH,
                new URLSearchParams({ text: searchTerm }),
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
        const titleText = element.querySelector('div.line-clamp-2')?.textContent?.trim().toLowerCase() || '';
        const urlHref = element.getAttribute('href')?.toLowerCase() || '';
        const searchLower = searchTerm.toLowerCase().trim();

        // 1. Exact match - title exactly matches search
        if (titleText === searchLower) {
            return SCORE_TIERS.EXACT_MATCH;
        }

        // 2. Word boundary match - search term matches as complete word(s)
        // e.g., search "demon slayer" matches "Demon Slayer" but not "My Demon Slaying"
        const wordBoundaryPattern = new RegExp(
            `\\b${searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
        );
        if (wordBoundaryPattern.test(titleText)) {
            return SCORE_TIERS.WORD_BOUNDARY;
        }

        // 3. URL slug match - URL contains search term as slug
        // e.g., "/series/demon-slayer" matches "demon slayer"
        const searchSlug = searchLower.replace(/\s+/g, '-');
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
     * @returns Array of unique search variants
     * 
     * Examples:
     * - Input: "Jujutsu-Kaisen", "Jujutsu Kaisen"
     * - Output: ["Jujutsu-Kaisen", "jujutsu kaisen", "Jujutsu Kaisen"]
     */
    static generateSearchVariants(mangaName: string, romanizedTitle?: string): string[] {
        const variants = [
            mangaName,
            normalizeQuery(mangaName),
            romanizedTitle,
            normalizeQuery(romanizedTitle),
        ]
            .filter((v): v is string => !!v) // Remove undefined/null/empty
            .filter((v, idx, arr) => arr.indexOf(v) === idx); // Remove duplicates

        return variants;
    }

    /**
     * Find the best manga series match from multiple search variants
     * Tries each variant in order until finding a good match
     * 
     * @param mangaName - Primary manga name to search for
     * @param romanizedTitle - Romanized alternative name
     * @param options - Search options (seriesId, coverUrl)
     * @returns Best matching result or undefined if no match found
     * 
     * Algorithm:
     * 1. Generate search variants (name + normalized versions)
     * 2. Query API for each variant in order
     * 3. Return first variant that scores > 0
     * 4. If nothing scores, fall back to first result (if not "random")
     * 5. If still no match, notify Discord of failure
     */
    static async findBestMatch(
        mangaName: string,
        romanizedTitle?: string,
        options?: SearchOptions
    ): Promise<SearchResult | undefined> {
        const searchVariants = this.generateSearchVariants(mangaName, romanizedTitle);
        let bestMatch: SearchResult | undefined;
        let lastResults: SearchResult[] = [];

        // Try each search variant
        for (const variant of searchVariants) {
            lastResults = await this.queryAPI(variant);
            bestMatch = lastResults.find((r) => r.score > SCORE_TIERS.NO_MATCH);

            if (bestMatch) {
                console.log(
                    `[WEEB_SEARCH] Found viable match on variant "${variant}": "${bestMatch.title}" (score: ${bestMatch.score})`
                );
                break; // Found a good match, stop searching
            }
        }

        // Don't use zero-score results - let ScraperManager try other scrapers
        if (!bestMatch && lastResults.length > 0) {
            const firstResult = lastResults[0];
            // Only use first result if it has ANY score (even if low)
            // Score 0 means no match at all - fall back to next scraper
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

        // No match found - log only (Discord notification handled by ScraperManager)
        if (!bestMatch) {
            console.error(
                `[WEEB_SEARCH] Could not find manga link for "${mangaName}". Tried variants:`,
                searchVariants
            );
            logger.error(
                `[WEEB_SEARCH] Could not find manga link for "${mangaName}". Variants: ${searchVariants.join(', ')}`,
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
