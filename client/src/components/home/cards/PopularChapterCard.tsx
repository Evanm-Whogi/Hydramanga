"use client"
import { Star, Eye } from "lucide-react";
import Link from "next/link";
import { mangaPath } from "@/lib/paths";
import { formatToRating, formatCompactNumber as formatViewCount } from "@/lib/utils";
import { memo } from "react";

function PopularChapterCard({ manga }: { manga?: any }) {

    return (
        <>
        <Link href={mangaPath(manga.series.id)} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={`${manga.series?.cover?.raw.url || '/notFound.png'}`} alt={manga.series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                { manga.isNew && (
                    <div className="absolute top-2 right-2 z-5" title="Newly Added">
                        <span className="bg-accent/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                            NEW
                        </span>
                    </div>
                )}
                <div className="absolute top-2 left-2 z-5" title="Total Chapters">
                    <span className="bg-background/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                        {manga.series.totalChapters || 0}
                    </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-transparent-card/80 to-transparent-card/50">
                    <div className="flex items-center font-bold text-primary"><Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />{formatToRating(manga.series.rating)}</div>

                    <div className="flex items-center font-bold text-primary">
                        <Eye className="size-3.5 text-blue-300 mr-1" />
                        {manga.series.views > 0 ? formatViewCount(manga.series.views) : '0'}
                    </div>
                </div>
            </div>
            <div className="pt-2 text-center space-y-1">
                <div className="flex place-content-between">
                    <p className="text-sm text-muted font-medium capitalize">Ch. {manga.chapter?.chapterNumber || 0}</p>
                    <p className="text-sm text-muted font-medium">{manga.chapter?.viewCount || 0} reads</p>
                </div>
                <h3 className="text-lg text-primary leading-tight line-clamp-2">{manga.series.title}</h3>
            </div>
        </Link>
        </>
    );
}

export default memo(PopularChapterCard);
