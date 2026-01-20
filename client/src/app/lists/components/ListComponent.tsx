'use client';

import { useState, useMemo } from 'react';
import SectionHeader from '@/app/home/components/SectionHeader';
import MangaCard from '@/components/MangaCard';
import FiltersPanel from '@/components/FiltersPanel';
import { FILTER_OPTIONS } from '@/constants/filters';

const LIST_OPTIONS = [
  { label: 'All Lists', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Reading', value: 'reading' },
  { label: 'Finished', value: 'finished' },
  { label: 'Dropped', value: 'dropped' },
] as const;

interface ListComponentProps {
  lists: {
    unread: any[];
    reading: any[];
    finished: any[];
    dropped: any[];
  };
}

export default function ListComponent({ lists }: ListComponentProps) {
  const [selectedList, setSelectedList] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedSort, setSelectedSort] = useState('weightedScore');
  const [nsfw, setNsfw] = useState('true');

  const yearMatches = (
    year: number | undefined,
    filters: string[]
  ): boolean => {
    if (!filters || filters.length === 0 || filters.includes('timeless'))
      return true;
    if (year === undefined || year === null) return false;

    return filters.some((f) => {
      if (/^\d{4}$/.test(f)) {
        return year === Number(f);
      }
      const decadeRanges: Record<string, [number, number]> = {
        '2010s': [2010, 2019],
        '2000s': [2000, 2009],
        '1990s': [1990, 1999],
        '1980s': [1980, 1989],
        '1970s': [1970, 1979],
        '1960s': [1960, 1969],
        '1950s': [1950, 1959],
        '1940s': [1940, 1949],
      };
      const range = decadeRanges[f];
      return range ? year >= range[0] && year <= range[1] : true;
    });
  };

  const normalize = (s?: string): string => (s || '').toLowerCase();

  const applyFilters = (items: any[]): any[] => {
    const filtered = items.filter((m) => {
      const titleMatch = normalize(m?.title).includes(normalize(search));
      const genreMatch =
        selectedGenres.length === 0 ||
        (Array.isArray(m?.genres) &&
          selectedGenres.every((g) => m.genres.includes(g)));
      const typeMatch =
        selectedTypes.length === 0 ||
        (m?.type &&
          selectedTypes
            .map((t) => t.toLowerCase())
            .includes(String(m.type).toLowerCase()));
      const statusMatch =
        selectedStatuses.length === 0 ||
        (m?.status && selectedStatuses.includes(m.status));
      const yearMatch = yearMatches(m?.year, selectedYears);
      const nsfwMatch =
        nsfw === 'true' ||
        m?.contentRating === 'safe' ||
        m?.contentRating === 'suggestive';

      return (
        titleMatch &&
        genreMatch &&
        typeMatch &&
        statusMatch &&
        yearMatch &&
        nsfwMatch
      );
    });

    type SortKey = 'weightedScore' | 'totalChapters' | 'lastUpdatedAt' | 'title' | 'year';

    const getSortValue = (
      item: any,
      key: SortKey
    ): number | string | Date | undefined => {
      if (key === 'totalChapters') return Number(item?.totalChapters);
      if (key === 'lastUpdatedAt') return new Date(item?.lastUpdatedAt);
      return item?.[key];
    };

    const sorted = [...filtered].sort((a, b) => {
      const sortKey = selectedSort as SortKey;

      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      // Descending order
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    });

    return sorted;
  };

  const filteredLists = useMemo(
    () => ({
      unread: applyFilters(lists.unread || []),
      reading: applyFilters(lists.reading || []),
      finished: applyFilters(lists.finished || []),
      dropped: applyFilters(lists.dropped || []),
    }),
    [
      lists,
      search,
      selectedGenres,
      selectedTypes,
      selectedStatuses,
      selectedYears,
      selectedSort,
      nsfw,
    ]
  );

  return (
    <section id="lists" className="py-12">
      <div className="container mx-auto text-primary space-y-6">
        <div className="flex flex-col mb-24 gap-4">
          <FiltersPanel
            showListSelector
            listOptions={LIST_OPTIONS as any}
            onListChange={setSelectedList}
            initialList={selectedList}
            onSearchChange={setSearch}
            onGenresChange={setSelectedGenres}
            onTypesChange={setSelectedTypes}
            onStatusesChange={setSelectedStatuses}
            onYearsChange={setSelectedYears}
            onSortChange={setSelectedSort}
            onNsfwChange={setNsfw}
          />
        </div>

        {selectedList === 'all' ? (
          <>
            {/* All Lists View */}
            {(['unread', 'reading', 'finished', 'dropped'] as const).map(
              (listKey) => (
                <div key={listKey}>
                  <SectionHeader
                    title={
                      listKey.charAt(0).toUpperCase() + listKey.slice(1)
                    }
                    subtitle={`(${filteredLists[listKey].length})`}
                    link=""
                    filters=""
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                    {filteredLists[listKey].map((manga: any) => (
                      <MangaCard key={manga.id} manga={manga} />
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        ) : (
          <>
            {/* Individual List View */}
            <div>
              <SectionHeader
                title={
                  selectedList.charAt(0).toUpperCase() + selectedList.slice(1)
                }
                subtitle={`(${filteredLists[selectedList as keyof typeof filteredLists].length})`}
                link=""
                filters=""
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                {filteredLists[selectedList as keyof typeof filteredLists].map(
                  (manga: any) => (
                    <MangaCard key={manga.id} manga={manga} />
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}