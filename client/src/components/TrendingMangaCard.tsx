import Link from "next/link";
import { Star, TrendingUp, Eye, BookmarkCheck } from "lucide-react";
import { formatToRating } from "@/lib/utils";

interface TrendingMangaCardProps {
    manga: any;
    rank?: number;
}

export default function TrendingMangaCard({ manga, rank }: TrendingMangaCardProps) {
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || '/notFound.png';
    const viewCount = manga.trendingStats?.viewCount || 0;
    const uniqueViews = manga.trendingStats?.uniqueViewCount || 0;

    // Check if manga is in any user list
    const isInList = manga.userSeriesList 
        ? Array.isArray(manga.userSeriesList) 
            ? manga.userSeriesList.length > 0 
            : true
        : false;

    // Get the first list name for tooltip
    const firstListName = manga.userSeriesList 
        ? Array.isArray(manga.userSeriesList) 
            ? manga.userSeriesList[0]?.listTitle || manga.userSeriesList[0]?.listName || 'list'
            : manga.userSeriesList?.listName || 'list'
        : '';

    // Determine if the latest chapter is new (within the last 2 days)
    const latestChapter = manga?.latestChapter?.createdAt || null;
    const isNew = latestChapter ? (() => {
        const createdAt = new Date(latestChapter).getTime();
        const today = new Date().getTime();
        const diffDays = (today - createdAt) / (1000 * 60 * 60 * 24);
        return diffDays <= 2;
    })() : false;

    return (
        <Link href={`/manga/${manga.id}`} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img 
                    src={coverUrl} 
                    alt={manga.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                />
                {/* Rank Badge */}
                {rank && rank <= 10 && (
                    <div className="absolute top-2 left-2 bg-accent/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-xs font-bold flex items-center shadow-lg">
                        <TrendingUp className="size-3 mr-1" />
                        #{rank}
                    </div>
                )}
                {/* New Badge */}
                {isNew && (
                    <div className="absolute top-2 right-2 z-10">
                        <span className="bg-accent/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                            NEW
                        </span>
                    </div>
                )}
                {/* Bottom Info */}
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-black/80 to-black/50">
                    <div className="flex items-center font-bold text-white">
                        <Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />
                        {formatToRating(manga.rating || manga.weightedScore)}
                    </div>
                    { isInList && (
                        <span title={`In "${firstListName}"`} className="text-green-400 font-semibold">
                            <BookmarkCheck className="size-5" />
                        </span>
                    )}
                    <div className="flex flex-col items-end text-white text-xs">
                        <div className="flex items-center font-bold">
                            <Eye className="size-3.5 text-blue-300 mr-1" />
                            {formatNumber(viewCount)}
                        </div>
                        {uniqueViews > 0 && (
                            <span className="text-[10px] text-white/70">
                                {formatNumber(uniqueViews)} unique
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-2 text-center">
                <h3 className="text-lg font-extrabold text-primary leading-tight mb-0.5 line-clamp-2 group-hover:text-accent transition-colors">
                    {manga.title}
                </h3>
                <p className="text-muted font-medium text-sm">
                    {viewCount > 0 ? `${formatNumber(viewCount)} views this week` : `Ch ${manga.totalChapters || 0}`}
                </p>
            </div>
        </Link>
    );
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
