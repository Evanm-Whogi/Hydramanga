import { apiPost, apiGet, apiDelete } from '@/lib/api';

// Add a bookmark to a specific chapter
export async function addBookmark(seriesId: number, chapterId: number, note?: string): Promise<any> {
  return await apiPost(`/manga/${seriesId}/chapter/${chapterId}/bookmark`, {note});
}

// Remove a bookmark from a specific chapter
export async function removeBookmark(seriesId: number, chapterId: number): Promise<any> {
  return await apiDelete(`/manga/${seriesId}/chapter/${chapterId}/bookmark`);
}

// Get all bookmarks for a specific series
export async function getSeriesBookmarks(seriesId: number): Promise<any> {
  return await apiGet(`/manga/${seriesId}/bookmarks`);
}

// Get a bookmark for a specific chapter
export async function getBookmark(seriesId: number, chapterId: number): Promise<any> {
  return await apiGet(`/manga/${seriesId}/chapter/${chapterId}/bookmark`);
}
