import { apiGet } from '@/lib/api';

export const AUTHOR_PAGE_SIZE = 24;

export type AuthorSort = 'works' | 'name' | 'newest';

export const AUTHOR_SORT_OPTIONS = [
  { label: 'Works', value: 'works' },
  { label: 'Name', value: 'name' },
  { label: 'Newest', value: 'newest' },
];

export interface AuthorSummary {
  name: string;
  works: number;
  type: string | null;
  previewCovers: string[];
}

export interface AuthorListResponse {
  authors: AuthorSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface AuthorWork {
  id: number;
  title: string;
  cover: unknown;
  type: string | null;
  status: string | null;
  rating: number | null;
  popularityGlobalCurrent?: number | null;
  popularityTypeCurrent?: number | null;
  popularity?: {
    global?: { current?: number | null } | null;
    type?: { current?: number | null } | null;
  } | null;
  views: number | null;
  totalChapters: string | number | null;
  isNew?: boolean;
}

export interface AuthorDetail {
  name: string;
  type: string | null;
  worksCount: number;
  works: AuthorWork[];
}

export async function fetchAuthors(params: { search?: string; letter?: string; sort?: AuthorSort; page?: number; limit?: number }): Promise<AuthorListResponse> {
  const search = new URLSearchParams();
  if (params.search) search.set('search', params.search);
  if (params.letter) search.set('letter', params.letter);
  search.set('sort', params.sort ?? 'works');
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? AUTHOR_PAGE_SIZE));
  return apiGet(`/authors?${search.toString()}`);
}

export async function fetchTopAuthors(limit = 10): Promise<AuthorSummary[]> {
  const data = await apiGet(`/authors/top?limit=${limit}`);
  return data.authors;
}

export async function fetchAuthorDetail(name: string): Promise<AuthorDetail> {
  return apiGet(`/authors/${encodeURIComponent(name)}`);
}
