"use client";
import { useState } from "react";
import { MoveUpIcon, MoveDownIcon, BookOpen, MessageCircleMore } from 'lucide-react';
import Chapters from "./Chapters";
import Comments from "./Comments";
import ListDropdown from "./ListDropdown"

export default function ListContainer({ manga, comments, userStatus }: { manga: any, comments: any, userStatus: string }) {
    const [page, setPage] = useState("chapters");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    const sortedChapters = [...manga.chapters].sort((a: any, b: any) => {
        const volA = parseFloat(a.volumeNumber) || 0;
        const volB = parseFloat(b.volumeNumber) || 0;
        const chapA = parseFloat(a.chapterNumber) || 0;
        const chapB = parseFloat(b.chapterNumber) || 0;

        if (sortOrder === "asc") {
            if (volA !== volB) return volA - volB;
            return chapA - chapB;
        } else {
            if (volA !== volB) return volB - volA;
            return chapB - chapA;
        }
    });

    return (
        <>
        <div className="flex w-full place-content-between pt-10 items-center">
            <ListDropdown seriesId={manga.id} initialStatus={userStatus}/>

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
            { page === "chapters" && <Chapters manga={{ ...manga, chapters: sortedChapters }} />}
            { page === "comments" && <Comments manga={manga} comments={comments} />}
        </div>
        </>
    )

}
