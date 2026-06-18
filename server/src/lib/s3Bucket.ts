/**
 * Generic S3 (Garage) bucket wrapper.
 *
 * All media buckets (manga / profile pictures / stickers) share one `S3Client`
 * (same endpoint + credentials) and differ only by bucket name and public read
 * URL. This class holds the per-bucket config and exposes the low-level object
 * operations; media-specific services compose an instance of it.
 */
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { appConfig } from '@/config/appConfig';

let sharedClient: S3Client | null = null;

/** Lazily-built S3 client shared across all buckets. */
export function getS3Client(): S3Client {
    if (!sharedClient) {
        const { endpoint, region, accessKeyId, secretAccessKey, forcePathStyle } = appConfig.storage;
        sharedClient = new S3Client({
            endpoint,
            region,
            forcePathStyle,
            credentials: { accessKeyId, secretAccessKey },
        });
    }
    return sharedClient;
}

export class S3Bucket {
    constructor(
        public readonly bucket: string,
        private readonly publicBaseUrl: string,
        private readonly client: S3Client = getS3Client()
    ) {}

    /** Public read URL for an object key. */
    publicUrl(key: string): string {
        const base = this.publicBaseUrl.replace(/\/+$/, '');
        return `${base}/${key.replace(/^\/+/, '')}`;
    }

    /** Extract the object key from a public URL of this bucket, or null if it isn't one. */
    keyFromPublicUrl(url: string): string | null {
        const base = this.publicBaseUrl.replace(/\/+$/, '');
        if (!url.startsWith(`${base}/`)) return null;
        const key = url.slice(base.length + 1).split('?')[0].split('#')[0];
        return key || null;
    }

    async putObject(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
        await this.client.send(
            new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
        );
    }

    async deleteObject(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    /** HeadObject existence + size check (size is null when the object is absent). */
    async headObject(key: string): Promise<{ exists: boolean; size: number | null }> {
        try {
            const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return { exists: true, size: res.ContentLength ?? null };
        } catch (err: any) {
            if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
                return { exists: false, size: null };
            }
            throw err;
        }
    }

    /** List object keys under a prefix (handles pagination). */
    async listKeys(prefix = ''): Promise<string[]> {
        const keys: string[] = [];
        let continuationToken: string | undefined;
        do {
            const listed = await this.client.send(
                new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken })
            );
            for (const obj of listed.Contents ?? []) {
                if (obj.Key) keys.push(obj.Key);
            }
            continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);
        return keys;
    }

    /** Whether any object exists under `${prefix}/`. */
    async prefixExists(prefix: string): Promise<boolean> {
        const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
        const listed = await this.client.send(
            new ListObjectsV2Command({ Bucket: this.bucket, Prefix: normalized, MaxKeys: 1 })
        );
        return (listed.KeyCount ?? 0) > 0;
    }

    /** Delete every object whose key starts with `${rawPrefix}/` (folder-style delete). */
    async deletePrefix(rawPrefix: string): Promise<void> {
        const prefix = rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`;
        let continuationToken: string | undefined;
        do {
            const listed = await this.client.send(
                new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken })
            );
            const objects = (listed.Contents ?? [])
                .map((o) => o.Key)
                .filter((k): k is string => Boolean(k));
            if (objects.length > 0) {
                await this.client.send(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: { Objects: objects.map((Key) => ({ Key })), Quiet: true },
                    })
                );
            }
            continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);
    }

    /**
     * Move all objects under `fromPrefix` to `toPrefix` (copy then delete the
     * originals; S3 has no native move). Returns true if anything was moved.
     */
    async copyPrefix(fromPrefix: string, toPrefix: string): Promise<boolean> {
        const from = fromPrefix.endsWith('/') ? fromPrefix : `${fromPrefix}/`;
        const to = toPrefix.endsWith('/') ? toPrefix : `${toPrefix}/`;
        if (from === to) return true; // no-op; never copy-then-delete onto itself
        let continuationToken: string | undefined;
        let moved = false;
        do {
            const listed = await this.client.send(
                new ListObjectsV2Command({ Bucket: this.bucket, Prefix: from, ContinuationToken: continuationToken })
            );
            for (const obj of listed.Contents ?? []) {
                if (!obj.Key) continue;
                const destKey = `${to}${obj.Key.slice(from.length)}`;
                // CopySource is the canonical `bucket/key` form; encode the key but keep path separators.
                const copySource = `${this.bucket}/${encodeURIComponent(obj.Key).replace(/%2F/g, '/')}`;
                await this.client.send(
                    new CopyObjectCommand({ Bucket: this.bucket, CopySource: copySource, Key: destKey })
                );
                moved = true;
            }
            continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);

        if (moved) await this.deletePrefix(from);
        return moved;
    }
}
