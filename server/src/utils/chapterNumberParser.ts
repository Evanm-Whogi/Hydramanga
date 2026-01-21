/**
 * Chapter Number Parser
 * Handles extraction and normalization of chapter numbers from chapter titles
 * Supports:
 * - Regular chapters (Chapter 1, Chapter 2.5)
 * - Prologues (converted to 0.X)
 * - Epilogues (converted to 999.X)
 * - Special chapters (Omake, Extra, Side Story)
 * - Decimal chapter numbers (for volumes)
 * - Various naming conventions and locales
 */

export interface ParsedChapter {
    number: string;
    title: string;
    isSpecial: boolean;
    specialType?: 'prologue' | 'epilogue' | 'omake' | 'extra' | 'side-story';
}

export interface ChapterParserOptions {
    locale?: 'en' | 'ja' | 'auto';
    treatPrologueAsZero?: boolean;
    treatEpilogueAs999?: boolean;
}

const DEFAULT_OPTIONS: ChapterParserOptions = {
    locale: 'auto',
    treatPrologueAsZero: true,
    treatEpilogueAs999: true,
};

/**
 * Special chapter patterns - order matters (most specific first)
 */
const SPECIAL_CHAPTER_PATTERNS = [
    {
        pattern: /prologue/i,
        type: 'prologue' as const,
        numberOffset: (num: string) => `0.${num}`,
    },
    {
        pattern: /epilogue/i,
        type: 'epilogue' as const,
        numberOffset: (num: string) => `999.${num}`,
    },
    {
        pattern: /(omake|extra|bonus|side\s*story|side\s*chapter|special)/i,
        type: 'omake' as const,
        numberOffset: (num: string) => `${num}`,
    },
];

/**
 * Extract numeric patterns that could be chapter numbers
 * Matches: "1", "1.5", "2.0", etc.
 */
const CHAPTER_NUMBER_PATTERN = /(\d+(?:\.\d+)?)/;

export class ChapterNumberParser {
    /**
     * Parse a chapter title and extract the chapter number
     * @param fullTitle - Complete chapter title (e.g., "Chapter 1", "Prologue 2", "Extra 3.5")
     * @param options - Parser options
     * @returns Parsed chapter information
     *
     * Examples:
     * - "Chapter 1" → { number: "1", title: "Chapter 1", isSpecial: false }
     * - "Prologue 1" → { number: "0.1", title: "Prologue 1", isSpecial: true, specialType: "prologue" }
     * - "Epilogue 2" → { number: "999.2", title: "Epilogue 2", isSpecial: true, specialType: "epilogue" }
     * - "Omake 3" → { number: "3", title: "Omake 3", isSpecial: true, specialType: "omake" }
     * - "Volume 5 Chapter 3.2" → { number: "5.3.2", title: "Volume 5 Chapter 3.2", isSpecial: false }
     */
    static parse(fullTitle: string, options?: Partial<ChapterParserOptions>): ParsedChapter {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const title = fullTitle.trim();

        // Check for special chapter types
        for (const { pattern, type, numberOffset } of SPECIAL_CHAPTER_PATTERNS) {
            if (pattern.test(title)) {
                const numberMatch = title.match(CHAPTER_NUMBER_PATTERN);
                let chapterNumber = numberMatch ? numberMatch[0] : '0';

                // Apply special chapter offsets if enabled
                if (type === 'prologue' && opts.treatPrologueAsZero) {
                    chapterNumber = numberOffset(chapterNumber);
                } else if (type === 'epilogue' && opts.treatEpilogueAs999) {
                    chapterNumber = numberOffset(chapterNumber);
                } else if (type === 'omake') {
                    // Omake chapters keep their numbers but are marked as special
                    chapterNumber = numberOffset(chapterNumber);
                }

                return {
                    number: chapterNumber,
                    title: this.normalizeTitle(title),
                    isSpecial: true,
                    specialType: type,
                };
            }
        }

        // Regular chapter parsing
        const numberMatch = title.match(CHAPTER_NUMBER_PATTERN);
        let chapterNumber = numberMatch ? numberMatch[0] : '0';

        // If title is purely numeric, prefix with "Chapter"
        const normalizedTitle = !isNaN(Number(title))
            ? `Chapter ${title}`
            : this.normalizeTitle(title);

        return {
            number: chapterNumber,
            title: normalizedTitle,
            isSpecial: false,
        };
    }

    /**
     * Extract chapter number from title without normalization
     * @param fullTitle - Complete chapter title
     * @returns Chapter number string (e.g., "1", "1.5", "0.1")
     */
    static extractNumber(fullTitle: string): string {
        const parsed = this.parse(fullTitle);
        return parsed.number;
    }

    /**
     * Extract chapter title and normalize it
     * @param fullTitle - Complete chapter title
     * @returns Normalized chapter title
     */
    static extractTitle(fullTitle: string): string {
        const parsed = this.parse(fullTitle);
        return parsed.title;
    }

    /**
     * Check if a chapter is a special type
     * @param fullTitle - Complete chapter title
     * @returns true if chapter is special (prologue, epilogue, omake, etc.)
     */
    static isSpecial(fullTitle: string): boolean {
        const parsed = this.parse(fullTitle);
        return parsed.isSpecial;
    }

    /**
     * Get the special type of a chapter
     * @param fullTitle - Complete chapter title
     * @returns Special type or undefined if not special
     */
    static getSpecialType(fullTitle: string): string | undefined {
        const parsed = this.parse(fullTitle);
        return parsed.specialType;
    }

    /**
     * Compare two chapter numbers
     * Useful for sorting chapters in correct order
     * @param chapterA - First chapter number
     * @param chapterB - Second chapter number
     * @returns -1 if A < B, 0 if A === B, 1 if A > B
     *
     * Examples:
     * - compareNumbers("0.1", "1") → -1 (prologue comes first)
     * - compareNumbers("1", "1.5") → -1 (1.5 is a fractional chapter)
     * - compareNumbers("1.5", "2") → -1
     * - compareNumbers("999.1", "1") → 1 (epilogue comes last)
     */
    static compareNumbers(chapterA: string, chapterB: string): number {
        const numA = this.parseNumeric(chapterA);
        const numB = this.parseNumeric(chapterB);

        if (numA < numB) return -1;
        if (numA > numB) return 1;
        return 0;
    }

    /**
     * Sort chapter numbers in ascending order
     * @param chapters - Array of chapter numbers
     * @returns Sorted array
     *
     * Example: ["2", "1.5", "0.1", "999.1"] → ["0.1", "1.5", "2", "999.1"]
     */
    static sort(chapters: string[]): string[] {
        return [...chapters].sort((a, b) => this.compareNumbers(a, b));
    }

    /**
     * Format chapter numbers into readable ranges
     * @param chapters - Array of chapter numbers
     * @returns Formatted range string
     *
     * Examples:
     * - ["1", "2", "3"] → "1-3"
     * - ["1", "3", "5"] → "1, 3, 5"
     * - ["1", "2", "3", "5", "6"] → "1-3, 5-6"
     * - ["0.1", "1", "1.5", "2"] → "0.1, 1-2" (handles decimals)
     */
    static formatRange(chapters: string[]): string {
        if (chapters.length === 0) return '';
        if (chapters.length === 1) return chapters[0];

        const sorted = this.sort(chapters);
        const ranges: string[] = [];
        let start = sorted[0];
        let end = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const current = this.parseNumeric(sorted[i]);
            const prevEnd = this.parseNumeric(end);

            // Check if this chapter is consecutive to the previous one
            // Allow for small gaps due to decimal chapters (e.g., 1 -> 1.5 -> 2)
            const gap = current - prevEnd;
            const isConsecutive = Math.abs(gap - 1) < 0.01 || Math.abs(gap - 0.5) < 0.01;

            if (isConsecutive) {
                end = sorted[i];
            } else {
                // Range ended, save it
                const rangeStr =
                    start === end
                        ? start
                        : `${start}-${end}`;
                ranges.push(rangeStr);
                start = end = sorted[i];
            }
        }

        // Don't forget the last range
        const rangeStr = start === end ? start : `${start}-${end}`;
        ranges.push(rangeStr);

        return ranges.join(', ');
    }

    /**
     * Parse chapter number to numeric value for comparison
     * Handles decimal chapters and special offsets
     * @param chapterNumber - Chapter number string
     * @returns Numeric value
     *
     * Examples:
     * - "1" → 1.0
     * - "1.5" → 1.5
     * - "0.1" → 0.1 (prologue)
     * - "999.1" → 999.1 (epilogue)
     */
    private static parseNumeric(chapterNumber: string): number {
        return parseFloat(chapterNumber) || 0;
    }

    /**
     * Normalize chapter title format
     * @param title - Chapter title to normalize
     * @returns Normalized title
     *
     * Examples:
     * - "CHAPTER 1" → "Chapter 1"
     * - "Chapt. 1" → "Chapter 1"
     * - "Ch. 1" → "Chapter 1"
     */
    private static normalizeTitle(title: string): string {
        return title
            .replace(/\b(chapt?(?:er)?\.?|ch\.?)\s+/i, 'Chapter ')
            .replace(/\b(prologue)\b/i, 'Prologue')
            .replace(/\b(epilogue)\b/i, 'Epilogue')
            .replace(/\b(omake)\b/i, 'Omake')
            .replace(/\b(extra)\b/i, 'Extra')
            .replace(/\b(bonus)\b/i, 'Bonus')
            .trim();
    }

    /**
     * Validate chapter number format
     * @param chapterNumber - Chapter number to validate
     * @returns true if valid chapter number format
     *
     * Examples:
     * - "1" → true
     * - "1.5" → true
     * - "0.1" → true
     * - "999.1" → true
     * - "abc" → false
     * - "" → false
     */
    static isValid(chapterNumber: string): boolean {
        if (!chapterNumber) return false;
        return /^\d+(\.\d+)?$/.test(chapterNumber);
    }
}
