"use client";
import { useState } from "react";
import { BookOpen, MessageCircleMore, ImagesIcon, StarIcon } from "lucide-react";
import Chapters from "./Chapters";
import Comments from "./Comments";
import Gallery from "./Gallery";
import Reviews from "./Reviews";
import ListDropdown from "./ListDropdown";
import { useUser } from "@/providers/UserProvider";

type MangaActionsPage = "chapters" | "comments" | "reviews" | "gallery";

interface MangaActionsProps {
    manga: any;
    chapters: any[];
    comments: any;
    gallery: any[];
    initialListName: string | null;
    importProgress: any;
    chaptersMaxHeight?: number | null;
}

export default function MangaActions({ manga, chapters, comments, gallery, initialListName, importProgress, chaptersMaxHeight }: MangaActionsProps) {
    const [page, setPage] = useState<MangaActionsPage>("chapters");
    const { user } = useUser();

    return (
        <>
        <div className="grid grid-cols-1 xl:grid-cols-3 w-full pt-10 items-center space-y-4 xl:space-y-0">

            <div className="flex justify-start">
                {user && <ListDropdown seriesId={manga.id} initialListName={initialListName} mangaTitle={manga.title} />}
            </div>

            <div className="flex flex-col xl:flex-row justify-end gap-2 my-5 md:my-0">
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

            <div className="flex justify-end" />
        </div>

        <div className="flex flex-col pt-2 gap-2">
            {page === "chapters" && <Chapters manga={{ ...manga, chapters }} progress={importProgress} maxHeight={chaptersMaxHeight} />}
            {page === "comments" && <Comments manga={manga} comments={comments} />}
            {page === "reviews" && <Reviews seriesId={manga.id} />}
            {page === "gallery" && <Gallery gallery={gallery} mangaTitle={manga.title} />}
        </div>
        </>
    )

}
