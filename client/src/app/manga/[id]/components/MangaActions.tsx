"use client";
import { useState } from "react";
import { BookOpen, MessageCircleMore, ImagesIcon, StarIcon } from "lucide-react";
import Chapters from "./Chapters";
import Comments from "./Comments";
import Gallery from "./Gallery";
import Reviews from "./Reviews";
import BookmarkDropdown from "./BookmarkDropdown";
import AddToListDropdown from "./AddToListDropdown";
import { useUser } from "@/providers/UserProvider";

type MangaActionsPage = "chapters" | "comments" | "reviews" | "gallery";

interface MangaActionsProps {
    manga: any;
    chapters: any[];
    comments: any;
    commentPagination?: { page: number; limit: number; total: number; hasMore: boolean };
    gallery: any[];
    initialBookmarkStatus: BookmarkStatus | string | null;
    importProgress: any;
    chaptersMaxHeight?: number | null;
}

import { BookmarkStatus } from '@/services/bookmarkService';

export default function MangaActions({ manga, chapters, comments, commentPagination, gallery, initialBookmarkStatus, importProgress, chaptersMaxHeight }: MangaActionsProps) {
    const [page, setPage] = useState<MangaActionsPage>("chapters");
    const { user } = useUser();

    return (
        <>
        <div className="flex flex-col gap-4 pt-10 w-full min-w-0 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between">
            <div className="flex justify-start gap-3 flex-wrap shrink-0">
                {user && <BookmarkDropdown seriesId={manga.id} initialStatus={initialBookmarkStatus} mangaTitle={manga.title} />}
                {user && <AddToListDropdown seriesId={manga.id} mangaTitle={manga.title} />}
            </div>

            <div className="flex flex-row flex-wrap gap-2 min-w-0">
                <button onClick={() => setPage("chapters")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all shadow-md ${page === "chapters" ? "text-primary" : "text-muted"}`}>
                    <BookOpen className="size-6 mr-1 transition-colors" /> Chapters
                </button>
                <button onClick={() => setPage("comments")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all shadow-md ${page === "comments" ? "text-primary" : "text-muted"}`}>
                    <MessageCircleMore className="size-6 mr-1 transition-colors" /> Comments
                </button>
                <button onClick={() => setPage("reviews")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all shadow-md ${page === "reviews" ? "text-primary" : "text-muted"}`}>
                    <StarIcon className="size-6 mr-1 transition-colors" /> Reviews
                </button>
                <button onClick={() => setPage("gallery")} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none transition-all shadow-md ${page === "gallery" ? "text-primary" : "text-muted"}`}>
                    <ImagesIcon className="size-6 mr-1 transition-colors" /> Gallery
                </button>
            </div>
        </div>

        <div className="flex flex-col pt-2 gap-2">
            {page === "chapters" && <Chapters manga={{ ...manga, chapters }} progress={importProgress} maxHeight={chaptersMaxHeight} />}
            {page === "comments" && <Comments manga={manga} comments={comments} commentPagination={commentPagination} />}
            {page === "reviews" && <Reviews seriesId={manga.id} />}
            {page === "gallery" && <Gallery gallery={gallery} mangaTitle={manga.title} />}
        </div>
        </>
    )

}
