import { stickerStorageService, isSafeStickerFilename } from '@/services/stickerStorageService';

export { isSafeStickerFilename };
export { STICKER_IMAGE_EXT_RE } from '@/services/stickerStorageService';

/** Legacy site path prefix — kept only so historical content references still validate. */
export const LEGACY_STICKER_PREFIX = '/media/stickers/';

/** Build the public (Garage) URL for a sticker filename, or null if unsafe. */
export function buildStickerImageUrl(filename: string): string | null {
  return stickerStorageService.buildUrl(filename);
}

/**
 * Whether `url` is an allowed sticker reference: a Garage sticker URL (current),
 * or a legacy `/media/stickers/<file>` site path (for older stored content).
 */
export function isAllowedStickerImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (stickerStorageService.isAllowedUrl(trimmed)) return true;
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  if (pathOnly.startsWith(LEGACY_STICKER_PREFIX)) {
    return isSafeStickerFilename(pathOnly.slice(LEGACY_STICKER_PREFIX.length));
  }
  return false;
}
