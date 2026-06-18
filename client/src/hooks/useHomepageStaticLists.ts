"use client";

import { useEffect, useState } from "react";
import * as homeService from "@/services/homeService";
import { limitHomepageItems } from "@/lib/homepageUtils";
import { HOMEPAGE_CAROUSEL_LIMIT, HOMEPAGE_TRENDING_PERIOD } from "@/constants/homepage";
import type { HomepageSeriesCard } from "@/types/homepage";
import { useUser } from "@/providers/UserProvider";

export function useHomepageStaticLists() {
  const { user } = useUser();
  const userId = user?.id;
  const [trending, setTrending] = useState<HomepageSeriesCard[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = useState<HomepageSeriesCard[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loadingUpdated, setLoadingUpdated] = useState(false);

  useEffect(() => {
    setLoadingTrending(true);
    homeService.getTrendingManga(HOMEPAGE_TRENDING_PERIOD, HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => setTrending(limitHomepageItems(data as HomepageSeriesCard[])))
      .catch(() => setTrending([]))
      .finally(() => setLoadingTrending(false));
  }, [userId]);

  useEffect(() => {
    setLoadingUpdated(true);
    homeService.getRecentlyUpdated("all", HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => setRecentlyUpdated(limitHomepageItems(data as HomepageSeriesCard[])))
      .catch(() => setRecentlyUpdated([]))
      .finally(() => setLoadingUpdated(false));
  }, [userId]);

  return { trending, recentlyUpdated, loadingTrending, loadingUpdated };
}
