'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEFAULT_FILTERS } from '@/constants/filters';
import PageHeader from '@/components/PageHeader';
import CatalogFilters from './CatalogFilters';
import MangaList from './MangaList';
import { getAllTags } from '@/services/mangaService';

interface Filters {
  search: string;
  genres: string[];
  tags: string[];
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
    tags: searchParams.get('tags')?.split(',').filter(Boolean) || DEFAULT_FILTERS.tags,
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
    years: searchParams.get('years')?.split(',').filter(Boolean) || DEFAULT_FILTERS.years,
    sort: searchParams.get('sort') || DEFAULT_FILTERS.sort,
    nsfw: searchParams.get('nsfw') || DEFAULT_FILTERS.nsfw,
  }));
  const [availableTags, setAvailableTags] = useState<string[]>([]);

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

  return (
    <>
      <PageHeader title="Discover" description="Discover your next favorite: Manga" />
      <CatalogFilters filters={filters} onFilterChange={updateFilters} params={filters} availableTags={availableTags} />
      <MangaList filters={filters} />
    </>
  );
}
