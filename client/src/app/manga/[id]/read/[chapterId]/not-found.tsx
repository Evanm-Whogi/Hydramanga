"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookX, Home, Library } from "lucide-react";

export default function ChapterNotFound() {
    // Pathname is /manga/[id]/read/[chapterId]; recover the series id so we can
    // send the reader back to the series they were trying to read.
    const pathname = usePathname();
    const mangaId = pathname?.split("/")[2];

    return (
        <div className="min-h-screen flex items-center justify-center bg-background text-primary">
            <div className="container mx-auto px-4">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="relative">
                            <BookX className="size-32 text-accent animate-pulse" />
                            <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
                        </div>
                    </div>

                    <h1 className="text-6xl font-bold mb-3">404</h1>
                    <h2 className="text-3xl font-bold mb-4">Chapter Not Found</h2>
                    <p className="text-lg text-muted mb-8">
                        This chapter is no longer available. It may have been removed or replaced since you last opened it.
                    </p>

                    <div className="flex flex-wrap gap-4 justify-center">
                        {mangaId && (
                            <Link
                                href={`/manga/${mangaId}`}
                                className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold"
                            >
                                <Library className="size-5" />
                                Back to Series
                            </Link>
                        )}
                        <Link
                            href="/discover"
                            className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
                        >
                            <Home className="size-5" />
                            Browse Manga
                        </Link>
                    </div>

                    <p className="text-sm text-muted mt-8">Error Code: CHAPTER_NOT_FOUND</p>
                </div>
            </div>
        </div>
    );
}
