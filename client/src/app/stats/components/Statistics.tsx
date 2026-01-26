import { BookOpen, Target, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function Statistics({ mangaStats }: { mangaStats: any }) {
    const stats = mangaStats.stats;

    const minMinutes = Math.min(...stats.readingTimes.map((m: any) => m.totalSeconds / 60));
    const maxMinutes = Math.max(...stats.readingTimes.map((m: any) => m.totalSeconds / 60));

    function getWidth(totalSeconds: number) {
        const minutes = totalSeconds / 60;
        if (maxMinutes === minMinutes) return '100%';
        const normalized = (minutes - minMinutes) / (maxMinutes - minMinutes);
        const minWidth = 20; // percent
        const maxWidth = 100; // percent
        const width = minWidth + normalized * (maxWidth - minWidth);
        return `${width}%`;
    }

    // Convert seconds to hours, minutes format
    function formatTime(seconds: number) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}H ${minutes}M`;
    }

    // Sort readingTimes descending by totalSeconds
    const sortedReadingTimes = [...stats.readingTimes].sort((a, b) => b.totalSeconds - a.totalSeconds);

    // Combine time for all manga
    const totalSeconds = sortedReadingTimes.reduce((acc: number, manga: { totalSeconds: number }) => acc + Number(manga.totalSeconds || 0),0);

    return (
        <>
        <div className="flex place-content-between gap-12">
            <div className="bg-foreground rounded-lg p-4 flex items-start w-1/3">
                <div className="bg-accent/20 rounded-lg p-3 mr-4"><BookOpen className="size-6 text-accent" /></div>
                <div>
                    <p className="text-2xl font-bold text-primary">{mangaStats.stats.totalSeriesReading}</p>
                    <p className="text-sm text-muted">Series Read</p>
                </div>
            </div>
            <div className="bg-foreground rounded-lg p-4 flex items-start w-1/3">
                <div className="bg-accent/20 rounded-lg p-3 mr-4"><TrendingUp className="size-6 text-accent" /></div>
                <div>
                    <p className="text-2xl font-bold text-primary">{mangaStats.stats.averageCompletion.toFixed(0)}%</p>
                    <p className="text-sm text-muted">Average Completion</p>
                </div>
            </div>
            <div className="bg-foreground rounded-lg p-4 flex items-start w-1/3">
                <div className="bg-accent/20 rounded-lg p-3 mr-4"><Target className="size-6 text-accent" /></div>
                <div>
                    <p className="text-2xl font-bold text-primary">{mangaStats.stats.totalPagesRead}</p>
                    <p className="text-sm text-muted">Pages Read</p>
                </div>
            </div>
        </div>
        <div className="flex flex-col w-full bg-foreground rounded-md p-8">
            <h1 className="text-primary font-bold text-4xl">{formatTime(totalSeconds)}</h1>
            <span className="text-muted">Reading time calculated since Register</span>
            <div className="mt-8">
                {sortedReadingTimes.map((manga: any) => (
                    <Link href={`/manga/${manga.seriesId}`} key={manga.title} className="flex flex-row items-center space-x-3 mb-2">
                        <div className="bg-background rounded-md flex justify-end items-center" style={{ width: getWidth(manga.totalSeconds), transition: 'width 0.3s' }}>
                            <img src={manga.image.raw.url} alt={manga.title} className="w-24 h-32 object-cover rounded-md"/>
                        </div>
                        <div className="flex flex-col space-y-1">
                            <h1>{manga.title}</h1>
                            <span className="text-muted w-24">{formatTime(manga.totalSeconds)}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
        </>
    )
}