import { useState, useEffect, useCallback, useRef } from 'react';
import { trackSearch, trackFilterApplied } from '@/lib/analytics';

export function useInfiniteScroll(filters: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const lastTrackedSearch = useRef<string>('');
  const previousFilters = useRef<any>({});
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const currentCursor = isInitial ? '' : cursor;
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => { if (v) params.append(key, String(v)) });
        } else if (value !== undefined && value !== null && value !== '') {
          const stringValue = String(value).trim();
          if (key === 'search' && !stringValue) return;
          if (stringValue || key !== 'search') params.append(key, stringValue);
        }
      });

      params.append('limit', '40');

      if (currentCursor) {
        params.append('cursor', String(currentCursor));
      }

      const response = await fetch(`/api/manga/search?${params.toString()}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      if (data && data.items) {
        setItems(prev => isInitial ? data.items : [...prev, ...data.items]);
        setHasMore(data.meta?.hasMore ?? false);
        setCursor(data.nextCursor);
        if (isInitial) {
          setMeta(data.meta);
          
          if (filters.search && filters.search.length >= 2 && filters.search !== lastTrackedSearch.current) {
            trackSearch(filters.search, data.meta?.total || data.items.length, {
              genres: filters.genres,
              types: filters.types,
              statuses: filters.statuses,
              years: filters.years,
              sort: filters.sort,
              nsfw: filters.nsfw,
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
      setHasMore(false);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [cursor, filters]);

    useEffect(() => {
        setItems([]);
        setCursor(null);
        setHasMore(true);
        fetchData(true);
    }, [filters.search, filters.genres?.join(','), filters.type, filters.status, filters.years?.join(','), filters.sort, filters.nsfw]);

    return { items, loading, hasMore, meta, fetchData };
}