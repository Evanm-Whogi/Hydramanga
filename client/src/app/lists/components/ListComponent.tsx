"use client"
import SectionHeader from "@/app/home/components/SectionHeader"
import MangaCard from "@/components/MangaCard";

import SingleDropdown from '@/components/Dropdown';
import MultiDropdown from "@/components/Checkbox";
import SearchBar from "@/components/SearchBar";
import { useEffect, useMemo, useState } from "react";

const list = [{ label: "All Lists", value: "all" }, { label: "Unread", value: "unread" }, { label: "Reading", value: "reading" }, { label: "Finished", value: "finished" }, { label: "Dropped", value: "dropped" }];
const genres = ["Action", "Adult", "Adventure", "Avant Garde", "Award Winning", "Boys Love", "Comedy", "Doujinshi", "Drama", "Ecchi", "Erotica", "Fantasy", "Gender Bender", "Girls Love", "Gourmet", "Harem", "Historical", "Horror", "Josei", "Mahou Shoujo", "Martial Arts", "Mature", "Mecha", "Music", "Mystery", "Psychological", "Romance", "School Life", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Smut", "Sports", "Supernatural", "Suspense", "Thriller", "Tragedy", "Yaoi", "Yuri"];
const types = ["Manga", "Manhua", "Manhwa", "Novel", "Oel", "Other"];
const sort = [{ label: "Popular", value: "weightedScore"}, { label: "Total Chapters", value: "totalChapters"}, { label: "Recently Added", value: "lastUpdatedAt"}, { label: "Title", value: "title"}, { label: "Year", value: "year" }];
const status = [{ label: "Ongoing", value: "releasing"}, { label: "Complete", value: "completed"}, { label: "Hiatus", value: "hiatus"}, { label: "canceled", value: "cancelled" }, { label: "Upcoming", value: "upcoming" }];
const time = [{ label: "Timeless", value: "timeless"}, { label: "2025", value: "2025"}, { label: "2024", value: "2024"}, { label: "2023", value: "2023"}, { label: "2022", value: "2022"}, { label: "2021", value: "2021"}, { label: "2020", value: "2020"}, { label: "2010s", value: "2010s"}, { label: "2000s", value: "2000s"}, { label: "1990s", value: "1990s"}, { label: "1980s", value: "1980s"}, { label: "1970s", value: "1970s"}, { label: "1960s", value: "1960s"}, { label: "1950s", value: "1950s"}, { label: "1940s", value: "1940s"}];

export default function ListComponent({lists}: {lists: any}) {
    const [selectedList, setSelectedList] =  useState("all");
    const [search, setSearch] = useState("");
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [selectedYears, setSelectedYears] = useState<string[]>([]);
    const [selectedSort, setSelectedSort] = useState<string>("weightedScore");
    const [Nsfw, setNsfw] = useState<string>('true');

    const sortKey = selectedSort;

    const yearMatches = (year: number | undefined, filters: string[]) => {
        if (!filters || filters.length === 0 || filters.includes("timeless")) return true;
        if (year === undefined || year === null) return false;
        return filters.some(f => {
            if (/^\d{4}$/.test(f)) {
                return year === Number(f);
            }
            switch (f) {
                case "2010s": return year >= 2010 && year <= 2019;
                case "2000s": return year >= 2000 && year <= 2009;
                case "1990s": return year >= 1990 && year <= 1999;
                case "1980s": return year >= 1980 && year <= 1989;
                case "1970s": return year >= 1970 && year <= 1979;
                case "1960s": return year >= 1960 && year <= 1969;
                case "1950s": return year >= 1950 && year <= 1959;
                case "1940s": return year >= 1940 && year <= 1949;
                default: return true;
            }
        });
    };

    const normalize = (s?: string) => (s || "").toLowerCase();

    const applyFilters = (items: any[]) => {
        const filtered = items.filter(m => {
            const titleMatch = normalize(m?.title).includes(normalize(search));
            const genreMatch = selectedGenres.length === 0 || (Array.isArray(m?.genres) && selectedGenres.every(g => m.genres.includes(g)));
            const typeMatch = selectedTypes.length === 0 || (
                m?.type && selectedTypes.map(t => t.toLowerCase()).includes(String(m.type).toLowerCase())
            );
            const statusMatch = selectedStatuses.length === 0 || (m?.status && selectedStatuses.includes(m.status));
            const yearMatch = yearMatches(m?.year, selectedYears);
            const nsfwMatch = Nsfw === 'true' || m?.contentRating === 'safe' || m?.contentRating === 'suggestive';
            return titleMatch && genreMatch && typeMatch && statusMatch && yearMatch && nsfwMatch;
        });

        const sorted = [...filtered].sort((a, b) => {
            const desc = (x: number | string | Date | undefined, y: number | string | Date | undefined) => {
                if (x === undefined && y === undefined) return 0;
                if (x === undefined) return 1;
                if (y === undefined) return -1;
                return x < y ? 1 : x > y ? -1 : 0;
            };
            const asc = (x: number | string | Date | undefined, y: number | string | Date | undefined) => {
                if (x === undefined && y === undefined) return 0;
                if (x === undefined) return 1;
                if (y === undefined) return -1;
                return x > y ? 1 : x < y ? -1 : 0;
            };

            switch (sortKey) {
                case "weightedScore":
                    return desc(a?.weightedScore, b?.weightedScore);
                case "totalChapters": {
                    const ax = Number(a?.totalChapters);
                    const bx = Number(b?.totalChapters);
                    return desc(ax, bx);
                }
                case "lastUpdatedAt":
                    return desc(new Date(a?.lastUpdatedAt), new Date(b?.lastUpdatedAt));
                case "title":
                    return asc(normalize(a?.title), normalize(b?.title));
                case "year":
                    return desc(a?.year, b?.year);
                default:
                    return 0;
            }
        });
        return sorted;
    };

    const filteredLists = useMemo(() => ({
        unread: applyFilters(lists.unread || []),
        reading: applyFilters(lists.reading || []),
        finished: applyFilters(lists.finished || []),
        dropped: applyFilters(lists.dropped || []),
    }), [lists, search, selectedGenres, selectedTypes, selectedStatuses, selectedYears, sortKey, Nsfw]);

    const handleNsfwToggle = () => {
        const newValue = Nsfw === 'true' ? 'false' : 'true';
        setNsfw(newValue);
    };

    return (
        <>    
        <section id="lists" className="py-12">
            <div className="container mx-auto text-primary space-y-6">

            <div className="flex flex-col mb-24">
                <div className="flex justify-between items-center gap-6 mb-3">
                    <div className="w-42">
                        <SingleDropdown options={list} onChange={(val: string) => setSelectedList(val)} size="w-full" />
                    </div>
                    <div className="w-full pt-2">
                        <SearchBar onChange={(val: string) => setSearch(val)} size="w-full" />
                    </div>
                    <button 
                        onClick={handleNsfwToggle}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap mt-2 ${Nsfw === 'true' ? 'bg-accent text-white hover:bg-accent/80' : 'bg-foreground text-muted hover:bg-foreground/70'}`}>
                        {Nsfw === 'true' ? 'NSFW: ON' : 'NSFW: OFF'}
                    </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 justify-between items-center gap-6">
                    <MultiDropdown label="All genres" options={genres} onChange={(vals: string[]) => setSelectedGenres(vals)} size="w-full" />
                    <SingleDropdown  options={sort} onChange={(val: string) => setSelectedSort(val)} size="w-full" />
                    <MultiDropdown label="All formats" options={types} onChange={(vals: string[]) => setSelectedTypes(vals)} size="w-full" />
                    <MultiDropdown label="All statuses" options={status} onChange={(vals: string[]) => setSelectedStatuses(vals)} size="w-full" />
                    <MultiDropdown label="Timeless" options={time} onChange={(vals: string[]) => setSelectedYears(vals)} size="w-full" />
                </div>
            </div>

                {selectedList === "all" && (
                    <>
                        <SectionHeader title="Unread" subtitle={`(${filteredLists.unread.length})`} link="" filters=""/>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                            {filteredLists.unread.map((manga: any) => (
                                <MangaCard key={manga.id} manga={manga} />
                            ))}
                        </div>

                        <SectionHeader title="Reading" subtitle={`(${filteredLists.reading.length})`} link="" filters=""/>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                            {filteredLists.reading.map((manga: any) => (
                                <MangaCard key={manga.id} manga={manga} />
                            ))}
                        </div>

                        <SectionHeader title="Finished" subtitle={`(${filteredLists.finished.length})`} link="" filters=""/>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                            {filteredLists.finished.map((manga: any) => (
                                <MangaCard key={manga.id} manga={manga} />
                            ))}
                        </div>

                        <SectionHeader title="Dropped" subtitle={`(${filteredLists.dropped.length})`} link="" filters=""/>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                            {filteredLists.dropped.map((manga: any) => (
                                <MangaCard key={manga.id} manga={manga} />
                            ))}
                        </div>
                    </>
                )}

                {selectedList !== "all" && (
                    <>
                        {selectedList === "unread" && (
                            <>
                                <SectionHeader title="Unread" subtitle={`(${filteredLists.unread.length})`} link="" filters=""/>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                                    {filteredLists.unread.map((manga: any) => (
                                        <MangaCard key={manga.id} manga={manga} />
                                    ))}
                                </div>
                            </>
                        )}
                        {selectedList === "reading" && (
                            <>
                                <SectionHeader title="Reading" subtitle={`(${filteredLists.reading.length})`} link="" filters=""/>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                                    {filteredLists.reading.map((manga: any) => (
                                        <MangaCard key={manga.id} manga={manga} />
                                    ))}
                                </div>
                            </>
                        )}
                        {selectedList === "finished" && (
                            <>
                                <SectionHeader title="Finished" subtitle={`(${filteredLists.finished.length})`} link="" filters=""/>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                                    {filteredLists.finished.map((manga: any) => (
                                        <MangaCard key={manga.id} manga={manga} />
                                    ))}
                                </div>
                            </>
                        )}
                        {selectedList === "dropped" && (
                            <>
                                <SectionHeader title="Dropped" subtitle={`(${filteredLists.dropped.length})`} link="" filters=""/>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                                    {filteredLists.dropped.map((manga: any) => (
                                        <MangaCard key={manga.id} manga={manga} />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

            </div>
        </section>
        </>
    )
}