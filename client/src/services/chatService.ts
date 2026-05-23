import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api';

export async function getChatMessages(limit = 50, beforeId?: number) {
  const q = beforeId ? `?limit=${limit}&beforeId=${beforeId}` : `?limit=${limit}`;
  return apiGet(`/chat/messages${q}`);
}

export async function postChatMessage(content: string) {
  return apiPost('/chat/messages', { content });
}

export async function updateChatMessage(messageId: number, content: string) {
  return apiPatch(`/chat/messages/${messageId}`, { content });
}

export async function deleteChatMessage(messageId: number) {
  return apiDelete(`/chat/messages/${messageId}`);
}

export async function muteChatUser(userId: string, hours?: number, reason?: string) {
  return apiPost('/chat/moderation/mute', { userId, hours, reason });
}

export async function unmuteChatUser(userId: string) {
  return apiPost('/chat/moderation/unmute', { userId });
}
