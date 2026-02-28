'use client';

import { memo } from 'react';
import FiltersPanel from '@/components/FiltersPanel';

interface CatalogFiltersProps {
  filters: {
    search: string;
    genres: string[];
    tags: string[];
    type: string;
    status: string;
    years: string[];
    sort: string;
    nsfw: string;
  };
  onFilterChange: (filters: Partial<any>) => void;
  params?: any;
  availableTags?: string[];
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function CatalogFilters({ filters, onFilterChange, params, availableTags = [] }: CatalogFiltersProps) {
  return (
    <section id="catalog-filters" className="py-12">
      <div className="container mx-auto">
        <FiltersPanel
          onSearchChange={(val: string) => onFilterChange({ search: val })}
          onGenresChange={(val: string[]) => onFilterChange({ genres: val })}
          onTagsChange={(val: string[]) => onFilterChange({ tags: val })}
          onTypesChange={(val: string[]) => onFilterChange({ type: val })}
          onStatusesChange={(val: string[]) => onFilterChange({ status: val })}
          onYearsChange={(val: string[]) => onFilterChange({ years: val })}
          onSortChange={(val: string) => onFilterChange({ sort: val })}
          onNsfwChange={(val: string) => onFilterChange({ nsfw: val })}
          initialSearch={params?.search}
          initialGenres={params?.genres}
          initialTags={params?.tags}
          initialTypes={toArray(params?.type)}
          initialStatuses={toArray(params?.status)}
          initialYears={params?.years}
          initialSort={params?.sort}
          initialNsfw={params?.nsfw}
          tagOptions={availableTags}
        />
      </div>
    </section>
  );
}

export default memo(CatalogFilters);