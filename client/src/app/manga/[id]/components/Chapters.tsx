import { formatTimeAgo } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { ClockIcon, CheckIcon, SearchIcon, ChevronDownIcon } from "lucide-react";
import { getSeriesChapterProgress, markChapterAsRead, markChapterAsUnread } from "@/services/mangaService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import Link from "next/link";
import { useUser } from "@/providers/UserProvider";
import { requireAuth } from "@/lib/requireAuth";

type FilterOption = "all" | "unread" | "read";
type SortOption = "chapterNumber" | "uploadDate" | "name";

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "chapterNumber", label: "By Chapter Number" },
    { value: "uploadDate", label: "By Upload Date" },
    { value: "name", label: "By Name" },
];

interface ChapterProgress {
    [chapterId: number]: {
        lastPageNumber: number;
        pageCount: number;
        percentageCompleted: number;
    };
}

interface ChaptersProps {
    manga: any;
    progress?: any;
    maxHeight?: number | null;
}

export default function Chapters({ manga, progress, maxHeight }: ChaptersProps) {
    const { user } = useUser();
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("chapterNumber");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [filter, setFilter] = useState<FilterOption>("all");
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const [chapterProgress, setChapterProgress] = useState<ChapterProgress>({});
    const [isOperating, setIsOperating] = useState(false);
    const [selectModeEnabled, setSelectModeEnabled] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [bulkOperating, setBulkOperating] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    const closeFilterDropdown = useCallback(() => setFilterOpen(false), []);
    const closeSortDropdown = useCallback(() => setSortOpen(false), []);
    useClickOutside(filterRef, closeFilterDropdown, filterOpen);
    useClickOutside(sortRef, closeSortDropdown, sortOpen);

    const rawChapters = manga.chapters || [];

    const fetchProgress = useCallback(async () => {
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
            console.error("Failed to fetch chapter progress:", error);
        }
    }, [manga.id]);

    // Filter by status, then by search, then sort, then paginate
    const chapters = useMemo(() => {
        let list = rawChapters;

        if (filter !== "all") {
            list = list.filter((ch: any) => {
                const progressPct = chapterProgress[ch.id]?.percentageCompleted ?? 0;
                const isRead = progressPct >= 100;
                if (filter === "unread") return !isRead;
                if (filter === "read") return isRead;
                return true;
            });
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter((ch: any) => {
                const title = (ch.title ?? "").toLowerCase();
                const num = (ch.chapterNumber ?? "").toString().toLowerCase();
                return title.includes(q) || num.includes(q);
            });
        }

        const sorted = [...list].sort((a: any, b: any) => {
            let cmp = 0;
            if (sortBy === "chapterNumber") {
                cmp = (a.chapterNumber ?? "").toString().localeCompare((b.chapterNumber ?? "").toString(), undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "uploadDate") {
                const tA = new Date(a.updatedAt ?? 0).getTime();
                const tB = new Date(b.updatedAt ?? 0).getTime();
                cmp = tA - tB;
            } else {
                cmp = (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });
        return sorted;
    }, [rawChapters, filter, searchQuery, sortBy, sortOrder, chapterProgress]);

    const visibleChapters = useMemo(() => {
        return chapters
    }, [chapters]);

    useEffect(() => {
        if (!user) return;
        fetchProgress();
    }, [fetchProgress, user]);
    const toggleSelect = useCallback((chapterId: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(chapterId)) next.delete(chapterId);
            else next.add(chapterId);
            return next;
        });
    }, []);

    const selectAllVisible = useCallback(() => {
        setSelectedIds((prev) => {
            const ids = new Set(visibleChapters.map((ch: any) => ch.id));
            return prev.size === ids.size ? new Set() : ids;
        });
    }, [visibleChapters]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setAnchorIndex(null);
    }, []);

    const exitSelectMode = useCallback(() => {
        setSelectModeEnabled(false);
        clearSelection();
    }, [clearSelection]);

    const handleRowClick = useCallback(
        (e: React.MouseEvent, chapterId: number, index: number) => {
            if (e.shiftKey) {
                if (anchorIndex !== null) {
                    const lo = Math.min(anchorIndex, index);
                    const hi = Math.max(anchorIndex, index);
                    const idsInRange = visibleChapters.slice(lo, hi + 1).map((ch: any) => ch.id);
                    setSelectedIds((prev) => new Set([...prev, ...idsInRange]));
                } else {
                    toggleSelect(chapterId);
                }
                setAnchorIndex(index);
            } else {
                toggleSelect(chapterId);
                setAnchorIndex(index);
            }
        },
        [anchorIndex, visibleChapters, toggleSelect]
    );

    const runBulkAction = useCallback(
        async (
            action: (chapterId: number) => Promise<unknown>,
            successMsg: string,
            errorMsg: string,
            refetch: () => Promise<void>
        ) => {
            if (selectedIds.size === 0 || bulkOperating) return;
            setBulkOperating(true);
            try {
                const results = await Promise.allSettled(Array.from(selectedIds).map(action));
                const failed = results.filter((r) => r.status === "rejected").length;
                await refetch();
                const count = selectedIds.size;
                if (failed === 0) {
                    toast.success(successMsg);
                    clearSelection();
                } else {
                    const firstReject = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
                    if (firstReject) toastApiError(firstReject.reason, errorMsg);
                    else toast.warning(`${count - failed} done, ${failed} failed`);
                }
            } catch (err) {
                toastApiError(err, errorMsg);
            } finally {
                setBulkOperating(false);
            }
        },
        [selectedIds, bulkOperating, clearSelection]
    );

    const handleBulkMarkAsRead = useCallback(
        () =>
            runBulkAction(
                (id) => markChapterAsRead(manga.id, id),
                `${selectedIds.size} chapter(s) marked as read`,
                "Failed to update chapters",
                fetchProgress
            ),
        [manga.id, selectedIds.size, runBulkAction, fetchProgress]
    );

    const handleBulkMarkAsUnread = useCallback(
        () =>
            runBulkAction(
                (id) => markChapterAsUnread(id),
                `${selectedIds.size} chapter(s) marked as unread`,
                "Failed to update chapters",
                fetchProgress
            ),
        [selectedIds.size, runBulkAction, fetchProgress]
    );

    const handleMarkAsRead = useCallback(
        async (e: React.MouseEvent, chapterId: number) => {
            if (!requireAuth(user, `/manga/${manga.id}`)) return;
            if (isOperating) return;
            e.preventDefault();
            e.stopPropagation();
            setIsOperating(true);
            try {
                await markChapterAsRead(manga.id, chapterId);
                toast.success("Chapter marked as read");
                const ch = chapters.find((c: any) => c.id === chapterId);
                const pageCount = ch?.pageCount ?? 0;
                setChapterProgress((prev) => ({
                    ...prev,
                    [chapterId]: { lastPageNumber: pageCount, pageCount, percentageCompleted: 100 },
                }));
            } catch (error) {
                console.error("Failed to mark chapter as read:", error);
            } finally {
                setIsOperating(false);
            }
        },
        [manga.id, chapters, isOperating, user]
    );

    const handleMarkAsUnread = useCallback(
        async (e: React.MouseEvent, chapterId: number) => {
            if (!requireAuth(user, `/manga/${manga.id}`)) return;
            if (isOperating) return;
            e.preventDefault();
            e.stopPropagation();
            setIsOperating(true);
            try {
                await markChapterAsUnread(chapterId);
                toast.success("Chapter marked as unread");
                setChapterProgress((prev) => {
                    const updated = { ...prev };
                    delete updated[chapterId];
                    return updated;
                });
            } catch (error) {
                console.error("Failed to mark chapter as unread:", error);
            } finally {
                setIsOperating(false);
            }
        },
        [isOperating, user, manga.id]
    );

    return (
        <>
        <div className="space-y-4">
            {/* Search and Filter */}
            <div className="flex flex-row flex-wrap place-content-between items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
                    <input
                        type="search"
                        placeholder="Search chapters..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                </div>
                <div className="flex flex-row flex-wrap gap-2 items-center">
                    {user && (
                    <button
                        type="button"
                        onClick={() => (selectModeEnabled ? exitSelectMode() : setSelectModeEnabled(true))}
                        className={`px-4 py-2 rounded-md cursor-pointer transition-colors ${selectModeEnabled ? "bg-accent hover:bg-accent/80 text-white" : "bg-foreground hover:bg-foreground/50"}`}
                    >
                        {selectModeEnabled ? "Done" : "Select Mode"}
                    </button>
                    )}
                    <div ref={filterRef} className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => { setFilterOpen((o) => !o); setSortOpen(false); }}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground hover:bg-foreground/50 rounded-md cursor-pointer"
                        >
                            Filter: {FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "All"}
                            <ChevronDownIcon className={`size-4 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
                        </button>
                        {filterOpen && (
                            <div className="absolute top-full left-0 mt-1 min-w-[140px] bg-foreground rounded-md shadow-xl z-50 border border-white/10 overflow-hidden">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { setFilter(opt.value); setFilterOpen(false); }}
                                        className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${filter === opt.value ? "bg-white/5 text-accent" : ""}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div ref={sortRef} className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => { setSortOpen((o) => !o); setFilterOpen(false); }}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground hover:bg-foreground/50 rounded-md cursor-pointer"
                        >
                            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Sort"}
                            <ChevronDownIcon className={`size-4 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
                        </button>
                        {sortOpen && (
                            <div className="absolute top-full right-0 mt-1 min-w-[180px] bg-foreground rounded-md shadow-xl z-50 border border-white/10 overflow-hidden">
                                {SORT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                                        className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${sortBy === opt.value ? "bg-white/5 text-accent" : ""}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                <div className="h-px bg-white/10" />
                                <button
                                    type="button"
                                    onClick={() => { setSortOrder((o) => (o === "asc" ? "desc" : "asc")); setSortOpen(false); }}
                                    className="block w-full px-4 py-2 text-left hover:bg-white/10 text-sm text-muted"
                                >
                                    Order: {sortOrder === "asc" ? "Ascending" : "Descending"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {progress?.status === "scanning" ? (
                <div className="p-8 text-center bg-foreground rounded-lg">
                    <p className="text-lg text-muted mb-2">Scanning for chapters...</p>
                    <p className="text-sm text-muted/70">Please wait</p>
                </div>
            ) : progress?.status === "downloading" && rawChapters.length === 0 ? (
                <div className="p-8 text-center bg-foreground rounded-lg">
                    <p className="text-lg text-muted mb-2">Downloading chapters...</p>
                    <p className="text-sm text-muted/70">Please wait</p>
                </div>
            ) : rawChapters.length === 0 ? (
                <div className="p-8 text-center bg-foreground rounded-lg">
                    <p className="text-lg text-muted mb-2">Chapters not found</p>
                    <p className="text-sm text-muted/70">Manga not imported, you can request it by clicking{" "}
                        <Link
                            href={`/request?seriesId=${manga.id}${manga.title ? `&title=${encodeURIComponent(manga.title)}` : ""}`}
                            className="text-accent hover:underline"
                        >
                            Here
                        </Link>
                    </p>
                </div>
            ) : visibleChapters.length === 0 ? (
                <div className="p-8 text-center bg-foreground rounded-lg">
                    <p className="text-lg text-muted">No chapters match your search</p>
                </div>
            ) : (
                <>
                </>
            )}

            {selectModeEnabled && (
                <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-foreground/80 rounded-md border border-white/10">
                    <button type="button" onClick={selectAllVisible} className="px-3 py-1.5 rounded bg-background hover:bg-background/80 text-sm">Select all</button>
                    {selectedIds.size > 0 && (
                        <>
                            <button type="button" onClick={handleBulkMarkAsRead} disabled={bulkOperating} className="px-3 py-1.5 rounded bg-background hover:bg-background/80 text-sm disabled:opacity-50">Mark as Read</button>
                            <button type="button" onClick={handleBulkMarkAsUnread} disabled={bulkOperating} className="px-3 py-1.5 rounded bg-background hover:bg-background/80 text-sm disabled:opacity-50">Mark Unread</button>
                            <button type="button" onClick={clearSelection} className="px-3 py-1.5 rounded bg-background/50 hover:bg-background/80 text-sm text-muted">Clear</button>
                            <span className="text-sm text-muted shrink-0">{selectedIds.size} selected</span>
                        </>
                    )}
                </div>
            )}



            {/* Chapters list*/}
            <div
                id="chapters-scroll"
                className={maxHeight ? "mt-4 overflow-y-auto" : "mt-4 max-h-[1200px] overflow-y-auto"}
                style={maxHeight ? { maxHeight } : undefined}
            >
                <div className="grid gap-3">
                {visibleChapters.map((chapter: any, index: number) => {
                    const progress = chapterProgress[chapter.id];
                    const progressPercentage = progress?.percentageCompleted || 0;
                    const lastPageNumber = progress?.lastPageNumber || 0;
                    const totalPages = chapter.pageCount || 0;
                    const hasProgress = !!progress && progressPercentage > 0 && progressPercentage < 100;
                    const isFullyRead = progressPercentage >= 100;
                    const resumePage = hasProgress && !isFullyRead ? Math.max(1, lastPageNumber) : 1;
                    const href = `/manga/${manga.id}/read/${chapter.id}${hasProgress && !isFullyRead ? `?page=${resumePage}` : ''}`;
                    const isSelected = selectedIds.has(chapter.id);

                    return (
                        <div
                            key={chapter.id}
                            role={selectModeEnabled ? "button" : undefined}
                            tabIndex={selectModeEnabled ? 0 : undefined}
                            onClick={(e) => {
                                if (selectModeEnabled) {
                                    e.preventDefault();
                                    handleRowClick(e, chapter.id, index);
                                }
                            }}
                            onKeyDown={selectModeEnabled ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleRowClick(e as unknown as React.MouseEvent, chapter.id, index);
                                }
                            } : undefined}
                            className={`p-3 w-full rounded-md transition-colors flex gap-3 items-center ${selectModeEnabled ? "cursor-pointer select-none" : ""} ${selectModeEnabled && isSelected ? "bg-accent/50" : "bg-foreground hover:bg-foreground/50"} ${isFullyRead && !selectModeEnabled ? "opacity-50" : ""}`}
                        >
                            <Link
                                href={href}
                                className="flex-1 min-w-0"
                                onClick={(e) => {
                                    if (selectModeEnabled) {
                                        e.preventDefault();
                                        return;
                                    }
                                    if (!user) {
                                        e.preventDefault();
                                        requireAuth(user, href);
                                    }
                                }}
                            >
                            <div className="flex justify-between items-center">
                                <div className="flex-1 min-w-0">
                                    <div className={`flex items-center gap-2`}>
                                        <h1 className={`text-xl line-clamp-2 ${isFullyRead ? 'text-muted' : ''}`}>{chapter.title}</h1>
                                        {isFullyRead && <CheckIcon className={`inline-block size-5 text-green-500 shrink-0`} />}
                                    </div>
                                    <div className="flex flex-wrap gap-2 md:gap-4 text-sm text-muted">
                                        <h2 className="items-center"><ClockIcon className="inline-block mr-1 size-3 mb-0.5" />{formatTimeAgo(chapter.updatedAt)}</h2>
                                        <h2>{chapter.pageCount} Pages</h2>
                                        <h2>{chapter.viewStats?.totalViews ?? 0} Views</h2>
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
                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); isFullyRead ? handleMarkAsUnread(e, chapter.id) : handleMarkAsRead(e, chapter.id); }} disabled={isOperating} className="hover:cursor-pointer px-4 py-2 bg-background hover:bg-background/50 rounded-lg text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
                                        {isFullyRead ? "Mark Unread" : "Mark as Read"}
                                    </button>
                                </div>
                            </div>
                            </Link>
                        </div>
                    )
                })}
                </div>
            </div>
        </div>
        </>
    )
}