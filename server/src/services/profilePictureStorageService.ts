/**
 * Profile-picture storage (Garage S3).
 *
 * Avatars live in the profile-pictures bucket under `${userId}/${filename}.webp`.
 * The DB `user.image` column stores the full public URL (alongside external OAuth
 * avatar URLs and the Garage-hosted default), so readers use it directly.
 */
import { appConfig } from '@/config/appConfig';
import { S3Bucket } from '@/lib/s3Bucket';

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+\.(webp|png|jpe?g|gif)$/i;

class ProfilePictureStorageService {
    private readonly bucket: S3Bucket;

    constructor() {
        this.bucket = new S3Bucket(
            appConfig.storage.profilePictures.bucket,
            appConfig.storage.profilePictures.publicBaseUrl
        );
    }

    get publicBaseUrl(): string {
        return appConfig.storage.profilePictures.publicBaseUrl.replace(/\/+$/, '');
    }

    /** Stable public URL of the default avatar (kept in the bucket root). */
    get defaultAvatarUrl(): string {
        return `${this.publicBaseUrl}/default.jpg`;
    }

    /** Upload a WebP avatar for a user; returns its public URL. */
    async uploadAvatar(userId: string, webpBuffer: Buffer): Promise<string> {
        const filename = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const key = `${userId}/${filename}`;
        await this.bucket.putObject(key, webpBuffer, 'image/webp');
        return this.bucket.publicUrl(key);
    }

    /** Delete an avatar object given its stored public URL (no-op for non-owned/default URLs). */
    async deleteByUrl(url: string | null | undefined): Promise<void> {
        if (!url) return;
        const key = this.bucket.keyFromPublicUrl(url);
        // Never delete the shared default object.
        if (!key || key === 'default.jpg') return;
        await this.bucket.deleteObject(key);
    }

    /**
     * Whether `url` is a well-formed avatar URL owned by `userId`
     * (`${publicBaseUrl}/${userId}/${safeFilename}`). Guards against pointing at
     * another user's folder or traversal.
     */
    isOwnedUrl(url: string, userId: string): boolean {
        const key = this.bucket.keyFromPublicUrl(url);
        if (!key) return false;
        const prefix = `${userId}/`;
        if (!key.startsWith(prefix)) return false;
        const filename = key.slice(prefix.length);
        return SAFE_FILENAME_RE.test(filename) && !filename.includes('/');
    }

    /** Whether `url` is the default avatar in this bucket. */
    isDefaultUrl(url: string): boolean {
        return this.bucket.keyFromPublicUrl(url) === 'default.jpg';
    }
}

export const profilePictureStorageService = new ProfilePictureStorageService();
