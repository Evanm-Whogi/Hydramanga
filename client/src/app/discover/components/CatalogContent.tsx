'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import CatalogFilters from './CatalogFilters';
import MangaList from './MangaList';
import { DEFAULT_FILTERS } from '@/constants/filters';

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
  const searchParams = (useSearchParams())!;

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
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const filterParams = useMemo(
    () => ({
      search: filters.search,
      genres: filters.genres,
      type: filters.type,
      status: filters.status,
      years: filters.years,
      sort: filters.sort,
      nsfw: filters.nsfw,
    }),
    [filters]
  );

  return (
    <>
      <PageHeader
        title="Discover"
        description="Discover your next favorite: Manga"
      />
      <div className="my-4 bg-foreground p-4 rounded-md text-center border-accent border w-full md:w-1/2 mx-auto">
        <p className="text-sm">
          Please Note: Hentai is currently disabled while in Alpha
        </p>
      </div>
      <CatalogFilters
        filters={filterParams}
        onFilterChange={updateFilters}
        params={filterParams}
      />
      <MangaList filters={filterParams} />
    </>
  );
}
