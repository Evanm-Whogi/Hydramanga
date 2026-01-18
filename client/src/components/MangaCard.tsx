import Pill from "@/components/Pill";
import { Star, Eye } from "lucide-react";
import Link from "next/link";
import { formatToRating } from "@/lib/utils";

export default function MangaCard({ manga }: { manga?: any }) {
    const viewCount = manga.totalViews || manga.viewStats?.totalViews || 0;
    
    return (
        <>
        <Link href={`manga/${manga.id}`} className="flex flex-col w-full h-fit group">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={`${manga.cover.raw.url}`} alt={manga.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-black/80 to-black/50">
                    <div className="flex items-center font-bold text-primary"><Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />{formatToRating(manga.rating)}</div>
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

function formatViewCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
}