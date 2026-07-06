import { stickerStorageService, isSafeStickerFilename } from '@/services/stickerStorageService';

export { isSafeStickerFilename };
export { STICKER_IMAGE_EXT_RE } from '@/services/stickerStorageService';

/** Legacy site path prefix — kept only so historical content references still validate. */
export const LEGACY_STICKER_PREFIX = '/media/stickers/';
/** Legacy public sticker-bucket hosts — kept only so historical full-URL content still validates. */
const LEGACY_STICKER_HOSTS = new Set(['stickers.garage.chit.sh']);

/** Build the canonical (same-origin) sticker URL for a filename, or null if unsafe. */
export function buildStickerImageUrl(filename: string): string | null {
  return stickerStorageService.buildUrl(filename);
}

/**
 * Whether `url` is an allowed sticker reference:
 *  - the canonical `/api/media/sticker/<file>` path (current),
 *  - a configured-bucket sticker URL,
 *  - a legacy `/media/stickers/<file>` site path, or
 *  - a legacy public sticker-bucket URL (older stored content).
 */
export function isAllowedStickerImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (stickerStorageService.isAllowedUrl(trimmed)) return true;
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  if (pathOnly.startsWith(LEGACY_STICKER_PREFIX)) {
    return isSafeStickerFilename(pathOnly.slice(LEGACY_STICKER_PREFIX.length));
  }
  try {
    const parsed = new URL(trimmed);
    if (LEGACY_STICKER_HOSTS.has(parsed.hostname)) {
      const filename = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
      return isSafeStickerFilename(filename);
    }
  } catch {
    // not a full URL — fall through
  }
  return false;
}
