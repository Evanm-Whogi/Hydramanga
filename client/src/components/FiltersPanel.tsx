'use client'

import { memo, useState, useCallback } from 'react';
import MultiDropdown from '@/components/Checkbox';
import SingleDropdown from '@/components/Dropdown';
import SearchBar from '@/components/SearchBar';
import { FILTER_OPTIONS, DEFAULT_NSFW_VALUE } from '@/constants/filters';

interface FiltersPanelProps {
  onSearchChange: (search: string) => void;
  onGenresChange: (genres: string[]) => void;
  onTypesChange: (types: string[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onYearsChange: (years: string[]) => void;
  onSortChange: (sort: string) => void;
  onNsfwChange: (nsfw: string) => void;
  initialSearch?: string;
  initialGenres?: string[];
  initialTypes?: string[];
  initialStatuses?: string[];
  initialYears?: string[];
  initialSort?: string;
  initialNsfw?: string;
  showListSelector?: boolean;
  listOptions?: Array<{ label: string; value: string }>;
  onListChange?: (list: string) => void;
  initialList?: string;
}

function FiltersPanel({
  onSearchChange,
  onGenresChange,
  onTypesChange,
  onStatusesChange,
  onYearsChange,
  onSortChange,
  onNsfwChange,
  initialSearch = '',
  initialGenres = [],
  initialTypes = [],
  initialStatuses = [],
  initialYears = [],
  initialSort = 'weightedScore',
  initialNsfw = DEFAULT_NSFW_VALUE,
  showListSelector = false,
  listOptions = [],
  onListChange,
  initialList,
}: FiltersPanelProps) {
  const [nsfw, setNsfw] = useState<string>(initialNsfw);

  const handleNsfwToggle = useCallback(() => {
    const newValue = nsfw === 'true' ? 'false' : 'true';
    setNsfw(newValue);
    onNsfwChange(newValue);
  }, [nsfw, onNsfwChange]);

  const isNsfwEnabled = nsfw === 'true';
  const nsfwButtonClass = isNsfwEnabled
    ? 'bg-accent text-white hover:bg-accent/80'
    : 'bg-foreground text-muted hover:bg-foreground/70';

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex gap-6 items-end flex-wrap">        
        {showListSelector && listOptions.length > 0 && (
          <div className="w-40">
            <SingleDropdown
              options={listOptions as any}
              onChange={(list) => onListChange?.(list)}
              size="w-full"
            />
          </div>
        )}        
        <div className="flex-1 min-w-50">
          <SearchBar onChange={onSearchChange} size="w-full" />
        </div>
        <button
          onClick={handleNsfwToggle}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${nsfwButtonClass}`}
          aria-label={`Toggle NSFW content - currently ${isNsfwEnabled ? 'enabled' : 'disabled'}`}
        >
          NSFW: {isNsfwEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 justify-between items-center gap-6">
        <MultiDropdown
          label="All genres"
          options={FILTER_OPTIONS.genres as any}
          onChange={onGenresChange}
          size="w-full"
        />
        <SingleDropdown
          options={FILTER_OPTIONS.sort as any}
          onChange={onSortChange}
          size="w-full"
        />
        <MultiDropdown
          label="All formats"
          options={FILTER_OPTIONS.types as any}
          onChange={onTypesChange}
          size="w-full"
        />
        <MultiDropdown
          label="All statuses"
          options={FILTER_OPTIONS.status as any}
          onChange={onStatusesChange}
          size="w-full"
        />
        <MultiDropdown
          label="Timeless"
          options={FILTER_OPTIONS.years as any}
          onChange={onYearsChange}
          size="w-full"
        />
      </div>
    </div>
  );
}

export default memo(FiltersPanel);
