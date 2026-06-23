/**
 * Manga chapter-image storage.
 *
 * Thin, chapter-specific layer over a Garage (S3) bucket: scrapers upload pages
 * here, cleanup/migration jobs delete/copy objects here, and public read URLs are
 * built from the bucket's public web endpoint. Generic object operations live in
 * `S3Bucket`; this class adds the chapter transform/placeholder/key conventions.
 *
 * Object key scheme mirrors the old on-disk layout: `${storagePrefix}/${NN}.webp`
 * (e.g. `6029/1/01.webp`), where `storagePrefix` is the value stored on the
 * `chapters.storage_prefix` column.
 */
import { Readable } from 'stream';
import sharp from 'sharp';
import { appConfig } from '@/config/appConfig';
import { S3Bucket } from '@/lib/s3Bucket';

/**
 * Per-page transform tuning. Defaults suit already-degraded scraped web images
 * (small files). Pristine sources (archive/torrent scans full of screentones)
 * should pass a higher `quality`/`effort` — q75 visibly blocks on B&W gradients.
 */
export interface PageTransformOptions {
    /** Max output width in px (default 2500). */
    width?: number;
    /** WebP quality 1–100 (default 75). */
    quality?: number;
    /** WebP effort 0–6 (default 2). */
    effort?: number;
}

/** Apply the shared page transform (resize + WebP) to a sharp instance. */
function applyPageTransform(image: sharp.Sharp, opts: PageTransformOptions = {}): sharp.Sharp {
    return image
        .resize({
            width: opts.width ?? 2500,
            height: 16383,
            fit: 'inside',
            withoutEnlargement: true,
            fastShrinkOnLoad: true,
        })
        .webp({
            quality: opts.quality ?? 75,
            effort: opts.effort ?? 2,
            smartSubsample: true,
        });
}

/** Zero-pad a 1-based page number to at least two digits (01, 02, … 100). */
function formatPageNumber(page: number): string {
    return page.toString().padStart(2, '0');
}

class ObjectStorageService {
    private readonly bucket: S3Bucket;
    private placeholderBuffer: Buffer | null = null;

    constructor() {
        this.bucket = new S3Bucket(appConfig.storage.manga.bucket, appConfig.storage.manga.publicBaseUrl);
    }

    /** Object key for a given storage prefix and 0-based page index. */
    keyFor(storagePrefix: string, pageIndex: number): string {
        return `${storagePrefix}/${formatPageNumber(pageIndex + 1)}.webp`;
    }

    /** Public read URL for a given storage prefix and 1-based page number. */
    publicUrl(storagePrefix: string, pageNumber: number): string {
        return this.bucket.publicUrl(`${storagePrefix}/${formatPageNumber(pageNumber)}.webp`);
    }

    /** Low-level upload of an already-prepared body. */
    async putObject(key: string, body: Buffer, contentType = 'image/webp'): Promise<void> {
        await this.bucket.putObject(key, body, contentType);
    }

    /**
     * Transform a downloaded image (resize + WebP) and upload it as the given
     * page. Accepts either a readable stream or an already-buffered image.
     * Buffers the (small) transformed image in memory rather than multipart-streaming.
     */
    async transformAndUploadPage(
        storagePrefix: string,
        pageIndex: number,
        source: Readable | Buffer,
        opts?: PageTransformOptions
    ): Promise<void> {
        let buffer: Buffer;
        if (Buffer.isBuffer(source)) {
            buffer = await applyPageTransform(sharp(source, { failOn: 'none' }), opts).toBuffer();
        } else {
            const transformer = applyPageTransform(sharp({ failOn: 'none' }), opts);
            // Propagate source errors into the sharp pipeline so toBuffer() rejects.
            source.on('error', (err) => transformer.destroy(err));
            buffer = await source.pipe(transformer).toBuffer();
        }
        await this.bucket.putObject(this.keyFor(storagePrefix, pageIndex), buffer, 'image/webp');
    }

    /**
     * Upload the shared placeholder image into a page slot (used when a page is
     * irrecoverable). The placeholder is generated once and cached in memory.
     */
    async uploadPlaceholderSlot(storagePrefix: string, pageIndex: number): Promise<void> {
        const buffer = await this.getPlaceholderBuffer();
        await this.bucket.putObject(this.keyFor(storagePrefix, pageIndex), buffer, 'image/webp');
    }

    private async getPlaceholderBuffer(): Promise<Buffer> {
        if (this.placeholderBuffer) return this.placeholderBuffer;
        this.placeholderBuffer = await sharp({
            create: { width: 400, height: 600, channels: 3, background: { r: 45, g: 45, b: 48 } },
        })
            .webp({ quality: 80, effort: 1 })
            .toBuffer();
        return this.placeholderBuffer;
    }

    /** Delete the chapter folders for each of the given storage prefixes. */
    async deletePrefixes(prefixes: string[]): Promise<void> {
        for (const prefix of prefixes) {
            await this.bucket.deletePrefix(prefix);
        }
    }

    /** Delete every object belonging to a series. */
    async deleteSeries(seriesId: number | string): Promise<void> {
        await this.bucket.deletePrefix(String(seriesId));
    }

    /** Move all objects under `fromPrefix` to `toPrefix` (copy then delete). */
    async copyPrefix(fromPrefix: string, toPrefix: string): Promise<boolean> {
        return this.bucket.copyPrefix(fromPrefix, toPrefix);
    }

    /** Whether any object exists under `${prefix}/` (used for idempotent backfill). */
    async prefixExists(prefix: string): Promise<boolean> {
        return this.bucket.prefixExists(prefix);
    }
}

export const objectStorageService = new ObjectStorageService();
export { ObjectStorageService };
