'use client';

import { memo } from 'react';
import { FILTER_OPTIONS } from '@/constants/filters';
import MultiDropdown from '@/components/Checkbox';
import SingleDropdown from '@/components/Dropdown';
import SearchBar from '@/components/SearchBar';
import TagDropdown from '@/components/TagDropdown';

interface FiltersPanelProps {
  onSearchChange: (search: string) => void;
  onGenresChange: (genres: string[]) => void;
  onTagsChange: (tags: string[]) => void;
  onTypesChange: (types: string[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onYearsChange: (years: string[]) => void;
  onSortChange: (sort: string) => void;
  initialSearch?: string;
  initialGenres?: string[];
  initialTags?: string[];
  initialTypes?: string[];
  initialStatuses?: string[];
  initialYears?: string[];
  initialSort?: string;
  tagOptions?: string[];
  showListSelector?: boolean;
  listOptions?: Array<{ label: string; value: string }>;
  onListChange?: (list: string) => void;
  initialList?: string;
}

function FiltersPanel({
  onSearchChange,
  onGenresChange,
  onTagsChange,
  onTypesChange,
  onStatusesChange,
  onYearsChange,
  onSortChange,
  initialSearch = '',
  initialGenres = [],
  initialTags = [],
  initialTypes = [],
  initialStatuses = [],
  initialYears = [],
  initialSort = 'weightedScore',
  tagOptions = [],
  showListSelector = false,
  listOptions = [],
  onListChange,
  initialList,
}: FiltersPanelProps) {
  return (
    <div className="flex flex-col gap-2 md:gap-3 w-full">
      <div className="flex gap-6 items-end flex-wrap">
        {showListSelector && listOptions.length > 0 && (
          <div className="w-40">
            <SingleDropdown options={listOptions as any} onChange={(list) => onListChange?.(list)} size="w-full" />
          </div>
        )}
        <div className="flex-1 min-w-50">
          <SearchBar onChange={onSearchChange} initialValue={initialSearch} size="w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6 justify-between items-center gap-3 md:gap-6">
        <MultiDropdown label="All genres" options={FILTER_OPTIONS.genres as any} onChange={onGenresChange} initialValue={initialGenres} size="w-full" showSearch searchPlaceholder="Search genres..." sortAlphabetically />
        <TagDropdown label="All tags" options={tagOptions} onChange={onTagsChange} initialValue={initialTags} size="w-full" />
        <SingleDropdown options={FILTER_OPTIONS.sort as any} onChange={onSortChange} initialValue={initialSort} size="w-full" />
        <MultiDropdown label="All formats" options={FILTER_OPTIONS.types as any} onChange={onTypesChange} initialValue={initialTypes} size="w-full" />
        <MultiDropdown label="All statuses" options={FILTER_OPTIONS.status as any} onChange={onStatusesChange} initialValue={initialStatuses} size="w-full" />
        <MultiDropdown label="Timeless" options={FILTER_OPTIONS.years as any} onChange={onYearsChange} initialValue={initialYears} size="w-full" />
      </div>
    </div>
  );
}

export default memo(FiltersPanel);
