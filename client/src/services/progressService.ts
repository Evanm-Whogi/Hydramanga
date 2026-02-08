import { apiGet } from '@/lib/api';

export interface MangaImportProgress {
  seriesId: number;
  totalChapters: number;
  downloadedChapters: number;
  status: 'scanning' | 'downloading' | 'completed' | 'failed';
  percentage: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  lastDownloadedChapter?: {
    id?: number;
    chapterNumber: string;
    title: string;
    pageCount: number;
    createdAt?: string;
    updatedAt?: string;
  } | null;
}

// Get current progress for a manga import (polling fallback)
export async function getMangaProgress(mangaId: number): Promise<MangaImportProgress | null> {
  try {
    return await apiGet(`/manga/progress/${mangaId}`);
  } catch (error: any) {
    return null;
  }
}
