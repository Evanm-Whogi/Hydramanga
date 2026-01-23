import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";

interface ContinueReadingCardProps {
    progress: {
        seriesId: number;
        seriesTitle: string;
        seriesCover: any;
        lastChapterId: number;
        chapterNumber: string;
        chapterTitle: string;
        lastPageNumber: number;
        percentageCompleted: number;
        updatedAt: string;
    };
}

export default function ContinueReadingCard({ progress }: ContinueReadingCardProps) {
    const coverUrl = progress.seriesCover?.raw?.url || progress.seriesCover?.x350?.x3 || '/notFound.png';
    const timeAgo = getTimeAgo(new Date(progress.updatedAt));

    return (
        <Link 
            href={`/manga/${progress.seriesId}/read/${progress.lastChapterId}?page=${progress.lastPageNumber}`}
            className="flex flex-col bg-foreground/50 rounded-lg overflow-hidden group">
            <div className="relative aspect-video w-full overflow-hidden">
                <img src={coverUrl} alt={progress.seriesTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
                
                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
                    <div className="w-full bg-black/40 rounded-full h-1.5 mb-2">
                        <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${Math.min(progress.percentageCompleted, 100)}%` }}/>
                    </div>
                    <div className="flex items-center justify-between text-xs text-white">
                        <span className="font-semibold">{progress.percentageCompleted.toFixed(0)}% Complete</span>
                        <div className="flex items-center">
                            <Clock className="size-3 mr-1" />
                            <span>{timeAgo}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3">
                <h3 className="text-sm font-bold text-primary line-clamp-1 mb-1">{progress.seriesTitle}</h3>
                <div className="flex items-center text-xs text-muted">
                    <BookOpen className="size-3 mr-1" />
                    <span>Chapter {progress.chapterNumber}</span>
                    {progress.chapterTitle && (<span className="ml-1 line-clamp-1">: {progress.chapterTitle}</span>)}
                </div>
                <p className="text-xs text-muted mt-1">
                    Page {progress.lastPageNumber}
                </p>
            </div>
        </Link>
    );
}

function getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
