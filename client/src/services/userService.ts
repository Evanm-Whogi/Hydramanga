import { apiPostFormData, apiDelete, apiGet, apiPatch } from '@/lib/api';

export interface UserSettings {
  hideNsfw: boolean;
}

export async function getSettings(): Promise<UserSettings> {
  const data = await apiGet('/users/settings');
  return { hideNsfw: data?.hideNsfw ?? false };
}

export async function updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  const data = await apiPatch('/users/settings', updates);
  return { hideNsfw: data?.hideNsfw ?? false };
}

export async function uploadProfilePicture(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return await apiPostFormData('/users/profile-picture', formData);
}

export async function deleteProfilePicture(): Promise<any> {
    return await apiDelete('/users/profile-picture');
}