"use client";

import { useEffect, useState } from "react";
import { limitHomepageItems } from "@/lib/homepageUtils";
import { HOMEPAGE_CAROUSEL_LIMIT } from "@/constants/homepage";
import type { HomepageSeriesCard } from "@/types/homepage";
import { useNsfw } from "@/providers/NsfwProvider";

export function useFilteredCarousel<T extends HomepageSeriesCard>(fetchFn: (filter: string, limit: number) => Promise<T[]>, initialFilter: string) {
  const { revision } = useNsfw();
  const [data, setData] = useState<T[]>([]);
  const [filter, setFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFn(filter, HOMEPAGE_CAROUSEL_LIMIT)
      .then((result) => {
        if (!cancelled) setData(limitHomepageItems(Array.isArray(result) ? result : []));
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, fetchFn, revision]);

  return { data, filter, setFilter, loading };
}
