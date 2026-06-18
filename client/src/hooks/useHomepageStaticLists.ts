"use client";

import { useEffect, useState } from "react";
import * as homeService from "@/services/homeService";
import { limitHomepageItems } from "@/lib/homepageUtils";
import { HOMEPAGE_CAROUSEL_LIMIT, HOMEPAGE_TRENDING_PERIOD } from "@/constants/homepage";
import type { HomepageSeriesCard } from "@/types/homepage";

export function useHomepageStaticLists() {
  const [trending, setTrending] = useState<HomepageSeriesCard[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = useState<HomepageSeriesCard[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loadingUpdated, setLoadingUpdated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrending(true);
    homeService.getTrendingManga(HOMEPAGE_TRENDING_PERIOD, HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => { if (!cancelled) setTrending(limitHomepageItems(data as HomepageSeriesCard[])); })
      .catch(() => { if (!cancelled) setTrending([]); })
      .finally(() => { if (!cancelled) setLoadingTrending(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingUpdated(true);
    homeService.getRecentlyUpdated("all", HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => { if (!cancelled) setRecentlyUpdated(limitHomepageItems(data as HomepageSeriesCard[])); })
      .catch(() => { if (!cancelled) setRecentlyUpdated([]); })
      .finally(() => { if (!cancelled) setLoadingUpdated(false); });
    return () => { cancelled = true; };
  }, []);

  return { trending, recentlyUpdated, loadingTrending, loadingUpdated };
}
