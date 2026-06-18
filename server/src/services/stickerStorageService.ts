/**
 * Sticker storage (Garage S3).
 *
 * Sticker image files live at the root of the stickers bucket keyed by filename
 * (e.g. `party.webp`). The DB `content_stickers.image_url` stores the full public
 * URL. Admins populate the bucket out-of-band, then `scanAndImportFromDisk`
 * (now scan-from-bucket) registers any new files.
 */
import { appConfig } from '@/config/appConfig';
import { S3Bucket } from '@/lib/s3Bucket';

export const STICKER_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

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

    /** Public URL for a sticker filename. */
    publicUrl(filename: string): string {
        return this.bucket.publicUrl(filename);
    }

    /** Filename for a stored sticker public URL of this bucket, or null. */
    filenameFromUrl(url: string): string | null {
        const key = this.bucket.keyFromPublicUrl(url);
        return key && isSafeStickerFilename(key) ? key : null;
    }

    /** Whether a URL is a valid sticker URL in this bucket. */
    isAllowedUrl(url: string): boolean {
        return this.filenameFromUrl(url.trim()) !== null;
    }

    /** Build a sticker public URL from a filename, or null if unsafe. */
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
