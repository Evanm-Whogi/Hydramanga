import { apiPostFormData, apiDelete, apiGet } from '@/lib/api';

export async function uploadProfilePicture(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return await apiPostFormData('/users/profile-picture', formData);
}

export async function deleteProfilePicture(): Promise<any> {
    return await apiDelete('/users/profile-picture');
}