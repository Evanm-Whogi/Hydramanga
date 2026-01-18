'use client'

import PageHeader from '@/components/PageHeader';
import CatalogFilters from './components/CatalogFilters';
import MangaList from './components/MangaList';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function CatalogInner() {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    genres: searchParams.get('genres')?.split(',').filter(Boolean) || [],
    sort: searchParams.get('sort') || 'weightedScore',
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
    nsfw: searchParams.get('nsfw') || 'true'
  });

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
      <PageHeader title="Discover" description="Discover your next favorite: Manga"/>
      <div className="my-4 bg-foreground p-4 rounded-md text-center border-accent border w-full md:w-1/2 mx-auto">
        <h1>Please Note: Hentai is currently disabled while in Alpha</h1>
      </div>
      <CatalogFilters filters={filters} onFilterChange={updateFilters} />
      <MangaList filters={filters} />
    </>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading filters...</div>}>
      <CatalogInner />
    </Suspense>
  );
}