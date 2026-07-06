/**
 * Sticker storage (private S3 bucket).
 *
 * Sticker image files live at the root of the stickers bucket keyed by filename
 * (e.g. `party.webp`). The bucket is private: `content_stickers.image_url` stores
 * a stable same-origin media path (`/api/media/sticker/${filename}`) that
 * 302-redirects to a fresh presigned URL on the custom image domain. Admins
 * populate the bucket out-of-band, then `scanAndImportFromDisk` (scan-from-bucket)
 * registers any new files.
 */
import { appConfig } from '@/config/appConfig';
import { S3Bucket } from '@/lib/s3Bucket';

export const STICKER_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/** Canonical same-origin sticker path prefix (stable value stored in the DB / embedded in content). */
export const MEDIA_STICKER_PREFIX = '/api/media/sticker/';

export function isSafeStickerFilename(filename: string): boolean {
    return (
        filename.length > 0 &&
        filename.length <= 128 &&
        !filename.includes('..') &&
        !filename.includes('/') &&
        !filename.includes('\\') &&
        !filename.includes('\0') &&
        !filename.startsWith('.') &&
        STICKER_IMAGE_EXT_RE.test(filename)
    );
}

class StickerStorageService {
    private readonly bucket: S3Bucket;

    constructor() {
        this.bucket = new S3Bucket(appConfig.storage.stickers.bucket, appConfig.storage.stickers.publicBaseUrl);
    }

    get publicBaseUrl(): string {
        return appConfig.storage.stickers.publicBaseUrl.replace(/\/+$/, '');
    }

    /** Canonical same-origin URL for a sticker filename (redirects to a presigned URL). */
    publicUrl(filename: string): string {
        return `${MEDIA_STICKER_PREFIX}${filename}`;
    }

    /**
     * Stable public URL (custom image domain) for a sticker, or null when the
     * filename is unsafe. Backs the `/media/sticker/:file` redirect. Distinct from
     * `publicUrl` (which returns the canonical same-origin `/api/media/sticker/...`
     * value stored in the DB and embedded in content).
     */
    resolveCdnUrl(filename: string): string | null {
        if (!isSafeStickerFilename(filename)) return null;
        return this.bucket.publicUrl(filename);
    }

    /** Filename for a stored sticker URL — new canonical media path or a legacy bucket URL — or null. */
    filenameFromUrl(url: string): string | null {
        const pathOnly = url.trim().split('?')[0].split('#')[0];
        if (pathOnly.startsWith(MEDIA_STICKER_PREFIX)) {
            const filename = pathOnly.slice(MEDIA_STICKER_PREFIX.length);
            return isSafeStickerFilename(filename) ? filename : null;
        }
        const key = this.bucket.keyFromPublicUrl(url.trim());
        return key && isSafeStickerFilename(key) ? key : null;
    }

    /** Whether a URL is a valid sticker URL (canonical media path or legacy bucket URL). */
    isAllowedUrl(url: string): boolean {
        return this.filenameFromUrl(url.trim()) !== null;
    }

    /** Build the canonical same-origin sticker URL from a filename, or null if unsafe. */
    buildUrl(filename: string): string | null {
        return isSafeStickerFilename(filename) ? this.publicUrl(filename) : null;
    }

    /** List safe sticker filenames present in the bucket. */
    async listFilenames(): Promise<string[]> {
        const keys = await this.bucket.listKeys();
        return keys.filter((k) => isSafeStickerFilename(k)).sort((a, b) => a.localeCompare(b));
    }

    /** Existence + size for a sticker object (used to validate during scan). */
    async statFilename(filename: string): Promise<{ exists: boolean; size: number | null }> {
        if (!isSafeStickerFilename(filename)) return { exists: false, size: null };
        return this.bucket.headObject(filename);
    }
}

export const stickerStorageService = new StickerStorageService();
