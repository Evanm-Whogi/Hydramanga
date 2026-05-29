import path from 'path';

const PROFILE_MEDIA_PREFIX = '/media/pfp/';

/**
 * Validates a stored profile image URL and resolves it to an absolute filesystem path.
 * Rejects traversal, foreign user directories, and non-local paths.
 */
export function resolveSafeProfileImagePath(
  imageUrl: string | null | undefined,
  userId: string
): string | null {
  if (!imageUrl || imageUrl.startsWith('/default')) {
    return null;
  }

  const expectedPrefix = `${PROFILE_MEDIA_PREFIX}${userId}/`;
  if (!imageUrl.startsWith(expectedPrefix)) {
    return null;
  }

  const filename = imageUrl.slice(expectedPrefix.length);
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return null;
  }

  const dataRoot = path.resolve(process.cwd(), '..', 'data/profile-pictures');
  const resolved = path.resolve(dataRoot, userId, filename);
  const userDir = path.resolve(dataRoot, userId);

  if (!resolved.startsWith(userDir + path.sep) && resolved !== userDir) {
    return null;
  }

  return resolved;
}

/** Allowed values when an admin sets a user's avatar URL. */
export function isAllowedProfileImageUrl(image: string, userId: string): boolean {
  if (image.startsWith('/default')) {
    return image.length <= 64;
  }
  if (image.startsWith(`${PROFILE_MEDIA_PREFIX}${userId}/`)) {
    const filename = image.slice(`${PROFILE_MEDIA_PREFIX}${userId}/`.length);
    return (
      filename.length > 0 &&
      filename.length <= 128 &&
      !filename.includes('..') &&
      !filename.includes('/') &&
      !filename.includes('\\')
    );
  }
  if (image.startsWith('https://')) {
    return image.length <= 500;
  }
  return false;
}
