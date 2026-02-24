"use client";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { formatToRating } from "@/lib/utils";
import { memo } from "react";
import { formatTimeAgo } from '@/lib/utils';

function RecentChapterFromListCard({ item }: { item?: { chapter: any; series: any } }) {
    if (!item?.series || !item?.chapter) return null;
    const { series, chapter } = item;

    return (
        <Link href={`manga/${series.id}/read/${chapter.id}`} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={series?.cover?.raw?.url || "/notFound.png"}alt={series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                {item.series.isNew && (
                    <div className="absolute top-2 right-2 z-5" title="New chapter">
                        <span className="bg-accent/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                            NEW
                        </span>
                    </div>
                )}
                <div className="absolute top-2 left-2 z-5" title="Chapter">
                    <span className="bg-background/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                        Ch. {chapter.chapterNumber}
                    </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-transparent-card/80 to-transparent-card/50">
                    <div className="flex items-center font-bold text-primary">
                        <BookOpen className="size-3.5 text-accent mr-1" />
                        {formatToRating(series.rating)}
                    </div>
                    <span className="text-xs text-muted font-medium">
                        {formatTimeAgo(chapter.createdAt)}
                    </span>
                </div>
            </div>
            <div className="pt-2 text-center space-y-1">
                <p className="text-sm text-muted font-medium">Ch. {chapter.chapterNumber}</p>
                <h3 className="text-lg text-primary leading-tight line-clamp-2">{series.title}</h3>
            </div>
        </Link>
    );
}

export default memo(RecentChapterFromListCard);
