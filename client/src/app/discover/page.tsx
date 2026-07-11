import { Suspense } from 'react';
import type { Metadata } from "next";
import CatalogContent from './components/CatalogContent';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Discover',
  description: 'Discover your next favorite manga, manhwa, and manhua with advanced filters, genres, tags, and sorting.',
  path: '/discover',
});

function CatalogInner() {
  const initialFilters = {
    search: '',
    genres: [],
    tags: [],
    sort: 'mostPopular',
    type: '',
    status: '',
  };

  return <CatalogContent initialFilters={initialFilters} />;
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading filters...</div>}>
      <CatalogInner />
    </Suspense>
  );
}