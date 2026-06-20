"use client";

import { useEffect, useState } from "react";
import * as homeService from "@/services/homeService";
import { limitHomepageItems } from "@/lib/homepageUtils";
import { HOMEPAGE_CAROUSEL_LIMIT } from "@/constants/homepage";
import type { HomepageListChapterItem, HomepageReadingProgress } from "@/types/homepage";
import { useNsfw } from "@/providers/NsfwProvider";

export function useHomepageUserLists(userId: string | undefined) {
  const { revision } = useNsfw();
  const [continueReading, setContinueReading] = useState<HomepageReadingProgress[]>([]);
  const [recentChaptersFromList, setRecentChaptersFromList] = useState<HomepageListChapterItem[]>([]);

  useEffect(() => {
    if (!userId) {
      setContinueReading([]);
      setRecentChaptersFromList([]);
      return;
    }
    homeService.getRecentlyRead(HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => setContinueReading(limitHomepageItems(data?.progress ?? [])))
      .catch(() => setContinueReading([]));
    homeService.getRecentChaptersFromUserList(HOMEPAGE_CAROUSEL_LIMIT)
      .then((data) => setRecentChaptersFromList(limitHomepageItems(data ?? [])))
      .catch(() => setRecentChaptersFromList([]));
  }, [userId, revision]);

  return { continueReading, recentChaptersFromList };
}
