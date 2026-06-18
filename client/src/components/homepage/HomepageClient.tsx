"use client";

import { useCallback, useState } from "react";
import HomepageMangaCarousel from "@/components/homepage/carousel/HomepageMangaCarousel";
import HomepageUserCarousels from "@/components/homepage/HomepageUserCarousels";
import DeferredMount from "@/components/DeferredMount";
import HomepageCommunitySection from "@/components/homepage/community/HomepageCommunitySection";
import HomepageCommunityCta from "@/components/homepage/community/HomepageCommunityCta";
import SeriesBookmarkModal from "@/components/SeriesBookmarkModal";
import HomepageFilterButtons from "@/components/homepage/filters/HomepageFilterButtons";
import { HOMEPAGE_PERIOD_OPTIONS, HOMEPAGE_TYPE_OPTIONS } from "@/constants/homepage";
import { useFilteredCarousel } from "@/hooks/useFilteredCarousel";
import { useHomepageStaticLists } from "@/hooks/useHomepageStaticLists";
import { seriesCardHref } from "@/lib/homepageUtils";
import type { HomepageMangaType, HomepagePeriod, HomepageSaveTarget } from "@/types/homepage";
import { useUser } from "@/providers/UserProvider";
import * as homeService from "@/services/homeService";

export default function HomepageClient() {
  const { user } = useUser();
  const userId = user?.id;
  const [saveTarget, setSaveTarget] = useState<HomepageSaveTarget | null>(null);

  const { trending, recentlyUpdated, loadingTrending, loadingUpdated } = useHomepageStaticLists();

  const fetchPopularManga = useCallback((period: string, limit: number) => homeService.getPopularManga(period, limit), []);
  const fetchTopRated = useCallback((type: string, limit: number) => homeService.getHighScores(type, limit), []);

  const { data: popularManga, filter: popularPeriod, setFilter: setPopularPeriod, loading: loadingPopular } = useFilteredCarousel(fetchPopularManga, "month");
  const { data: topRated, filter: topRatedType, setFilter: setTopRatedType, loading: loadingTopRated } = useFilteredCarousel(fetchTopRated, "all");

  const openSaveModal = useCallback((seriesId: number, title: string) => setSaveTarget({ seriesId, title }), []);

  return (
    <section id="homepage-lists" className="pb-25">
      <div className="container mx-auto mt-10 space-y-16 text-primary md:mt-0">
        {userId ? <HomepageUserCarousels userId={userId} onSaveClick={openSaveModal} /> : null}

        <HomepageMangaCarousel title="Trending Now" items={trending} loading={loadingTrending} onSaveClick={openSaveModal} getHref={seriesCardHref} />
        <HomepageMangaCarousel title="Recently Updated" items={recentlyUpdated} loading={loadingUpdated} onSaveClick={openSaveModal} getHref={seriesCardHref} />

        <HomepageMangaCarousel
          title="Most Popular"
          items={popularManga}
          loading={loadingPopular}
          onSaveClick={openSaveModal}
          getHref={seriesCardHref}
          scrollResetKey={popularPeriod}
          headerTrailing={<HomepageFilterButtons options={HOMEPAGE_PERIOD_OPTIONS} value={popularPeriod as HomepagePeriod} onChange={setPopularPeriod} />}
        />

        <HomepageMangaCarousel
          title="Top Rated"
          items={topRated}
          loading={loadingTopRated}
          onSaveClick={openSaveModal}
          getHref={seriesCardHref}
          scrollResetKey={topRatedType}
          headerTrailing={<HomepageFilterButtons options={HOMEPAGE_TYPE_OPTIONS} value={topRatedType as HomepageMangaType} onChange={setTopRatedType} />}
        />

        <DeferredMount placeholderClassName="min-h-96">
          <HomepageCommunitySection />
        </DeferredMount>

        <HomepageCommunityCta />

      </div>

      {saveTarget ? (
        <SeriesBookmarkModal isOpen onClose={() => setSaveTarget(null)} seriesId={saveTarget.seriesId} mangaTitle={saveTarget.title} />
      ) : null}
    </section>
  );
}
