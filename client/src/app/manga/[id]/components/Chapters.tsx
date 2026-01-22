import { formatDate } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { ClockIcon, CheckIcon } from "lucide-react";
import { getSeriesChapterProgress, markChapterAsRead, markChapterAsUnread } from "@/services/mangaService";

const CHAPTERS_PER_PAGE = 24;

interface ChapterProgress {
    [chapterId: number]: {
        lastPageNumber: number;
        pageCount: number;
        percentageCompleted: number;
    };
}

export default function Chapters({ manga }: { manga: any }) {
    const [showAll, setShowAll] = useState(false);
    const [chapterProgress, setChapterProgress] = useState<ChapterProgress>({});
    
    // Use chapters as-is (already sorted by parent component)
    const chapters = manga.chapters || [];
    
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

    const handleMarkAsRead = async (e: React.MouseEvent, chapterId: number) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
            await markChapterAsRead(manga.id, chapterId);
            
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
        }
    };

    const handleMarkAsUnread = async (e: React.MouseEvent, chapterId: number) => {
        e.preventDefault();
        e.stopPropagation();
        
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
        }
    };

    console.log(manga)

    return (
        <>
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mt-4">
                {visibleChapters.map((chapter: any) => {
                    const progress = chapterProgress[chapter.id];
                    const progressPercentage = progress?.percentageCompleted || 0;
                    const lastPageNumber = progress?.lastPageNumber || 0;
                    const totalPages = chapter.pageCount || 0;
                    const hasProgress = !!progress && progressPercentage > 0 && progressPercentage < 100;
                    const isFullyRead = progressPercentage >= 100;
                    const resumePage = hasProgress && !isFullyRead ? Math.max(1, lastPageNumber) : 1;
                    const href = `/manga/${manga.id}/read/${chapter.id}${hasProgress && !isFullyRead ? `?page=${resumePage}` : ''}`;
                    
                    return (
                    <a 
                        href={href}
                        key={chapter.id} 
                        className={`p-3 w-full bg-foreground hover:bg-foreground/50 cursor-pointer rounded-md transition-colors ${isFullyRead ? 'opacity-50' : ''}`}
                    >
                        <div className="flex justify-between items-center">
                            <div className="flex-1">
                                <div className={`flex items-center`}>
                                    <h1 className={`text-xl line-clamp-2 ${isFullyRead ? 'text-muted' : ''}`}>{chapter.title}</h1>
                                    {isFullyRead && <CheckIcon className={`inline-block ml-2 size-5 mb-0.5 text-green-500`} />}
                                </div>
                                <div className="flex gap-4 text-sm text-muted">
                                    <h2 className="items-center"><ClockIcon className="inline-block mr-1 size-3 mb-0.5" />{formatDate(chapter.updatedAt, true)}</h2>
                                    <h2>{chapter.pageCount} Pages</h2>
                                    <h2>{chapter.viewStats.totalViews} Views</h2>
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
                            <div className="ml-4 shrink-0">
                                <button 
                                    onClick={(e) => isFullyRead ? handleMarkAsUnread(e, chapter.id) : handleMarkAsRead(e, chapter.id)}
                                    className="px-4 py-2 bg-background hover:bg-background/50 rounded-lg text-xs"
                                >
                                    {isFullyRead ? 'Mark Unread' : 'Mark as Read'}
                                </button>
                            </div>
                        </div>
                    </a>
                    );
                })}
            </div>
            
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button onClick={() => setShowAll(true)} className="hover:cursor-pointer px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold">Show All ({chapters.length} chapters)
                    </button>
                </div>
            )}
        </div>
        </>
    )
}