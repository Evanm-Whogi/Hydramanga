"use client"
import { Eye, Bookmark } from "lucide-react";
import Link from "next/link";
import { mangaPath } from "@/lib/paths";
import { memo, type MouseEvent } from "react";
import CoverImage from "@/components/CoverImage";
import { formatCompactNumber as formatViewCount } from "@/lib/utils";

function MangaCardList({ manga, onNavigate, priority }: { manga?: any; onNavigate?: () => void; priority?: boolean }) {
    const shouldHandleNavigate = (e: MouseEvent<HTMLAnchorElement>) =>
        e.button === 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        !e.defaultPrevented;

    const handlePointerDown = (e: MouseEvent<HTMLAnchorElement>) => {
        if (shouldHandleNavigate(e)) onNavigate?.();
    };

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (!shouldHandleNavigate(e)) return;
        onNavigate?.();
    };

    return (
        <>
        <Link
            href={mangaPath(manga.id)}
            prefetch={false}
            className="flex flex-row w-full h-fit group bg-foreground rounded-md"
            onPointerDown={handlePointerDown}
            onClick={handleClick}
        >
            <div className="relative aspect-2/3 w-lg lg:w-32 xl:w-32 overflow-hidden rounded-lg bg-foreground">
                <CoverImage
                    cover={manga?.cover}
                    alt={manga.title}
                    priority={priority}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
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
                        <Bookmark className="size-3.5 text-green-300 mr-1" /> {manga.bookmarkStatusLabel ?? ((manga.followerCount ?? 0) > 0 ? formatViewCount(manga.followerCount) : '0')}
                    </span>
                </div>
                <p className="text-md text-muted font-medium line-clamp-3 max-w-4xl">{manga.description}</p>
            </div>
        </Link>
        </>
    );
}

export default memo(MangaCardList);
