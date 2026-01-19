'use client'

import PageHeader from '@/components/PageHeader';
import CatalogFilters from './CatalogFilters';
import MangaList from './MangaList';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface CatalogContentProps {
  initialFilters: {
    search: string;
    genres: string[];
    sort: string;
    type: string;
    status: string;
    nsfw: string;
  };
}

export default function CatalogContent({ initialFilters }: CatalogContentProps) {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState(initialFilters);

  useEffect(() => {
    setFilters({
      search: searchParams.get('search') || '',
      genres: searchParams.get('genres')?.split(',').filter(Boolean) || [],
      sort: searchParams.get('sort') || 'weightedScore',
      type: searchParams.get('type') || '',
      status: searchParams.get('status') || '',
      nsfw: searchParams.get('nsfw') || 'true'
    });
  }, [searchParams]);

  const updateFilters = (newFilters: any) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  return (
    <>
      <PageHeader title="Discover" description="Discover your next favorite: Manga" />
      <div className="my-4 bg-foreground p-4 rounded-md text-center border-accent border w-full md:w-1/2 mx-auto">
        <h1>Please Note: Hentai is currently disabled while in Alpha</h1>
      </div>
      <CatalogFilters filters={filters} onFilterChange={updateFilters} />
      <MangaList filters={filters} />
    </>
  );
}
