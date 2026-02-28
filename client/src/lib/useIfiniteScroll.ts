import { useState, useEffect, useCallback, useRef } from 'react';
import { trackSearch, trackFilterApplied } from '@/lib/analytics';

export function useInfiniteScroll(filters: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [meta, setMeta] = useState<any>(null);
  
  // 1. Move cursor to a Ref so it doesn't trigger useCallback re-creations
  const cursorRef = useRef<any>(null); 
  const lastTrackedSearch = useRef<string>('');
  const previousFilters = useRef<any>({});
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current || (!isInitial && !hasMore)) return;
    
    isFetchingRef.current = true;
    setLoading(true);

    try {
      // 2. Use the Ref value here
      const currentCursor = isInitial ? '' : cursorRef.current;
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => { if (v) params.append(key, String(v)) });
        } else if (value !== undefined && value !== null && value !== '') {
          const stringValue = String(value).trim();
          if (key === 'search' && !stringValue) return;
          params.append(key, stringValue);
        }
      });

      params.append('limit', '40');
      if (currentCursor) params.append('cursor', String(currentCursor));

      const response = await fetch(`/api/manga/search?${params.toString()}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      if (data && data.items) {
        setItems(prev => isInitial ? data.items : [...prev, ...data.items]);
        // 3. Update Ref and State
        setHasMore(data.meta?.hasNextPage ?? !!data.nextCursor);
        cursorRef.current = data.nextCursor; 
        
        if (isInitial) {
          setMeta(data.meta);

          if (filters.search && filters.search.length >= 2 && filters.search !== lastTrackedSearch.current) {
            trackSearch(filters.search, data.meta?.total || data.items.length, {
              genres: filters.genres,
              tags: filters.tags,
              types: filters.types,
              statuses: filters.statuses,
              years: filters.years,
              sort: filters.sort,
            });
            lastTrackedSearch.current = filters.search;
          }
          
          Object.keys(filters).forEach(key => {
            if (key === 'search') return;
            
            const currentValue = filters[key];
            const previousValue = previousFilters.current[key];
            
            if (JSON.stringify(currentValue) !== JSON.stringify(previousValue)) {
              if (Array.isArray(currentValue) && currentValue.length === 0) return;
              if (!currentValue || currentValue === '' || currentValue === 'weightedScore') return;
              
              trackFilterApplied(key, currentValue);
            }
          });
          
          previousFilters.current = { ...filters };
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [filters, hasMore]); 

  // Reset logic when filters change
  useEffect(() => {
    setItems([]);
    setHasMore(true);
    cursorRef.current = null; // Reset the ref
    fetchData(true);
  }, [
    filters.search, 
    filters.genres?.sort().join(','), // Added sort to prevent accidental triggers
    filters.tags?.sort().join(','),
    filters.type, 
    filters.status, 
    filters.years?.sort().join(','), 
    filters.sort,
  ]);

  return { items, loading, hasMore, meta, fetchData };
}