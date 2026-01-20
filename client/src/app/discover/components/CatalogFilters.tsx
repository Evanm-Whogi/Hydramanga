'use client';

import { memo } from 'react';
import FiltersPanel from '@/components/FiltersPanel';

interface CatalogFiltersProps {
  filters: {
    search: string;
    genres: string[];
    type: string;
    status: string;
    years: string[];
    sort: string;
    nsfw: string;
  };
  onFilterChange: (filters: Partial<any>) => void;
  params?: any;
}

function CatalogFilters({
  filters,
  onFilterChange,
  params,
}: CatalogFiltersProps) {
  return (
    <section id="catalog-filters" className="py-12">
      <div className="container mx-auto">
        <FiltersPanel
          onSearchChange={(val) => onFilterChange({ search: val })}
          onGenresChange={(val) => onFilterChange({ genres: val })}
          onTypesChange={(val) => onFilterChange({ type: val })}
          onStatusesChange={(val) => onFilterChange({ status: val })}
          onYearsChange={(val) => onFilterChange({ years: val })}
          onSortChange={(val) => onFilterChange({ sort: val })}
          onNsfwChange={(val) => onFilterChange({ nsfw: val })}
          initialSearch={params?.search}
          initialGenres={params?.genres}
          initialTypes={params?.type}
          initialStatuses={params?.status}
          initialYears={params?.years}
          initialSort={params?.sort}
          initialNsfw={params?.nsfw}
        />
      </div>
    </section>
  );
}

export default memo(CatalogFilters);