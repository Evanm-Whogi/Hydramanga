"use client"

import { useState, useMemo } from "react";
import Link from "next/link";
import { Eye, BookOpen, Trash2, Clock } from "lucide-react";
import { formatReadingTime, getTimeAgo, getCoverUrl, sortHistoryItems } from "@/lib/historyUtils";
import type { SortOption, HistoryListProps } from "@/types/history";

export default function HistoryList({ items, type, onDelete }: HistoryListProps) {
    const [sortBy, setSortBy] = useState<SortOption>("recent");

    const sortedItems = useMemo(() => {
        return sortHistoryItems(items, sortBy);
    }, [items, sortBy]);

    if (items.length === 0) {
        return (
            <div className="text-center py-12">
                <div className={`mb-4 text-6xl ${type === "reading" ? "text-blue-400" : "text-purple-400"}`}>
                    {type === "reading" ? <BookOpen /> : <Eye />}
                </div>
                <h3 className="text-xl font-semibold text-primary mb-2">No {type === "reading" ? "reading" : "viewing"} history yet</h3>
                <p className="text-muted mb-6">{type === "reading" ? "Start reading manga to build your reading history" : "Browse manga to build your view history"}</p>
                <Link href={type === "reading" ? "/discover" : "/discover"} className="inline-block bg-accent hover:bg-accent/90 text-white px-6 py-2 rounded-lg transition-colors">Explore Manga</Link>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Sort Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 md:gap-0">
                <p className="text-muted text-sm">{items.length} item{items.length !== 1 ? "s" : ""} in history</p>
                <div className="flex gap-2 flex-wrap">
                    {(["recent", "oldest", "title", "progress"] as const).map((option) => (
                        <button
                            key={option}
                            onClick={() => setSortBy(option)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                sortBy === option
                                    ? "bg-accent text-white"
                                    : "bg-foreground text-muted hover:bg-foreground/80"
                            }`}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* History Grid */}
            <div className="space-y-3">
                {sortedItems.map((item) => {
                    const timestamp = item.viewedAt || item.readAt;
                    const timeAgo = timestamp ? getTimeAgo(new Date(timestamp)) : "Unknown";
                    const coverUrl = getCoverUrl(item.seriesCover);

                    return (
                        <div
                            key={`${type}-${item.seriesId}`}
                            className="bg-foreground/50 rounded-lg overflow-hidden border border-borders/30 hover:border-borders/60 transition-colors shadow-md"
                        >
                            <div className="flex items-center gap-4 p-4">
                                <Link href={type === "reading" && item.chapterId ? `/manga/${item.seriesId}/read/${item.chapterId}?page=${item.pageNumber || 1}` : `/manga/${item.seriesId}`} className="shrink-0 w-20 h-28 rounded-lg overflow-hidden group">
                                    <img src={coverUrl} alt={item.seriesTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                                </Link>

                                <div className="grow min-w-0">
                                    <Link href={type === "reading" && item.chapterId ? `/manga/${item.seriesId}/read/${item.chapterId}?page=${item.pageNumber || 1}` : `/manga/${item.seriesId}`} className="text-lg font-bold text-primary hover:text-accent transition-colors line-clamp-2">{item.seriesTitle}</Link>

                                    {type === "reading" && item.chapterNumber && (
                                        <p className="text-sm text-muted mt-1 line-clamp-1">Chapter {item.chapterNumber}{item.chapterTitle && ` - ${item.chapterTitle}`}</p>
                                    )}

                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                                        <Clock className="size-3.5" />
                                        <span>{timeAgo}</span>
                                        {item.readingTimeSeconds && (
                                            <>
                                                <span>|</span>
                                                <span>{formatReadingTime(item.readingTimeSeconds, 'full')}</span>
                                            </>
                                        )}
                                    </div>

                                    {type === "reading" && item.completionPercentage !== undefined && (
                                        <div className="mt-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted">{item.completionPercentage.toFixed(0)}% complete</span>
                                                {item.pageNumber && item.totalPages && (
                                                    <span className="text-xs text-muted">Page {item.pageNumber} / {item.totalPages}</span>
                                                )}
                                            </div>
                                            <div className="bg-background/50 rounded-full h-1.5">
                                                <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${Math.min(item.completionPercentage, 100)}%` }}/>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 shrink-0">
                                    {onDelete && (
                                        <button onClick={() => onDelete(item.seriesId)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors" title="Delete from history">
                                            <Trash2 className="size-5 text-red-500" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
