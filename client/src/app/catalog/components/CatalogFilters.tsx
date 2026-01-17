'use client'
import SearchBar from "@/components/SearchBar"
import Dropdown from "@/components/Dropdown"
import Checkbox from "@/components/Checkbox"
import { useState } from "react"


const genres = ["Action", "Adult", "Adventure", "Avant Garde", "Award Winning", "Boys Love", "Comedy", "Doujinshi", "Drama", "Ecchi", "Erotica", "Fantasy", "Gender Bender", "Girls Love", "Gourmet", "Harem", "Hentai", "Historical", "Horror", "Josei", "Lolicon", "Mahou Shoujo", "Martial Arts", "Mature", "Mecha", "Music", "Mystery", "Psychological", "Romance", "School Life", "Sci-Fi", "Seinen", "Shotacon", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Smut", "Sports", "Supernatural", "Suspense", "Thriller", "Tragedy", "Yaoi", "Yuri"];
const types = ["Manga", "Manhua", "Manhwa", "Novel", "Oel", "Other"];

const sort = [
    { label: "Popular", value: "weightedScore"},
    { label: "Total Chapters", value: "totalChapters"},
    { label: "Recently Added", value: "lastUpdatedAt"}
]

const order = [
  { label: "Descending", value: "desc" },
  { label: "Ascending", value: "asc" }
];

const status = [
    { label: "Ongoing", value: "releasing"},
    { label: "Complete", value: "completed"},
    { label: "Hiatus", value: "hiatus"},
    { label: "canceled", value: "cancelled" },
    { label: "Upcoming", value: "upcoming" },
]

export default function CatalogFilters({ filters, onFilterChange }: any) {
    const [Nsfw, setNsfw] = useState<string>('false');

    const handleNsfwToggle = () => {
        const newValue = Nsfw === 'true' ? 'false' : 'true';
        setNsfw(newValue);
        onFilterChange({ nsfw: newValue });
    };


    return (
        <section id="lists" className="py-12">
            <div className="container mx-auto">
                <div className="flex grid-cols-7 gap-4 place-content-betwen w-full">
                    <div>
                        <label className="block text-lg font-medium leading-6 text-primary mb-2">Search</label>
                        <SearchBar onChange={(val: string) => onFilterChange({ search: val })}/>
                    </div>
                    <Checkbox title="Tags" options={genres} onChange={(val: any) => onFilterChange({ genres: val })} />
                    <Dropdown title="Sort" options={sort} onChange={(val: string) => onFilterChange({ sort: val })} />
                    <Dropdown title="Order" options={order} onChange={(val: string) => onFilterChange({ order: val })}/>
                    <Checkbox title="Type" options={types} onChange={(val: any) => onFilterChange({ type: val })} />
                    <Checkbox title="Series Status" options={status} onChange={(val: any) => onFilterChange({ status: val })} />
                    <div className="w-1/2">
                        <label className=" blocktext-lg font-medium leading-6 text-primary mb-2">NSFW</label>
                        <div className="mt-3 rounded-md shadow-sm text-primary w-fit" onClick={() => handleNsfwToggle()}>
                            <button className={`px-3 py-1 rounded-l-md text-primary hover:cursor-pointer ${Nsfw === 'true' ? 'bg-accent' : 'bg-foreground'}`}>True</button>
                            <button className={`px-3 py-1 rounded-r-md text-primary hover:cursor-pointer ${Nsfw === 'false' ? 'bg-accent' : 'bg-foreground'}`}>False</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}