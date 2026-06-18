"use client";

import { useCallback, useEffect } from "react";
import HomepageCarouselSection from "@/components/homepage/carousel/HomepageCarouselSection";
import HomepageCarouselItem from "@/components/homepage/carousel/HomepageCarouselItem";
import SeriesGridCard from "@/components/SeriesGridCard";
import DeferredMount from "@/components/DeferredMount";
import { useHomepageUserLists } from "@/hooks/useHomepageUserLists";
import { scheduleCarouselPrefetch } from "@/lib/coverImageCache";
import { getCardCoverUrl } from "@/lib/coverUtils";
import { progressReadHref } from "@/lib/homepageUtils";
import { mangaReadPath } from "@/lib/paths";

export default function HomepageUserCarousels({ userId, onSaveClick }: { userId: string; onSaveClick: (seriesId: number, title: string) => void }) {
  const { continueReading, recentChaptersFromList } = useHomepageUserLists(userId);

  useEffect(() => {
    const urls = [
      ...continueReading.map((progress) => getCardCoverUrl(progress.seriesCover)),
      ...recentChaptersFromList.map((item) => getCardCoverUrl(item.series.cover)),
    ];
    if (urls.length > 0) scheduleCarouselPrefetch(urls);
  }, [continueReading, recentChaptersFromList]);

  if (continueReading.length === 0 && recentChaptersFromList.length === 0) return null;

  return (
    <DeferredMount rootMargin="300px" placeholderClassName="min-h-64">
      {continueReading.length > 0 ? (
        <HomepageCarouselSection title="Continue Reading">
          {continueReading.map((progress) => (
            <HomepageCarouselItem key={`continue-reading-${progress.seriesId}`}>
              <SeriesGridCard
                seriesId={progress.seriesId}
                title={progress.seriesTitle}
                cover={progress.seriesCover}
                href={progressReadHref(progress)}
                onSaveClick={onSaveClick}
              />
            </HomepageCarouselItem>
          ))}
        </HomepageCarouselSection>
      ) : null}

      {recentChaptersFromList.length > 0 ? (
        <div className={continueReading.length > 0 ? "mt-16" : ""}>
          <HomepageCarouselSection title="New Chapters from Your Bookmarks">
            {recentChaptersFromList.map((item) => (
              <HomepageCarouselItem key={`list-chapter-${item.series.id}-${item.chapter.id}`}>
                <SeriesGridCard
                  seriesId={item.series.id}
                  title={item.series.title}
                  cover={item.series.cover}
                  href={mangaReadPath(item.series.id, item.chapter.id)}
                  type={item.series.type}
                  status={item.series.status}
                  rating={item.series.rating}
                  views={item.series.views}
                  totalChapters={item.series.totalChapters}
                  isNew={item.series.isNew}
                  onSaveClick={onSaveClick}
                />
              </HomepageCarouselItem>
            ))}
          </HomepageCarouselSection>
        </div>
      ) : null}
    </DeferredMount>
  );
}
