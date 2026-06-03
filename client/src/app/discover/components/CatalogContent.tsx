'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS } from '@/constants/filters';
import {blockDiscoverUrlSync, replaceDiscoverUrl, unblockDiscoverUrlSync} from '@/lib/discoverUrlSync';
import PageHeader from '@/components/PageHeader';
import CatalogFilters from './CatalogFilters';
import MangaList from './MangaList';
import { getAllTags } from '@/services/mangaService';
import { getSettings } from '@/services/userService';
import { useUser } from '@/providers/UserProvider';
import { Shield } from 'lucide-react';

interface Filters {
  search: string;
  genres: string[];
  tags: string[];
  type: string;
  status: string;
  years: string[];
  sort: string;
}

interface CatalogContentProps {
  initialFilters?: Partial<Filters>;
}

function buildSearchParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.genres?.length) params.set('genres', f.genres.join(','));
  if (f.tags?.length) params.set('tags', f.tags.join(','));
  if (f.type) params.set('type', Array.isArray(f.type) ? f.type.join(',') : f.type);
  if (f.status) params.set('status', Array.isArray(f.status) ? f.status.join(',') : f.status);
  if (f.years?.length) params.set('years', f.years.join(','));
  if (f.sort && f.sort !== DEFAULT_FILTERS.sort) params.set('sort', f.sort);
  return params;
}

function filtersFromSearchParams(searchParams: URLSearchParams): Filters {
  return {
    search: searchParams.get('search') || DEFAULT_FILTERS.search,
    genres: searchParams.get('genres')?.split(',').filter(Boolean) || DEFAULT_FILTERS.genres,
    tags: searchParams.get('tags')?.split(',').filter(Boolean) || DEFAULT_FILTERS.tags,
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
    years: searchParams.get('years')?.split(',').filter(Boolean) || DEFAULT_FILTERS.years,
    sort: searchParams.get('sort') || DEFAULT_FILTERS.sort,
  };
}

export default function CatalogContent({ initialFilters: _initialFilters }: CatalogContentProps) {
  const searchParams = useSearchParams()!;
  const { user } = useUser();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFiltersRef = useRef<Partial<Filters>>({});
  const filtersRef = useRef<Filters>({
    search: '',
    genres: [],
    tags: [],
    type: '',
    status: '',
    years: [],
    sort: DEFAULT_FILTERS.sort,
  });

  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromSearchParams(searchParams)
  );
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [hideNsfw, setHideNsfw] = useState<boolean | null>(null);

  filtersRef.current = filters;

  const clearUrlSyncTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const beginMangaNavigation = useCallback(() => {
    blockDiscoverUrlSync();
    clearUrlSyncTimer();
    pendingFiltersRef.current = {};
  }, [clearUrlSyncTimer]);

  const updateFilters = useCallback((newFilters: Partial<Filters>) => {
    pendingFiltersRef.current = { ...pendingFiltersRef.current, ...newFilters };

    clearUrlSyncTimer();

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const next = { ...pendingFiltersRef.current };
      pendingFiltersRef.current = {};
      const merged = { ...filtersRef.current, ...next };
      setFilters(merged);
      const qs = buildSearchParams(merged).toString();
      replaceDiscoverUrl(qs ? `/discover?${qs}` : '/discover');
    }, 300);
  }, [clearUrlSyncTimer]);

  useEffect(() => {
    unblockDiscoverUrlSync();
    return () => {
      clearUrlSyncTimer();
      unblockDiscoverUrlSync();
    };
  }, [clearUrlSyncTimer]);

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname !== '/discover') return;
      setFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTags = async () => {
      try {
        const response = await getAllTags();
        if (isMounted) {
          setAvailableTags(response.tags || []);
        }
      } catch (error) {
        if (isMounted) {
          setAvailableTags([]);
        }
      }
    };

    loadTags();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHideNsfw(false);
      return;
    }
    getSettings().then((s) => setHideNsfw(s.hideNsfw)).catch(() => setHideNsfw(false));
  }, [user]);

  return (
    <>
      <PageHeader
        title="Discover"
        description="Discover your next favorite: Manga"
        notice={hideNsfw === true ? (
          <div className="flex items-center gap-2 text-sm text-primary pt-2">
            <Shield className="size-4 shrink-0 text-accent" aria-hidden />
            <span>NSFW content is hidden.</span>
            <Link href="/users/me?tab=settings" className="font-medium text-accent hover:underline underline-offset-2">
              Change in Settings
            </Link>
          </div>
        ) : undefined}
      />
      <CatalogFilters filters={filters} onFilterChange={updateFilters} params={filters} availableTags={availableTags} />
      <MangaList filters={filters} onMangaNavigate={beginMangaNavigation} />
    </>
  );
}
