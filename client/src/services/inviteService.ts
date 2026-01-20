import { apiPost, apiGet } from '@/lib/api';

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

export async function getUserInviteCodes(): Promise<InviteCode[]> {
  const result = await apiGet('/invites');
  if (!result.success) throw new Error('Failed to fetch invite codes');
  return result.data;
}

export async function generateInviteCode(): Promise<InviteCode> {
  const result = await apiPost('/invites/generate', {});
  if (!result.success) throw new Error(result.message || 'Failed to generate invite code');
  return result.data;
}

export async function validateInviteCode(code: string): Promise<{ id: string; code: string; valid: boolean }> {
  const result = await apiPost('/invites/validate', { code });
  if (!result.success) throw new Error(result.message || 'Invalid invite code');
  return result.data;
}

export async function useInviteCode(code: string, userId: string): Promise<void> {
  const result = await apiPost('/invites/use', { code, userId });
  if (!result.success) throw new Error(result.message || 'Failed to use invite code');
}
