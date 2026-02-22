import { formatTimeAgo } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { ClockIcon, CheckIcon, BookmarkIcon, SearchIcon, ArrowUpDown } from "lucide-react";
import { getSeriesChapterProgress, markChapterAsRead, markChapterAsUnread } from "@/services/mangaService";
import { getSeriesBookmarks, removeBookmark } from "@/services/bookmarkService";
import BookmarkModal from "@/components/BookmarkModal";
import { toast } from "react-toastify";
import { trackBookmarkAction } from "@/lib/analytics";
import Link from "next/link";

const CHAPTERS_PER_PAGE = 24;

interface ChapterProgress {
    [chapterId: number]: {
        lastPageNumber: number;
        pageCount: number;
        percentageCompleted: number;
    };
}

interface BookmarkData {
    [chapterId: number]: {
        id: number;
        note?: string;
        createdAt: string;
    };
}

export default function Chapters({ manga, progress }: { manga: any; progress?: any }) {
    const [showAll, setShowAll] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [chapterProgress, setChapterProgress] = useState<ChapterProgress>({});
    const [bookmarks, setBookmarks] = useState<BookmarkData>({});
    const [bookmarkModal, setBookmarkModal] = useState({ isOpen: false, chapterId: 0 });
    const [isOperating, setIsOperating] = useState(false);
    
    const rawChapters = manga.chapters || [];
    
    // Sort by chapter number, then filter by search, then paginate
    const chapters = useMemo(() => {
        const sorted = [...rawChapters].sort((a: any, b: any) => {
            const order = (a.chapterNumber ?? "").toString().localeCompare((b.chapterNumber ?? "").toString(), undefined, { numeric: true, sensitivity: "base" });
            return sortOrder === "asc" ? order : -order;
        });
        if (!searchQuery.trim()) return sorted;
        const q = searchQuery.trim().toLowerCase();
        return sorted.filter((ch: any) => {
            const title = (ch.title ?? "").toLowerCase();
            const num = (ch.chapterNumber ?? "").toString().toLowerCase();
            return title.includes(q) || num.includes(q);
        });
    }, [rawChapters, sortOrder, searchQuery]);
    
    const visibleChapters = useMemo(() => {
        return showAll ? chapters : chapters.slice(0, CHAPTERS_PER_PAGE);
    }, [chapters, showAll]);
    
    const hasMore = !showAll && chapters.length > CHAPTERS_PER_PAGE;

    // Fetch per-chapter reading progress for this manga series
    useEffect(() => {
        const fetchProgress = async () => {
            try {
                const response = await getSeriesChapterProgress(manga.id);
                if (response?.chapters && Array.isArray(response.chapters)) {
                    const progressMap: ChapterProgress = {};
                    response.chapters.forEach((ch: any) => {
                        progressMap[ch.chapterId] = {
                            lastPageNumber: ch.lastPageNumber,
                            pageCount: ch.pageCount || 0,
                            percentageCompleted: ch.percentageCompleted || 0,
                        };
                    });
                    setChapterProgress(progressMap);
                }
            } catch (error) {
                console.error('Failed to fetch chapter progress:', error);
            }
        };
        
        fetchProgress();
    }, [manga.id]);

    // Fetch bookmarks for this series
    useEffect(() => {
        const fetchBookmarks = async () => {
            try {
                const response = await getSeriesBookmarks(manga.id);
                if (response?.bookmarks && Array.isArray(response.bookmarks)) {
                    const bookmarkMap: BookmarkData = {};
                    response.bookmarks.forEach((b: any) => {
                        bookmarkMap[b.chapterId] = {
                            id: b.id,
                            note: b.note,
                            createdAt: b.createdAt,
                        };
                    });
                    setBookmarks(bookmarkMap);
                }
            } catch (error) {
                console.error('Failed to fetch bookmarks:', error);
            }
        };
        
        fetchBookmarks();
    }, [manga.id]);

    const handleMarkAsRead = async (e: React.MouseEvent, chapterId: number) => {
        if (isOperating) return;
        e.preventDefault();
        e.stopPropagation();
        
        setIsOperating(true);
        try {
            await markChapterAsRead(manga.id, chapterId);
            toast.success('Chapter marked as read');
            
            // Update local state to reflect the change
            setChapterProgress(prev => ({
                ...prev,
                [chapterId]: {
                    lastPageNumber: chapters.find((ch: any) => ch.id === chapterId)?.pageCount || 0,
                    pageCount: chapters.find((ch: any) => ch.id === chapterId)?.pageCount || 0,
                    percentageCompleted: 100,
                },
            }));
        } catch (error) {
            console.error('Failed to mark chapter as read:', error);
        } finally {
            setIsOperating(false);
        }
    };

    const handleMarkAsUnread = async (e: React.MouseEvent, chapterId: number) => {
        if (isOperating) return;
        e.preventDefault();
        e.stopPropagation();
        
        setIsOperating(true);
        try {
            await markChapterAsUnread(chapterId);
            
            // Remove from local state
            setChapterProgress(prev => {
                const updated = { ...prev };
                delete updated[chapterId];
                return updated;
            });
        } catch (error) {
            console.error('Failed to mark chapter as unread:', error);
        } finally {
            setIsOperating(false);
        }
    };

    const handleBookmarkClick = (e: React.MouseEvent, chapterId: number) => {
        e.preventDefault();
        e.stopPropagation();
        setBookmarkModal({ isOpen: true, chapterId });
    };

    const handleRemoveBookmark = async (e: React.MouseEvent, chapterId: number) => {
        if (isOperating) return;
        e.preventDefault();
        e.stopPropagation();
        
        setIsOperating(true);
        const chapter = chapters.find((ch: any) => ch.id === chapterId);
        const note = bookmarks[chapterId]?.note;
        try {
            await removeBookmark(manga.id, chapterId);
            setBookmarks(prev => {
                const updated = { ...prev };
                delete updated[chapterId];
                return updated;
            });
            trackBookmarkAction('removed', manga.id.toString(), manga.title, chapterId.toString(), chapter?.chapterNumber, note);
        } catch (error) {
            console.error('Failed to remove bookmark:', error);
        } finally {
            setIsOperating(false);
        }
    };

    const handleBookmarkSuccess = () => {
        // Refetch bookmarks to update UI
        const fetchBookmarks = async () => {
            try {
                const response = await getSeriesBookmarks(manga.id);
                if (response?.bookmarks && Array.isArray(response.bookmarks)) {
                    const bookmarkMap: BookmarkData = {};
                    response.bookmarks.forEach((b: any) => {
                        bookmarkMap[b.chapterId] = {
                            id: b.id,
                            note: b.note,
                            createdAt: b.createdAt,
                        };
                    });
                    setBookmarks(bookmarkMap);
                }
            } catch (error) {
                console.error('Failed to fetch bookmarks:', error);
            }
        };
        
        fetchBookmarks();
    };
    
    return (
        <>
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mt-4">
                {progress?.status === 'scanning' ? (
                    <div className="p-8 text-center bg-foreground rounded-lg">
                        <p className="text-lg text-muted mb-2">Scanning for chapters...</p>
                        <p className="text-sm text-muted/70">Please wait</p>
                    </div>
                ) : progress?.status === 'downloading' && rawChapters.length === 0 ? (
                    <div className="p-8 text-center bg-foreground rounded-lg">
                        <p className="text-lg text-muted mb-2">Downloading chapters...</p>
                        <p className="text-sm text-muted/70">Please wait</p>
                    </div>
                ) : rawChapters.length === 0 ? (
                    <div className="p-8 text-center bg-foreground rounded-lg">
                        <p className="text-lg text-muted mb-2">Chapters not found</p>
                        <p className="text-sm text-muted/70">No Scrapers Available</p>
                    </div>
                ) : (
                    <>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
                            <input
                                type="search"
                                placeholder="Search chapters..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>
                        <button
                            onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground hover:bg-foreground/50 hover:cursor-pointer rounded-md shrink-0"
                            title={sortOrder === "asc" ? "Newest first" : "Oldest first"}
                        >
                            <ArrowUpDown className="size-5" /> Order
                        </button>
                    </div>
                    {visibleChapters.length === 0 ? (
                        <div className="p-8 text-center bg-foreground rounded-lg">
                            <p className="text-lg text-muted">No chapters match your search</p>
                        </div>
                    ) : visibleChapters.map((chapter: any) => {
                    const progress = chapterProgress[chapter.id];
                    const progressPercentage = progress?.percentageCompleted || 0;
                    const lastPageNumber = progress?.lastPageNumber || 0;
                    const totalPages = chapter.pageCount || 0;
                    const hasProgress = !!progress && progressPercentage > 0 && progressPercentage < 100;
                    const isFullyRead = progressPercentage >= 100;
                    const resumePage = hasProgress && !isFullyRead ? Math.max(1, lastPageNumber) : 1;
                    const isBookmarked = !!bookmarks[chapter.id];
                    const href = `/manga/${manga.id}/read/${chapter.id}${hasProgress && !isFullyRead ? `?page=${resumePage}` : ''}`;
                    
                    return (
                    <Link href={href} key={chapter.id} className={`p-3 w-full bg-foreground hover:bg-foreground/50 cursor-pointer rounded-md transition-colors ${isFullyRead ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                            <div className="flex-1">
                                <div className={`flex items-center gap-2`}>
                                    <h1 className={`text-xl line-clamp-2 ${isFullyRead ? 'text-muted' : ''}`}>{chapter.title}</h1>
                                    {isFullyRead && <CheckIcon className={`inline-block size-5 text-green-500 shrink-0`} />}
                                    {isBookmarked && (
                                        <span title={bookmarks[chapter.id]?.note || 'Bookmarked'}>
                                            <BookmarkIcon className={`inline-block size-5 text-accent fill-accent shrink-0`} />
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 md:gap-4 text-sm text-muted">
                                    <h2 className="items-center"><ClockIcon className="inline-block mr-1 size-3 mb-0.5" />{formatTimeAgo(chapter.updatedAt)}</h2>
                                    <h2>{chapter.pageCount} Pages</h2>
                                    <h2>{chapter.viewStats.totalViews} Views</h2>
                                    <h2 className="hidden md:flex">ID: {chapter?.scraperId?.slice(0,3)}</h2>
                                </div>

                                {/* Read Progress bar - only show if user has started reading and not finished */}
                                {hasProgress && (
                                    <div className="mt-2 space-y-1">
                                        <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                                            <div 
                                                className="h-full bg-accent transition-all duration-300" 
                                                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted">
                                            {isFullyRead ? 'Completed' : `Page ${lastPageNumber} of ${totalPages}`}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="ml-4 shrink-0 flex flex-col gap-2">
                                <button onClick={(e) => isFullyRead ? handleMarkAsUnread(e, chapter.id) : handleMarkAsRead(e, chapter.id)} disabled={isOperating} className="hover:cursor-pointer px-4 py-2 bg-background hover:bg-background/50 rounded-lg text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
                                    {isFullyRead ? 'Mark Unread' : 'Mark as Read'}
                                </button>

                                <button onClick={(e) => isBookmarked ? handleRemoveBookmark(e, chapter.id) : handleBookmarkClick(e, chapter.id)} disabled={isOperating} className="px-4 py-2 bg-background hover:bg-background/50 rounded-lg text-xs whitespace-nowrap hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                                    {isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
                                </button>

                            </div>
                        </div>
                    </Link>
                    );
                })}
                    </>
                )}
            </div>
            
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button onClick={() => setShowAll(true)} className="hover:cursor-pointer px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold">Show All ({chapters.length} chapters)
                    </button>
                </div>
            )}
        </div>

        <BookmarkModal
            isOpen={bookmarkModal.isOpen}
            onClose={() => setBookmarkModal({ isOpen: false, chapterId: 0 })}
            seriesId={manga.id}
            chapterId={bookmarkModal.chapterId}
            chapterTitle={chapters.find((ch: any) => ch.id === bookmarkModal.chapterId)?.title}
            existingNote={bookmarks[bookmarkModal.chapterId]?.note || ''}
            onSuccess={handleBookmarkSuccess}
            mangaTitle={manga.title}
            chapterNumber={chapters.find((ch: any) => ch.id === bookmarkModal.chapterId)?.chapterNumber}
        />
        </>
    )
}