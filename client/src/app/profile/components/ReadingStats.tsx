"use client";
import { useEffect, useState } from "react";
import { getUserStats, getMyProgress } from "@/services/mangaService";
import { BookOpen, TrendingUp, Target } from "lucide-react";
import ContinueReadingCard from "@/components/ContinueReadingCard";

export default function ReadingStats() {
    const [stats, setStats] = useState<any>(null);
    const [progress, setProgress] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsData, progressData] = await Promise.all([
                    getUserStats(),
                    getMyProgress(6)
                ]);
                setStats(statsData.stats);
                setProgress(progressData.progress || []);
            } catch (error) {
                console.error('Failed to fetch reading stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="bg-foreground rounded-lg p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-background rounded w-1/3"></div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-20 bg-background rounded"></div>
                        <div className="h-20 bg-background rounded"></div>
                        <div className="h-20 bg-background rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-6">
            {/* Reading Statistics */}
            <div className="bg-foreground rounded-lg p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Reading Statistics</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-background rounded-lg p-4 flex items-start">
                        <div className="bg-accent/20 rounded-lg p-3 mr-4">
                            <BookOpen className="size-6 text-accent" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">
                                {stats.totalSeriesReading || 0}
                            </p>
                            <p className="text-sm text-muted">Series Reading</p>
                        </div>
                    </div>

                    <div className="bg-background rounded-lg p-4 flex items-start">
                        <div className="bg-blue-500/20 rounded-lg p-3 mr-4">
                            <TrendingUp className="size-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">
                                {Math.round(stats.averageCompletion || 0)}%
                            </p>
                            <p className="text-sm text-muted">Avg. Completion</p>
                        </div>
                    </div>

                    <div className="bg-background rounded-lg p-4 flex items-start">
                        <div className="bg-green-500/20 rounded-lg p-3 mr-4">
                            <Target className="size-6 text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary">
                                {formatNumber(stats.totalPagesRead || 0)}
                            </p>
                            <p className="text-sm text-muted">Pages Read</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Continue Reading */}
            {progress.length > 0 && (
                <div className="bg-foreground rounded-lg p-6">
                    <h3 className="text-xl font-bold text-primary mb-4">Continue Reading</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {progress.map((item) => (
                            <ContinueReadingCard key={item.seriesId} progress={item} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
