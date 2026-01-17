import Pill from "@/components/Pill";
import { Star, Eye } from "lucide-react";
import Link from "next/link";
import { formatToRating } from "@/lib/utils";

export default function MangaCard({ manga }: { manga?: any }) {
    return (
        <>
        <Link href={`manga/${manga.id}`} className="flex flex-col w-full h-fit">
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl">
                <img src={`${manga.cover.raw.url}`} alt={manga.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 flex justify-between items-center p-3 bg-linear-to-t from-black/70 to-transparent">
                    <div className="flex items-center font-bold text-primary"><Star className="size-3.5 text-yellow-400 mr-1 fill-yellow-400" />{formatToRating(manga.rating)}</div>
                    <div className="flex items-center font-bold text-primary"><Eye className="size-3.5 text-blue-300 mr-1" />0</div>
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