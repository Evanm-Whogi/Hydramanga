'use client'

import PageHeader from '@/components/PageHeader';
import CatalogFilters from './components/CatalogFilters';
import MangaList from './components/MangaList';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Catalog() {
  const searchParams = useSearchParams();

const [filters, setFilters] = useState({
        search: searchParams.get('search') || '',
        genres: searchParams.get('genres')?.split(',').filter(Boolean) || [],
        sort: searchParams.get('sort') || 'weightedScore',
        type: searchParams.get('type') || '',
        status: searchParams.get('status') || '',
        nsfw: searchParams.get('nsfw') || 'false'
    });

    useEffect(() => {
        setFilters({
            search: searchParams.get('search') || '',
            genres: searchParams.get('genres')?.split(',').filter(Boolean) || [],
            sort: searchParams.get('sort') || 'weightedScore',
            type: searchParams.get('type') || '',
            status: searchParams.get('status') || '',
            nsfw: searchParams.get('nsfw') || 'false'
        });
    }, [searchParams]);

    const updateFilters = (newFilters: any) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

  return (
    <>
      <PageHeader title="Discover" description="Discover your next favorite: Manga"/>
      <CatalogFilters filters={filters} onFilterChange={updateFilters} />
      <MangaList filters={filters} />
    </>
  );
}