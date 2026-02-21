"use client";
import { useState, useMemo } from "react";
import { MoveUpIcon, MoveDownIcon, BookOpen, MessageCircleMore, ImagesIcon, StarIcon } from 'lucide-react';
import Chapters from "./Chapters";
import Comments from "./Comments";
import Gallery from "./Gallery";
import Reviews from "./Reviews";
import ListDropdown from "./ListDropdown"

interface MangaActionsProps {
    manga: any;
    chapters: any[];
    comments: any;
    gallery: any[];
    initialListName: string | null;
    importProgress: any;
}

export default function ListContainer({ manga, chapters, comments, gallery, initialListName, importProgress }: MangaActionsProps) {
    const [page, setPage] = useState("chapters");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Sort chapters 0.1 -> 0.2 -> 1 -> 2 ... or reverse
    const sortedChapters = useMemo(() => {
        return [...(chapters || [])].sort((a: any, b: any) => {
            const order = a.chapterNumber.localeCompare(b.chapterNumber, undefined, {
                numeric: true,
                sensitivity: 'base'
            });
            return sortOrder === "asc" ? order : -order;
        });
    }, [chapters, sortOrder]);

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 w-full pt-10 items-center">

            <div className="flex justify-start">
                <ListDropdown seriesId={manga.id} initialListName={initialListName} mangaTitle={manga.title}/>
            </div>

            <div className="flex flex-col md:flex-row justify-center gap-2 my-5 md:my-0">
                <button onClick={() => setPage("chapters")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "chapters" ? "text-primary" : "text-muted"}`}>
                    <BookOpen className="size-6 mr-1 transition-colors" /> Chapters
                </button>
                <button onClick={() => setPage("comments")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "comments" ? "text-primary" : "text-muted"}`}>
                    <MessageCircleMore className="size-6 mr-1 transition-colors" /> Comments
                </button>
                <button onClick={() => setPage("reviews")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "reviews" ? "text-primary" : "text-muted"}`}>
                    <StarIcon className="size-6 mr-1 transition-colors" /> Reviews
                </button>
                <button onClick={() => setPage("gallery")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "gallery" ? "text-primary" : "text-muted"}`}>
                    <ImagesIcon className="size-6 mr-1 transition-colors" /> Gallery
                </button>
            </div>

            <div className="flex justify-end">
                {page === "chapters" && (
                    <div className="flex gap-2">
                        <button onClick={() => setSortOrder("asc")} className="p-2 bg-foreground hover:bg-foreground/50 hover:cursor-pointer rounded-md"><MoveUpIcon className="size-5"/></button>
                        <button onClick={() => setSortOrder("desc")} className="p-2 bg-foreground hover:bg-foreground/50 hover:cursor-pointer rounded-md"><MoveDownIcon className="size-5"/></button>
                    </div>
                )}
            </div>
        </div>

        <div className="flex flex-col pt-2 gap-2">
            {page === "chapters" && <Chapters manga={{ ...manga, chapters: sortedChapters }} progress={importProgress} />}
            {page === "comments" && <Comments manga={manga} comments={comments} />}
            {page === "reviews" && <Reviews seriesId={manga.id} />}
            {page === "gallery" && <Gallery gallery={gallery} mangaTitle={manga.title} />}
        </div>
        </>
    )

}
