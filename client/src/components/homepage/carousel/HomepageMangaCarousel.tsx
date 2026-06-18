"use client";

import { useEffect, type ReactNode } from "react";
import HomepageCarouselSection from "@/components/homepage/carousel/HomepageCarouselSection";
import HomepageCarouselItem from "@/components/homepage/carousel/HomepageCarouselItem";
import SeriesGridCard from "@/components/SeriesGridCard";
import { scheduleCarouselPrefetch } from "@/lib/coverImageCache";
import { getCardCoverUrl } from "@/lib/coverUtils";
import type { HomepageSeriesCard } from "@/types/homepage";

export default function HomepageMangaCarousel({ title, items, loading, headerTrailing, onSaveClick, getHref, scrollResetKey }: {
  title: string;
  items: HomepageSeriesCard[];
  loading?: boolean;
  headerTrailing?: ReactNode;
  onSaveClick: (seriesId: number, title: string) => void;
  getHref: (item: HomepageSeriesCard) => string;
  scrollResetKey?: string | number;
}) {
  useEffect(() => {
    if (items.length === 0) return;
    scheduleCarouselPrefetch(items.map((item) => getCardCoverUrl(item.cover)));
  }, [items]);

  return (
    <HomepageCarouselSection title={title} loading={loading} headerTrailing={headerTrailing} scrollResetKey={scrollResetKey}>
      {items.map((item) => (
        <HomepageCarouselItem key={item.id}>
          <SeriesGridCard
            seriesId={item.id}
            title={item.title}
            cover={item.cover}
            href={getHref(item)}
            type={item.type}
            status={item.status}
            rating={item.rating}
            views={item.views}
            totalChapters={item.totalChapters}
            isNew={item.isNew}
            onSaveClick={onSaveClick}
          />
        </HomepageCarouselItem>
      ))}
    </HomepageCarouselSection>
  );
}
