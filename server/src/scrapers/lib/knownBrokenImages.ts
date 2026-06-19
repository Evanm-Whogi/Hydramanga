/**
 * Known "broken image" fingerprints served by upstream sources.
 *
 * Some sources don't 404 a missing page — they return HTTP 200 with a static
 * "broken image" graphic. Storing that graphic looks like a successful page but
 * is really a hole in the chapter. When a downloaded page's bytes match one of
 * these fingerprints we store our own placeholder slot instead, so the page is
 * detectable/re-downloadable the same way every other placeholder is.
 *
 * This is intentionally narrow: it only fires on a source's *known* fallback
 * graphic (an exact byte match), never on download errors. A genuine page that
 * happens to be the same byte length is still distinguished by its SHA-256.
 *
 * To add a signature, fetch the source's broken-image asset and record:
 *   sha256sum broken_image.jpg   # → sha256
 *   stat -c %s broken_image.jpg  # → length
 */
import crypto from 'crypto';

export interface BrokenImageSignature {
    /** Source/provider this fingerprint belongs to (for logging). */
    source: string;
    /** Exact byte length of the asset — a cheap pre-filter before hashing. */
    length: number;
    /** Lowercase hex SHA-256 of the raw asset bytes. */
    sha256: string;
}

/**
 * WeebCentral serves this 894x547 JPEG ("broken_image.jpg") in place of pages
 * whose image is missing on their CDN, returned with a normal-looking URL and a
 * 200 status (so URL-based detection can't catch it).
 */
export const KNOWN_BROKEN_IMAGE_SIGNATURES: BrokenImageSignature[] = [
    {
        source: 'weebcentral',
        length: 62071,
        sha256: '7fba5953f205702a5c3087250ecd6b2084095abd076d86a63aca07fb4a263904',
    },
];

/** Lengths we care about, so the common case skips hashing entirely. */
const KNOWN_LENGTHS = new Set(KNOWN_BROKEN_IMAGE_SIGNATURES.map((s) => s.length));

/**
 * If `buffer` is byte-identical to a known source broken-image asset, return the
 * source name; otherwise `null`. Length is checked first so a hash is only
 * computed for the rare buffer whose size matches a known asset.
 */
export function matchKnownBrokenImage(buffer: Buffer): string | null {
    if (!KNOWN_LENGTHS.has(buffer.length)) return null;
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const match = KNOWN_BROKEN_IMAGE_SIGNATURES.find(
        (s) => s.length === buffer.length && s.sha256 === digest
    );
    return match ? match.source : null;
}
