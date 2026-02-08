'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS } from '@/constants/filters';
import PageHeader from '@/components/PageHeader';
import CatalogFilters from './CatalogFilters';
import MangaList from './MangaList';

interface Filters {
  search: string;
  genres: string[];
  type: string;
  status: string;
  years: string[];
  sort: string;
  nsfw: string;
}

interface CatalogContentProps {
  initialFilters?: Partial<Filters>;
}

export default function CatalogContent({ initialFilters }: CatalogContentProps) {
  const searchParams = useSearchParams()!;
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFiltersRef = useRef<Partial<Filters>>({});

  const [filters, setFilters] = useState<Filters>(() => ({
    search: searchParams.get('search') || DEFAULT_FILTERS.search,
    genres: searchParams.get('genres')?.split(',').filter(Boolean) || DEFAULT_FILTERS.genres,
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
    years: searchParams.get('years')?.split(',').filter(Boolean) || DEFAULT_FILTERS.years,
    sort: searchParams.get('sort') || DEFAULT_FILTERS.sort,
    nsfw: searchParams.get('nsfw') || DEFAULT_FILTERS.nsfw,
  }));

  const updateFilters = useCallback((newFilters: Partial<Filters>) => {
    pendingFiltersRef.current = { ...pendingFiltersRef.current, ...newFilters };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, ...pendingFiltersRef.current }));
      pendingFiltersRef.current = {};
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <PageHeader title="Discover" description="Discover your next favorite: Manga" />
      <CatalogFilters filters={filters} onFilterChange={updateFilters} params={filters} />
      <MangaList filters={filters} />
    </>
  );
}
