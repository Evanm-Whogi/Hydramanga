"use client"

import { BookOpen, Eye, Zap, TrendingUp } from "lucide-react";
import { formatReadingTime, getTimeAgo } from "@/lib/historyUtils";
import type { HistoryStatsProps } from "@/types/history";

export default function HistoryStats({
    readingHistoryCount,
    viewHistoryCount,
    totalReadingTime = 0,
    mostRecentReading,
}: HistoryStatsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 hover:border-borders/60 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted">Reading History</h3>
                    <BookOpen className="size-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-primary">{readingHistoryCount}</p>
                <p className="text-xs text-muted mt-1">Manga in reading history</p>
            </div>

            {/* View History */}
            <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 hover:border-borders/60 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted">View History</h3>
                    <Eye className="size-5 text-purple-400" />
                </div>
                <p className="text-3xl font-bold text-primary">{viewHistoryCount}</p>
                <p className="text-xs text-muted mt-1">Manga viewed</p>
            </div>

            {/* Total Reading Time */}
            <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 hover:border-borders/60 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted">Reading Time</h3>
                    <Zap className="size-5 text-yellow-400" />
                </div>
                <p className="text-3xl font-bold text-primary">{totalReadingTime > 0 ? formatReadingTime(totalReadingTime) : "—"}</p>
                <p className="text-xs text-muted mt-1">Total reading time</p>
            </div>

            {/* Most Recent */}
            <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 hover:border-borders/60 transition-colors">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted">Latest Activity</h3>
                    <TrendingUp className="size-5 text-green-400" />
                </div>
                <p className="text-2xl font-bold text-primary">{mostRecentReading ? getTimeAgo(new Date(mostRecentReading)) : "—"}</p>
                <p className="text-xs text-muted mt-1">Most recent activity</p>
            </div>
        </div>
    );
}
