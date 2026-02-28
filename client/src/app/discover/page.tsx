import { Suspense } from 'react';
import type { Metadata } from "next";
import CatalogContent from './components/CatalogContent';

export const metadata: Metadata = {
  title: `Discover - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Discover your next favorite manga with advanced filters and sorting options.",
  openGraph: {
    title: `Discover - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Explore thousands of manga titles with powerful filtering",
    type: "website",
  },
};

function CatalogInner() {
  const initialFilters = {
    search: '',
    genres: [],
    tags: [],
    sort: 'weightedScore',
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