'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  rectIntersection
} from '@dnd-kit/core';
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { addToList } from '@/services/listService';
import { GripVertical } from 'lucide-react';
import SectionHeader from '@/app/home/components/SectionHeader';
import MangaCard from '@/components/MangaCard';
import FiltersPanel from '@/components/FiltersPanel';
import { FILTER_OPTIONS } from '@/constants/filters';
import { UserList } from '@/services/listService';
import { toast } from 'react-toastify';

interface ListComponentProps {
  lists: {
    lists?: UserList[];
    [key: string]: any;
  };
  onUpdate?: () => void;
}

export default function ListComponent({ lists: listsData, onUpdate }: ListComponentProps) {
    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );
    const [activeManga, setActiveManga] = useState<any | null>(null);
    const [draggingMangaId, setDraggingMangaId] = useState<string | null>(null);
  // Guard against undefined props so the page renders safely while data loads
  const safeListsData = listsData || { lists: [] };
  const userLists = safeListsData.lists || [];
  
  // Build list options from user's lists (all lists)
  const LIST_OPTIONS = useMemo(() => {
    const options = [{ label: 'All Lists', value: 'all' }];
    
    userLists
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach(list => {
        options.push({
          label: list.name,
          value: list.slug,
        });
      });
    
    return options;
  }, [userLists]);

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

  // Build filtered lists dynamically based on user lists
  const filteredLists = useMemo(() => {
    const result: Record<string, any[]> = {};
    
    userLists.forEach(list => {
      const items = safeListsData[list.slug] || [];
      result[list.slug] = applyFilters(items);
    });
    
    return result;
  }, [
    safeListsData,
    userLists,
    search,
    selectedGenres,
    selectedTypes,
    selectedStatuses,
    selectedYears,
    selectedSort,
    nsfw,
  ]);

  // Get visible lists in sorted order, filtered by selectedList
  const visibleLists = useMemo(() => {
    let filtered = userLists
      .filter((l) => l.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    
    // If a specific list is selected (not 'all'), filter to just that list
    if (selectedList !== 'all') {
      filtered = filtered.filter((l) => l.slug === selectedList);
    }
    
    return filtered;
  }, [userLists, selectedList]);

  // Drag-and-drop handlers
  const handleDragStart = (event: any) => {
    const { active } = event;
    setDraggingMangaId(active.id);
    // Find manga object by id
    for (const list of visibleLists) {
      const manga = (filteredLists[list.slug] || []).find((m: any) => String(m.id) === String(active.id));
      if (manga) {
        setActiveManga(manga);
        break;
      }
    }
  };

    const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setDraggingMangaId(null);
    setActiveManga(null);
    if (!over || !active) return;
    const fromList = visibleLists.find((list) => (filteredLists[list.slug] || []).some((m: any) => String(m.id) === String(active.id)));
    const toList = visibleLists.find((list) => String(list.id) === String(over.id));
    if (!fromList || !toList || fromList.id === toList.id) return;
    try {
      await addToList(toList.id, Number(active.id));
      if (onUpdate) onUpdate();
      toast.success(`Manga moved to "${toList.name}"`);
    } catch (err) {
      toast.error('Failed to move manga');
    }
  };

  function DraggableMangaCard({ manga }: { manga: any }) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: manga.id });
    // Remove aria-describedby from attributes to prevent hydration mismatch
    const { 'aria-describedby': _ariaDescribedBy, ...safeAttributes } = attributes;
    return (
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 10 : undefined,
          opacity: isDragging ? 0.5 : 1,
          position: 'relative',
        }}
      >
        <button
          type="button"
          aria-label="Drag to reorder"
          className="absolute top-2 left-2 z-20 btn btn-ghost btn-xs cursor-grab px-4 py-2 text-white bg-background/70 rounded-md hover:bg-background/90"
          {...safeAttributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <MangaCard manga={manga} />
      </div>
    );
  }

  function DroppableList({ list, children }: { list: any; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id: String(list.id) });
    return (
      <div
        ref={setNodeRef}
        id={`droppable-list-${list.id}`}
        style={{ minHeight: 80, background: isOver ? '#e0e7ff' : undefined }}
        className="bg-base-200 rounded-lg p-4 mb-2 transition-colors"
        data-list-id={list.id}
      >
        {children}
      </div>
    );
  }

  return (
    <section id="lists" className="py-6">
      <div className="container mx-auto text-primary space-y-6">
        <div className="flex flex-col mb-12 gap-4">
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
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-8">
            {visibleLists.map((list) => (
              <DroppableList key={list.id} list={list}>
                <SectionHeader
                  title={list.name}
                  subtitle={`(${filteredLists[list.slug]?.length || 0})`}
                  link=""
                  filters=""
                />
                <SortableContext items={(filteredLists[list.slug] || []).map((m: any) => m.id)} strategy={verticalListSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                    {(filteredLists[list.slug] || []).map((manga: any) => (
                      <DraggableMangaCard key={manga.id} manga={manga} />
                    ))}
                  </div>
                </SortableContext>
              </DroppableList>
            ))}
          </div>
          <DragOverlay>
            {activeManga ? <MangaCard manga={activeManga} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}