"use client";
import SectionHeader from "./SectionHeader";
import MangaCard from "@/components/MangaCard";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import * as homeService from '@/services/homeService';
import MostFollowedCard from "@/app/home/components/cards/MostFollowedCard";
import PopularChapterCard from "@/app/home/components/cards/PopularChapterCard";
import ContinueReadingCard from "@/components/ContinueReadingCard";
import CollectionsCard from "@/app/home/components/cards/CollectionsCard";
import HomeSidebar from "@/app/home/components/HomeSidebar";
import RecentCard from "@/app/home/components/cards/RecentCard";
import RecentChapterFromListCard from "@/app/home/components/cards/RecentChapterFromListCard";
import { getCollections } from "@/services/mangaService";

import CarouselSection from "@/app/home/components/CarouselSection"
import { useUser } from "@/providers/UserProvider";

function usePaginatedManga(fetchFn: any, limit = 14) {
    const [data, setData] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const loadData = async (pageNum: number) => {
        if (loading || (!hasMore && pageNum !== 1)) return;
        
        setLoading(true);
        try {
            const newData = await fetchFn(pageNum, limit);

            // If we got fewer results than the limit, we've hit the end
            if (!newData || newData.length < limit) {
                setHasMore(false);
            }

            setData(prev => {
                // If it's the first page, just return the data
                if (pageNum === 1) return newData;

                // Otherwise, merge and prevent duplicates
                const combined = [...prev, ...newData];
                const uniqueMap = new Map();
                combined.forEach(item => uniqueMap.set(item.id, item));
                return Array.from(uniqueMap.values());
            });
        } catch (err) {
            console.error("Failed to fetch:", err);
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        loadData(1);
    }, []);

    const fetchMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadData(nextPage);
    };

    return { data, fetchMore, loading, hasMore };
}

function useFilteredManga(fetchFn: any, initialFilter: string = 'all') {
    const [data, setData] = useState<any[]>([]);
    const [filter, setFilter] = useState(initialFilter);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // Adjust this depending on if your service expects { period } or { type }
                const result = await fetchFn(filter);
                setData(result);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [filter, fetchFn]);

    return { data, filter, setFilter, loading };
}


export default function Lists() {
    const { user } = useUser();
    const { data: recentlyAdded, fetchMore: fetchMoreRecentlyAdded, loading, hasMore } = usePaginatedManga(homeService.getRecentlyAdded, 14);
    const { data: popularChapters, filter: chapPeriod, setFilter: setChapPeriod, loading: loadingChaps } = useFilteredManga(homeService.getPopularChapters, 'week');
    const { data: popularManga, filter: mangaPeriod, setFilter: setMangaPeriod, loading: loadingPopManga } = useFilteredManga(homeService.getPopularManga, 'month');
    const { data: highScores, filter: mangaType, setFilter: setMangaType, loading: loadingScores } = useFilteredManga(homeService.getHighScores, 'all');
    const { data: mostFollowed, filter: followPeriod, setFilter: setFollowPeriod, loading: loadingFollows } = useFilteredManga(homeService.getMostFollowed, 'all');

    const [recentlyRead, setRecentlyRead] = useState<any>([]);
    const [collections, setCollections] = useState([]);
    const [recentChaptersFromList, setRecentChaptersFromList] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;
        homeService.getRecentlyRead().then(setRecentlyRead).catch(() => {});
        homeService.getRecentChaptersFromUserList(30).then(setRecentChaptersFromList).catch(() => setRecentChaptersFromList([]));
    }, [user]);

    useEffect(() => {
        getCollections().then(setCollections).catch(() => {});
    }, []);

    return (
        <section id="lists" className="pb-25">
            <div className="container mx-auto text-primary space-y-24 mt-10 md:mt-0">
                <div className="flex flex-col gap-10 xl:flex-row xl:gap-8">
                    <div className="min-w-0 flex-1 space-y-16">

                        {/* Reading History */}
                        {recentlyRead?.progress?.length > 0 && (
                            <CarouselSection title="Continue Reading">
                                    {recentlyRead.progress.map((manga: any) => (
                                        <div key={`continue-reading-${manga.seriesId}`}>
                                            <ContinueReadingCard progress={manga} />
                                        </div>
                                    ))}
                            </CarouselSection>
                        )}

                        {/* New chapters from reading/rereading bookmarks */}
                        {user && recentChaptersFromList?.length > 0 && (
                            <CarouselSection title="New Chapters from Your Bookmarks">
                                {recentChaptersFromList.map((item: any) => (
                                    <div key={`list-chapter-${item.series?.id}-${item.chapter?.id}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                        <RecentChapterFromListCard item={item} />
                                    </div>
                                ))}
                            </CarouselSection>
                        )}

                        {/* Recently Added */}
                        <section>
                            <SectionHeader title="Recently Added" />
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 gap-4 md:gap-6">
                                {recentlyAdded.map((manga) => (
                                    <RecentCard key={`added-${manga.id}`} manga={manga} />
                                ))}
                            </div>
                            {hasMore && (
                                <button onClick={fetchMoreRecentlyAdded} disabled={loading} className="text-xl flex items-center mx-auto mt-8 text-muted hover:text-accent cursor-pointer disabled:opacity-50">
                                    {loading ? <Loader2 className="animate-spin" /> : <>Load More <ChevronDown className="ml-1" size={16} /></>}
                                </button>
                            )}
                        </section>

                        {/* Popular Chapters */}
                        <CarouselSection title="Popular Chapters" controls={<PeriodSelect value={chapPeriod} onChange={setChapPeriod} />}>
                            {popularChapters.map((item: any) => (
                                <div key={`popular-chapter-${item.series.id}-${item.chapter.id}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                    <PopularChapterCard manga={item} />
                                </div>
                            ))}
                        </CarouselSection>

                        {/* Popular Manga */}
                        <CarouselSection title="Most Popular Manga" controls={<PeriodSelect value={mangaPeriod} onChange={setMangaPeriod} />}>
                            {popularManga.map((manga: any) => (
                                <div key={`popular-manga-${manga.id}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                    <MangaCard manga={manga} />
                                </div>
                            ))}
                        </CarouselSection>


                        {/* High Score */}
                        <CarouselSection title="High Score Manga" controls={<TypeSelect value={mangaType} onChange={setMangaType} />}>
                            {highScores.map((manga: any) => (
                                <div key={`high-score-${manga.id}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                    <MangaCard manga={manga} />
                                </div>
                            ))}
                        </CarouselSection>


                        {/* Most Followed */}
                        <CarouselSection title="Most Followed" controls={<PeriodSelect value={followPeriod} onChange={setFollowPeriod} />}>
                            {mostFollowed.map((item: any) => (
                                <div key={`most-followed-${item.id}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                    <MostFollowedCard manga={item} />
                                </div>
                            ))}
                        </CarouselSection>


                        {/* Collections */}
                        <CarouselSection title="Collections">
                            {Object.entries(collections).map(([genre, data]: [string, any]) => (
                                <div key={`collection-${genre}`} className="flex-[0_0_45%] lg:flex-[0_0_14%]">
                                    <CollectionsCard 
                                        collection={{
                                            name: genre,
                                            description: data.description,
                                            count: data.count,
                                            topManga: data.topManga
                                        }} 
                                    />
                                </div>
                            ))}
                        </CarouselSection>
                    </div>
                    <div className="w-full shrink-0 xl:w-80">
                        <HomeSidebar />
                    </div>

                </div>
            </div>
        </section>
    );
}

// Small helper components for cleaner JSX
const PeriodSelect = ({ value, onChange }: any) => (
    <div className="flex flex-row gap-2">
        <button onClick={() => onChange('today')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'today' ? 'bg-accent' : 'bg-foreground'}`}>Today</button>
        <button onClick={() => onChange('week')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'week' ? 'bg-accent' : 'bg-foreground'}`}>This Week</button>
        <button onClick={() => onChange('month')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'month' ? 'bg-accent' : 'bg-foreground'}`}>This Month</button>
        <button onClick={() => onChange('all')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'all' ? 'bg-accent' : 'bg-foreground'}`}>All Time</button>
    </div>
);

const TypeSelect = ({ value, onChange }: any) => (
    <div className="flex flex-row gap-2">
        <button onClick={() => onChange('all')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'all' ? 'bg-accent' : 'bg-foreground'}`}>All</button>
        <button onClick={() => onChange('Manga')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'Manga' ? 'bg-accent' : 'bg-foreground'}`}>Manga</button>
        <button onClick={() => onChange('Manhwa')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'Manhwa' ? 'bg-accent' : 'bg-foreground'}`}>Manhwa</button>
        <button onClick={() => onChange('Manhua')} className={`rounded-md cursor-pointer px-2 py-1 text-md ${value === 'Manhua' ? 'bg-accent' : 'bg-foreground'}`}>Manhua</button>
    </div>
);