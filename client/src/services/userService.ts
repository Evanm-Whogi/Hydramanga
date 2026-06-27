import { apiPostFormData, apiDelete, apiGet, apiPatch } from '@/lib/api';
import type { ProfileVisibility } from '@/types/profile';

export interface UserSettings {
  hideNsfw: boolean;
  isProfilePublic: boolean;
  incognitoMode: boolean;
  profileVisibility: ProfileVisibility;
}

export async function getSettings(): Promise<UserSettings> {
  const data = await apiGet('/users/settings');
  return {
    hideNsfw: data?.hideNsfw ?? true,
    isProfilePublic: data?.isProfilePublic ?? true,
    incognitoMode: data?.incognitoMode ?? false,
    profileVisibility: data?.profileVisibility ?? {
      bio: true,
      readingStats: true,
      favorites: true,
      lists: true,
      bookmarks: true,
      comments: true,
      wall: true,
      recentReads: true,
    },
  };
}

export async function updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  const data = await apiPatch('/users/settings', updates);
  return {
    hideNsfw: data?.hideNsfw ?? true,
    isProfilePublic: data?.isProfilePublic ?? true,
    incognitoMode: data?.incognitoMode ?? false,
    profileVisibility: data?.profileVisibility ?? {
      bio: true,
      readingStats: true,
      favorites: true,
      lists: true,
      bookmarks: true,
      comments: true,
      wall: true,
      recentReads: true,
    },
  };
}

export interface QuickSearchUser { id: string; username: string; name: string; image?: string | null }

export async function searchUsers(search: string, limit = 8): Promise<{ items: QuickSearchUser[] }> {
    const params = new URLSearchParams({ search: search.trim(), limit: String(limit) });
    return await apiGet(`/users/search?${params}`);
}

export async function uploadProfilePicture(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("profilePicture", file);
    return await apiPostFormData("/users/profile-picture", formData);
}

export async function deleteProfilePicture(): Promise<any> {
    return await apiDelete('/users/profile-picture');
}