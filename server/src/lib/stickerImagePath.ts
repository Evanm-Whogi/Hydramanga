import fs from 'fs/promises';
import path from 'path';

export const STICKER_MEDIA_PREFIX = '/media/stickers/';
export const STICKER_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

export function getStickerStorageRoot(): string {
  return path.resolve(process.env.STICKER_STORAGE_ROOT || path.join(process.cwd(), '../data/stickers'));
}

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

export function buildStickerImageUrl(filename: string): string | null {
  if (!isSafeStickerFilename(filename)) return null;
  return `${STICKER_MEDIA_PREFIX}${filename}`;
}

export function isAllowedStickerImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (!trimmed.startsWith(STICKER_MEDIA_PREFIX)) return false;
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  const filename = pathOnly.slice(STICKER_MEDIA_PREFIX.length);
  return isSafeStickerFilename(filename);
}

export function resolveSafeStickerFilePath(imageUrl: string): string | null {
  if (!isAllowedStickerImageUrl(imageUrl)) return null;
  const filename = imageUrl.trim().split('?')[0].split('#')[0].slice(STICKER_MEDIA_PREFIX.length);
  const root = getStickerStorageRoot();
  const resolved = path.resolve(root, filename);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

export async function listStickerFilenamesFromDisk(): Promise<string[]> {
  const root = getStickerStorageRoot();
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && isSafeStickerFilename(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}
