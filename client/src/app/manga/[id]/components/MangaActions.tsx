"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { MoveUpIcon, MoveDownIcon, BookOpen, MessageCircleMore } from 'lucide-react';
import Chapters from "./Chapters";
import Comments from "./Comments";
import ListDropdown from "./ListDropdown"
import { fetchOne } from "@/services/mangaService";

interface MangaActionsProps {
  manga: any;
  comments: any;
  userStatus: string;
  importProgress: any;
}

export default function ListContainer({ manga, comments, userStatus, importProgress }: MangaActionsProps) {
    const [page, setPage] = useState("chapters");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [chapters, setChapters] = useState(manga.chapters || []);
    const lastDownloadedRef = useRef<number>(0);

    // Refetch chapters when download progress increases
    useEffect(() => {
        if (importProgress?.status === 'downloading' && importProgress.downloadedChapters > lastDownloadedRef.current) {
            lastDownloadedRef.current = importProgress.downloadedChapters;
            
            // Refetch chapters from API
            fetchOne(manga.id).then((data) => {
                if (data?.manga?.chapters) {
                    setChapters(data.manga.chapters);
                }
            }).catch((err) => {
                console.error('[MangaActions] Failed to refetch chapters:', err);
            });
        }
    }, [importProgress, manga.id]);

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
