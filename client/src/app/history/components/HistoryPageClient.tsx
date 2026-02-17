'use client'

import { useState, useMemo, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HistoryStats from './HistoryStats';
import HistoryList from './HistoryList';
import { deleteProgress, clearAllProgress, deleteViewHistory, clearAllViewHistory } from '@/services/mangaService';
import { BookOpen, Eye, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import type { HistoryItem, HistoryPageClientProps } from '@/types/history';

export default function HistoryPageClient({initialReadingHistory, initialViewHistory, stats}: HistoryPageClientProps) {
    const [readingHistory, setReadingHistory] = useState<HistoryItem[]>(initialReadingHistory);
    const [viewHistory, setViewHistory] = useState<HistoryItem[]>(initialViewHistory);
    const [activeTab, setActiveTab] = useState<'reading' | 'viewed'>('reading');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showClearConfirm) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                setShowClearConfirm(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showClearConfirm]);

    const handleDeleteHistory = async (seriesId: number, type: 'reading' | 'viewed' = 'reading') => {
        if (isDeleting) return;
        setIsDeleting(true);

        try {
            if (type === 'reading') {
                await deleteProgress(seriesId);
                setReadingHistory((prev) => prev.filter((item) => item.seriesId !== seriesId));
            } else {
                await deleteViewHistory(seriesId);
                setViewHistory((prev) => prev.filter((item) => item.seriesId !== seriesId));
            }
            toast.success('History deleted successfully');
        } catch (error) {
            console.error('Failed to delete history:', error);
            toast.error('Failed to delete history');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleClearAllHistory = async () => {
        if (isClearing) return;
        setIsClearing(true);

        try {
            if (activeTab === 'reading') {
                await clearAllProgress();
                setReadingHistory([]);
            } else {
                await clearAllViewHistory();
                setViewHistory([]);
            }
            setShowClearConfirm(false);
            const historyType = activeTab === 'reading' ? 'reading' : 'view';
            toast.success(`All ${historyType} history cleared`);
        } catch (error) {
            console.error('Failed to clear history:', error);
            toast.error('Failed to clear history');
        } finally {
            setIsClearing(false);
        }
    };

    const totalReadingTime = useMemo(() => {
        if (stats?.stats?.readingTimes) {
            return stats.stats.readingTimes.reduce((sum: number, manga: any) => {
                const seconds = typeof manga.totalSeconds === 'string' 
                    ? parseInt(manga.totalSeconds, 10) 
                    : Number(manga.totalSeconds);
                return sum + (Number.isFinite(seconds) ? seconds : 0);
            }, 0);
        }
        return readingHistory.reduce((sum: number, item: HistoryItem) => sum + (item.readingTimeSeconds || 0), 0);
    }, [stats?.stats?.readingTimes, readingHistory]);

    const mostRecentReading = useMemo(() => {
        const readingDate = readingHistory[0]?.readAt || readingHistory[0]?.viewedAt;
        const viewDate = viewHistory[0]?.viewedAt;
        
        if (!readingDate && !viewDate) return null;
        if (!readingDate) return viewDate;
        if (!viewDate) return readingDate;
        
        return new Date(readingDate) > new Date(viewDate) ? readingDate : viewDate;
    }, [readingHistory, viewHistory]);

    return (
        <>
            <HistoryStats readingHistoryCount={readingHistory.length} viewHistoryCount={viewHistory.length} totalReadingTime={totalReadingTime} mostRecentReading={mostRecentReading || undefined}/>
            
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'reading' | 'viewed')} className="w-full">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <TabsList className="grid w-full grid-cols-2 bg-foreground/50 rounded-lg border border-borders/30 max-w-md ">
                        <TabsTrigger value="reading" className="flex items-center gap-2 data-[state=active]:bg-accent data-[state=active]:text-white transition-colors">
                            <BookOpen className="size-4" />
                            Reading History ({readingHistory.length})
                        </TabsTrigger>
                        <TabsTrigger value="viewed" className="flex items-center gap-2 data-[state=active]:bg-accent data-[state=active]:text-white transition-colors">
                            <Eye className="size-4" />
                            View History ({viewHistory.length})
                        </TabsTrigger>
                    </TabsList>

                    {((activeTab === 'reading' && readingHistory.length > 0) || (activeTab === 'viewed' && viewHistory.length > 0)) && (
                        <div className="relative">
                            <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/30 hover:border-red-500/60">
                                <Trash2 className="size-4" />
                                Clear All
                            </button>

                            {showClearConfirm && (
                                <div ref={modalRef} className="absolute right-0 top-full mt-2 bg-foreground border border-borders/60 rounded-lg shadow-lg p-4 z-50 w-60">
                                    <p className="text-sm text-primary font-semibold mb-3">Clear all {activeTab === 'reading' ? 'reading' : 'view'} history?</p>
                                    <p className="text-xs text-muted mb-4">This action cannot be undone.</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowClearConfirm(false)} className="flex-1 px-3 py-2 text-sm bg-foreground/50 hover:bg-foreground text-primary rounded transition-colors" disabled={isClearing}>Cancel</button>
                                        <button onClick={handleClearAllHistory} className="flex-1 px-3 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors disabled:opacity-50" disabled={isClearing}>{isClearing ? 'Clearing...' : 'Clear All'}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <TabsContent value="reading" className="space-y-6">
                    <HistoryList items={readingHistory} type="reading" onDelete={(seriesId) => handleDeleteHistory(seriesId, 'reading')}/>
                </TabsContent>
                <TabsContent value="viewed" className="space-y-6">
                    <HistoryList items={viewHistory} type="viewed" onDelete={(seriesId) => handleDeleteHistory(seriesId, 'viewed')}/>
                </TabsContent>
            </Tabs>
        </>
    );
}
