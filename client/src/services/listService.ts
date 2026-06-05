import { apiGet, apiPost, apiPut, apiDelete} from '@/lib/api';
import { isServer, getClientApiBase } from '@/lib/env';
import { parseRateLimitedResponse } from '@/lib/rateLimit';

const clientRequest = async (path: string, options: RequestInit) => {
  const res = await fetch(`${getClientApiBase()}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rateLimited = parseRateLimitedResponse(res, data);
    if (rateLimited) return Promise.reject(rateLimited);
    throw new Error(data?.message || 'Request failed');
  }
  return data;
};

export interface UserList {
  id: number;
  userId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListsData {
  lists: UserList[];
  [listSlug: string]: any;
}

// Get all user lists
export const fetchUserLists = async (): Promise<{ success: boolean; lists: UserList[] }> => {
  // On the client, go through Next's /api rewrite to carry browser cookies reliably
  if (!isServer && typeof window !== 'undefined') {
    const res = await fetch(`${getClientApiBase()}/lists`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to fetch lists');
    return res.json();
  }

  // Server-side (or SSR) can use the internal axios client
  return await apiGet('/lists');
};

// Create a new list
export const createList = async (name: string): Promise<{ success: boolean; list: UserList }> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest('/lists', { method: 'POST', body: JSON.stringify({ name }) });
  }
  const response = await apiPost('/lists', { name });
  return response.data;
};

// Update a list
export const updateList = async (
  listId: number, 
  updates: { name?: string; isVisible?: boolean; sortOrder?: number }
): Promise<{ success: boolean; list: UserList }> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest(`/lists/${listId}`, { method: 'PUT', body: JSON.stringify(updates) });
  }
  const response = await apiPut(`/lists/${listId}`, updates);
  return response.data;
};

// Delete a list
export const deleteList = async (listId: number): Promise<{ success: boolean; message: string }> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest(`/lists/${listId}`, { method: 'DELETE' });
  }
  const response = await apiDelete(`/lists/${listId}`);
  return response.data;
};

// Add manga to a specific list
export const addToList = async (listId: number, seriesId: number): Promise<{ 
  success: boolean; 
  message: string;
  data: any;
}> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest(`/lists/${listId}/items`, { method: 'POST', body: JSON.stringify({ seriesId }) });
  }
  const response = await apiPost(`/lists/${listId}/items`, { seriesId });
  return response.data;
};

// Remove manga from all lists
export const removeFromList = async (seriesId: number): Promise<{ 
  success: boolean;
  message: string;
}> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest(`/lists/items?seriesId=${seriesId}`, { method: 'DELETE' });
  }
  const response = await apiDelete('/lists/items', { data: { seriesId } });
  return response.data;
};

// Reorder lists
export const reorderLists = async (
  listOrders: Array<{ id: number; sortOrder: number }>
): Promise<{ success: boolean; message: string }> => {
  if (!isServer && typeof window !== 'undefined') {
    return clientRequest('/lists/reorder', { method: 'POST', body: JSON.stringify({ listOrders }) });
  }
  const response = await apiPost('/lists/reorder', { listOrders });
  return response.data;
};

// Fetch all lists with their items (for the lists page)
export const fetchAllLists = async (): Promise<ListsData> => {
  return await apiGet('/manga/lists');
};
