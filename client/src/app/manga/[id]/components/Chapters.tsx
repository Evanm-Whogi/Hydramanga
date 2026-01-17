import { formatDate } from "@/lib/utils";
export default function Chapters({ manga }: { manga: any }) {
    return (
        <>
        {manga.chapters.map((chapter: any) => (
        <a href={`/manga/${manga.id}/read/${chapter.id}`} key={chapter.id} className="p-3 w-full bg-foreground hover:bg-foreground/50 cursor-pointer">

            <div className="flex justify-between items-center">
                <h1 className='text-xl'>{chapter.title}</h1>
                <div className="flex flex-col">
                    <h2 className="text-sm text-muted">Volume: {chapter.volumeNumber || "N/A"}</h2>
                    <h2 className="text-sm text-muted">Chapter: {chapter.chapterNumber}</h2>
                </div>
            </div>
            <h2 className="text-sm text-muted">{formatDate(chapter.updatedAt)}</h2>
        </a>
        ))}

        </>
    )
}