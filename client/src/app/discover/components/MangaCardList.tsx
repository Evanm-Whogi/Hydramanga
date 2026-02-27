"use client"
import { Eye, Bookmark } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

function MangaCardList({ manga }: { manga?: any }) {
    return (
        <>
        <Link href={`manga/${manga.id}`} className="flex flex-row w-full h-fit group bg-foreground rounded-md">
            <div className="relative aspect-2/3 w-lg lg:w-32 xl:w-32 overflow-hidden rounded-lg">
                <img src={`${manga?.cover?.raw.url || '/notFound.png'}`} alt={manga.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
            <div className="flex flex-col gap-2 ml-4 mt-2">
                <h1 className="text-2xl font-bold">{manga.title}</h1>
                <div className="flex flex-row flex-wrap gap-2">
                    <span className="text-sm text-muted font-medium uppercase">{manga.type || 'Unknown Type'}</span>
                    <span className="text-sm text-muted font-medium">{manga.year}</span>
                    <span className="text-sm text-muted font-medium uppercase">{(manga.status === 'releasing' ) ? 'Ongoing' : manga.status || 'Unknown Status'}</span>
                    <span className="text-sm text-muted font-medium uppercase">{manga.totalChapters || 0} Chapters</span>
                    <span className="text-sm text-muted font-medium uppercase flex items-center">
                        <Eye className="size-3.5 text-blue-300 mr-1" /> {manga.views > 0 ? formatViewCount(manga.views) : '0' }
                    </span>
                    <span className="text-sm text-muted font-medium uppercase flex items-center">
                        <Bookmark className="size-3.5 text-green-300 mr-1" /> {formatViewCount(manga.followerCount) || '0' }
                    </span>
                </div>
                <p className="text-md text-muted font-medium line-clamp-3 max-w-4xl">{manga.description}</p>
            </div>
        </Link>
        </>
    );
}

export default memo(MangaCardList);

function formatViewCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}