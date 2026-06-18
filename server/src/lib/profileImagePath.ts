import { profilePictureStorageService } from '@/services/profilePictureStorageService';

/**
 * Allowed values when an admin sets a user's avatar URL:
 *  - the Garage-hosted default avatar,
 *  - an avatar owned by this user in the profile-pictures bucket,
 *  - any external https image URL (e.g. an OAuth provider avatar).
 */
export function isAllowedProfileImageUrl(image: string, userId: string): boolean {
  const trimmed = image.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (profilePictureStorageService.isDefaultUrl(trimmed)) return true;
  if (profilePictureStorageService.isOwnedUrl(trimmed, userId)) return true;
  if (trimmed.startsWith('https://')) return true;
  return false;
}
