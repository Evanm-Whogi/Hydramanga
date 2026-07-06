/**
 * Profile-picture storage (private S3 bucket).
 *
 * Avatars live in the profile-pictures bucket under `${userId}/${filename}.webp`.
 * The bucket is private: `user.image` stores a stable same-origin media path
 * (`/api/media/avatar/${userId}/${filename}`) which 302-redirects to a fresh
 * presigned URL on the custom image domain. External OAuth avatar URLs and the
 * bundled local default are stored verbatim.
 */
import { appConfig } from '@/config/appConfig';
import { S3Bucket } from '@/lib/s3Bucket';

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+\.(webp|png|jpe?g|gif)$/i;
const SAFE_USERID_RE = /^[A-Za-z0-9_-]+$/;

/** Canonical same-origin avatar path prefix (stable value stored in `user.image`). */
export const MEDIA_AVATAR_PREFIX = '/api/media/avatar/';
/** Bundled client-static default avatar (served by Next, not from any bucket). */
export const DEFAULT_AVATAR_URL = '/default-avatar.jpg';
/** Historical default-avatar URLs, still recognised as "the default" during transition. */
const LEGACY_DEFAULT_URLS = ['/media/pfp/default.jpg', 'https://profile-pictures.garage.chit.sh/default.jpg'];

class ProfilePictureStorageService {
    private readonly bucket: S3Bucket;

    constructor() {
        this.bucket = new S3Bucket(
            appConfig.storage.profilePictures.bucket,
            appConfig.storage.profilePictures.publicBaseUrl
        );
    }

    /** Stable value for the default avatar (bundled client static; no bucket read). */
    get defaultAvatarUrl(): string {
        return DEFAULT_AVATAR_URL;
    }

    /** Stable same-origin media path for an avatar object `${userId}/${filename}`. */
    private mediaUrl(userId: string, filename: string): string {
        return `${MEDIA_AVATAR_PREFIX}${userId}/${filename}`;
    }

    /** Upload a WebP avatar for a user; returns its stable same-origin media URL. */
    async uploadAvatar(userId: string, webpBuffer: Buffer): Promise<string> {
        const filename = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        await this.bucket.putObject(`${userId}/${filename}`, webpBuffer, 'image/webp');
        return this.mediaUrl(userId, filename);
    }

    /**
     * Stable public URL (custom image domain) for an avatar object, or null when
     * the userId/filename are unsafe. Backs the `/media/avatar/:userId/:file` redirect.
     */
    resolveCdnUrl(userId: string, filename: string): string | null {
        if (!SAFE_USERID_RE.test(userId) || filename.includes('/') || !SAFE_FILENAME_RE.test(filename)) return null;
        return this.bucket.publicUrl(`${userId}/${filename}`);
    }

    /** Object key `${userId}/${file}` for a stored avatar URL (new media path or legacy bucket URL), or null. */
    private keyFromStoredUrl(url: string): string | null {
        const pathOnly = url.trim().split('?')[0].split('#')[0];
        if (pathOnly.startsWith(MEDIA_AVATAR_PREFIX)) {
            const key = pathOnly.slice(MEDIA_AVATAR_PREFIX.length);
            return key.includes('/') && !key.includes('..') ? key : null;
        }
        return this.bucket.keyFromPublicUrl(url.trim());
    }

    /** Delete an avatar object given its stored URL (no-op for default/external/non-owned URLs). */
    async deleteByUrl(url: string | null | undefined): Promise<void> {
        if (!url) return;
        if (this.isDefaultUrl(url)) return;
        const key = this.keyFromStoredUrl(url);
        // Never delete the shared default object; ignore unparseable/external URLs.
        if (!key || key === 'default.jpg') return;
        await this.bucket.deleteObject(key);
    }

    /**
     * Whether `url` is a well-formed avatar URL owned by `userId`
     * (`/api/media/avatar/${userId}/${safeFilename}` or the legacy bucket form).
     * Guards against pointing at another user's folder or traversal.
     */
    isOwnedUrl(url: string, userId: string): boolean {
        const key = this.keyFromStoredUrl(url);
        if (!key) return false;
        const prefix = `${userId}/`;
        if (!key.startsWith(prefix)) return false;
        const filename = key.slice(prefix.length);
        return SAFE_FILENAME_RE.test(filename) && !filename.includes('/');
    }

    /** Whether `url` is the default avatar (bundled local default or a legacy default). */
    isDefaultUrl(url: string): boolean {
        const trimmed = url.trim();
        if (trimmed === DEFAULT_AVATAR_URL || LEGACY_DEFAULT_URLS.includes(trimmed)) return true;
        return this.bucket.keyFromPublicUrl(trimmed) === 'default.jpg';
    }
}

export const profilePictureStorageService = new ProfilePictureStorageService();
