"use client";
import { useState, useMemo } from "react";
import { MoveUpIcon, MoveDownIcon, BookOpen, MessageCircleMore } from 'lucide-react';
import Chapters from "./Chapters";
import Comments from "./Comments";
import ListDropdown from "./ListDropdown"

interface MangaActionsProps {
  manga: any;
  chapters: any[];
  comments: any;
    initialListName: string | null;
  importProgress: any;
}

export default function ListContainer({ manga, chapters, comments, initialListName, importProgress }: MangaActionsProps) {
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
        <div className="flex w-full place-content-between pt-10 items-center">
            <ListDropdown seriesId={manga.id} initialListName={initialListName} mangaTitle={manga.title}/>

            <div className="flex gap-2">
                <button onClick={() => setPage("chapters")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "chapters" ? "text-primary" : "text-muted"}`}><BookOpen className="size-6 mr-1 transition-colors" /> Chapters</button>
                <button onClick={() => setPage("comments")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all ${page === "comments" ? "text-primary" : "text-muted"}`}><MessageCircleMore className="size-6 mr-1 transition-colors" /> Comments</button>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setSortOrder("asc")} className={`p-2 bg-foreground hover:bg-foreground/50 hover:cursor-pointer ${sortOrder === "asc" ? "text-primary border border-borders" : "text-muted"}`}><MoveUpIcon className="size-5"/></button>
                <button onClick={() => setSortOrder("desc")} className={`p-2 bg-foreground hover:bg-foreground/50 hover:cursor-pointer ${sortOrder === "desc" ? "text-primary border border-borders" : "text-muted"}`}><MoveDownIcon className="size-5"/></button>
            </div>
        </div>

        <div className="flex flex-col pt-2 gap-2">
            { page === "chapters" && <Chapters manga={{ ...manga, chapters: sortedChapters }} /> }
            { page === "comments" && <Comments manga={manga} comments={comments} />}
        </div>
        </>
    )

}
