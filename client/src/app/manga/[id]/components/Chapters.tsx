import { formatDate } from "@/lib/utils";
import { useState, useMemo } from "react";

const CHAPTERS_PER_PAGE = 24;

export default function Chapters({ manga }: { manga: any }) {
    const [showAll, setShowAll] = useState(false);
    
    // Use chapters as-is (already sorted by parent component)
    const chapters = manga.chapters || [];
    
    const visibleChapters = useMemo(() => {
        return showAll ? chapters : chapters.slice(0, CHAPTERS_PER_PAGE);
    }, [chapters, showAll]);
    
    const hasMore = !showAll && chapters.length > CHAPTERS_PER_PAGE;

    return (
        <>
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {visibleChapters.map((chapter: any) => (
                <a href={`/manga/${manga.id}/read/${chapter.id}`} key={chapter.id} className="p-3 w-full bg-foreground hover:bg-foreground/50 cursor-pointer rounded-md transition-colors">

                    <div className="flex justify-between items-center">
                        <h1 className='text-xl line-clamp-2'>{chapter.title}</h1>
                        <div className="flex flex-col">
                            <h2 className="text-sm text-muted">Volume: {chapter.volumeNumber || "N/A"}</h2>
                            <h2 className="text-sm text-muted">Chapter: {chapter.chapterNumber}</h2>
                        </div>
                    </div>
                    <h2 className="text-sm text-muted">{formatDate(chapter.updatedAt)}</h2>
                </a>
                ))}
            </div>
            
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button onClick={() => setShowAll(true)} className="hover:cursor-pointer px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold">Show All ({chapters.length} chapters)
                    </button>
                </div>
            )}
        </div>
        </>
    )
}