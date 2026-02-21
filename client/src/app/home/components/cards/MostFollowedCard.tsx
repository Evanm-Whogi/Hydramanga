"use client"
import { Star, Eye, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { formatToRating } from "@/lib/utils";
import { memo } from "react";

function MangaCard({ manga }: { manga?: any }) {
    return (
        <>
        <Link href={`manga/${manga.id}`} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={`${manga?.cover?.raw.url || '/notFound.png'}`} alt={manga.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                { manga.isNew && (
                    <div className="absolute top-2 right-2 z-5" title="Newly Added">
                        <span className="bg-accent/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                            NEW
                        </span>
                    </div>
                )}
                <div className="absolute top-2 left-2 z-5" title="Total Chapters">
                    <span className="bg-background/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                        {manga.totalChapters || 0}
                    </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-transparent-card/80 to-transparent-card/50">
                    <div className="flex items-center font-bold text-primary"><Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />{formatToRating(manga.rating)}</div>
                    { manga.isInUserList && (
                        <span className="text-green-400 font-semibold"><BookmarkCheck className="size-5" /></span>
                    )}
                    <div className="flex items-center font-bold text-primary">
                        <Eye className="size-3.5 text-blue-300 mr-1" />
                        {manga.views > 0 ? formatViewCount(manga.views) : '0'}
                    </div>
                </div>
            </div>
            <div className="pt-2 text-center space-y-1">
                <div className="flex place-content-between">
                    <p className="text-sm text-muted font-medium capitalize">{manga.type || 'Unknown Type'}</p>
                    <p className="text-sm text-muted font-medium">{manga.followerCount || 0} Followers</p>
                </div>
                <h3 className="text-lg text-primary leading-tight line-clamp-2">{manga.title}</h3>
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