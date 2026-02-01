import { useState, useEffect, useCallback } from 'react';

export function useInfiniteScroll(filters: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (loading) return;
    
    setLoading(true);
    try {
      const currentCursor = isInitial ? '' : cursor;
      const params = new URLSearchParams();

      // Explicitly append filters to handle arrays correctly
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // Append each array item individually for Express/Drizzle to parse as an array
          value.forEach(v => { if (v) params.append(key, String(v)) });
        } else if (value !== undefined && value !== null && value !== '') {
          // Trim search queries to avoid empty results from spaces/symbols only
          const stringValue = String(value).trim();
          if (key === 'search' && !stringValue) return;
          if (stringValue || key !== 'search') params.append(key, stringValue);
        }
      });

      // Add pagination params
      params.append('limit', '40');

      if (currentCursor) {
          // If your cursor contains a pipe (e.g., "date|id"), handle the date part
          if (typeof currentCursor === 'string' && currentCursor.includes('|')) {
              const [datePart, idPart] = currentCursor.split('|');
              const formattedDate = !isNaN(Date.parse(datePart)) 
                  ? new Date(datePart).toISOString() 
                  : datePart;
              
              params.append('cursor', `${formattedDate}|${idPart}`);
          } else {
              params.append('cursor', String(currentCursor));
          }
      }


      const response = await fetch(`/api/manga/search?${params.toString()}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

    if (data && data.items) {
        setItems(prev => isInitial ? data.items : [...prev, ...data.items]);
        setHasMore(data.meta?.hasMore ?? false); // Defensive check
        setCursor(data.nextCursor);
        if (isInitial) setMeta(data.meta);
    }
    } catch (err) {
      console.error("Fetch error:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [cursor, filters, loading]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    fetchData(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]); 

  return { items, loading, hasMore, meta, fetchData };
}