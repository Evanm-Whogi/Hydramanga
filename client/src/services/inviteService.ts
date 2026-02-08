import { apiPost, apiGet } from '@/lib/api';

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

interface InviteCode {
  id: string;
  code: string;
  createdAt: Date;
  used: boolean;
  usedAt: Date | null;
  usedByUser: {
    id: string;
    name: string;
    image: string;
  } | null;
}

export async function getUserInviteCodes(): Promise<ServiceResult<InviteCode[]>> {
  try {
    const result = await apiGet('/invites');
    if (!result.success) return { success: false, message: result.message || 'Failed to fetch invite codes' };
    
    return { success: true, data: result.data };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to fetch invite codes' };
  }
}

export async function generateInviteCode(): Promise<ServiceResult<InviteCode>> {
  try {
    const result = await apiPost('/invites/generate', {});
    if (!result.success) return { success: false, message: result.message || 'Failed to generate invite code' };

    return { success: true, data: result.data };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to generate invite code' };
  }
}

export async function validateInviteCode(code: string): Promise<ServiceResult<{ id: string; code: string; valid: boolean; message?: string }>> {
  try {
    const result = await apiPost('/invites/validate', { code });
    if (!result.success) return { success: false, message: result.message || 'Invalid invite code' };

    return { success: true, data: result.data };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Invalid invite code' };
  }
}

export async function useInviteCode(code: string, userId: string): Promise<ServiceResult<null>> {
  try {
    const result = await apiPost('/invites/use', { code, userId });
    if (!result.success) return { success: false, message: result.message || 'Failed to use invite code' };

    return { success: true, data: null };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to use invite code' };
  }
}
