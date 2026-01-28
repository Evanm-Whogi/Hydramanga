"use client"
import { Star, Eye, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { formatToRating } from "@/lib/utils";
import { memo } from "react";

function MangaCard({ manga }: { manga?: any }) {
    const viewCount = manga.totalViews || manga.viewStats?.totalViews || 0;

    // Determine if the latest chapter is new (within the last 2 days)
    const latestChapter = manga?.latestChapter?.createdAt || null;
    const isNew = latestChapter ? (() => {
        const createdAt = new Date(latestChapter).getTime();
        const today = new Date().getTime();
        const diffDays = (today - createdAt) / (1000 * 60 * 60 * 24);
        return diffDays <= 2;
    })() : false;

    // Check if manga is in any user list
    // Handle both array format (from home endpoint) and object format (from search/discover)
    const isInList = manga.userSeriesList 
        ? Array.isArray(manga.userSeriesList) 
            ? manga.userSeriesList.length > 0 
            : true
        : false;

    // Get the first list name for tooltip (if available)
    const firstListName = manga.userSeriesList 
        ? Array.isArray(manga.userSeriesList) 
            ? manga.userSeriesList[0]?.listTitle || manga.userSeriesList[0]?.listName || 'list'
            : manga.userSeriesList?.listName || 'list'
        : '';

    return (
        <>
        <Link href={`manga/${manga.id}`} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={`${manga?.cover?.raw.url || '/notFound.png'}`} alt={manga.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                { isNew && (
                    <div className="absolute top-2 right-2 z-5">
                        <span className="bg-accent/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                            NEW
                        </span>
                    </div>
                )}
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-transparent-card/80 to-transparent-card/50">
                    <div className="flex items-center font-bold text-primary"><Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />{formatToRating(manga.rating)}</div>
                    { isInList && (
                        <span title={`In "${firstListName}"`} className="text-green-400 font-semibold"><BookmarkCheck className="size-5" /></span>
                    )}
                    <div className="flex items-center font-bold text-primary">
                        <Eye className="size-3.5 text-blue-300 mr-1" />
                        {viewCount > 0 ? formatViewCount(viewCount) : '0'}
                    </div>
                </div>
            </div>
            <div className="pt-2 text-center">
                <h3 className="text-lg font-extrabold text-primary leading-tight mb-0.5 line-clamp-2">{manga.title}</h3>
                <p className="text-muted font-medium">Ch {manga.totalChapters || 0}</p>
            </div>
        </Link>
        </>
    );
}

export default memo(MangaCard);

function formatViewCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}