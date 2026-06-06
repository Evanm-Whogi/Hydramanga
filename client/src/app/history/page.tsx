import { Suspense } from 'react';
import type { Metadata } from 'next';
import PageHeader from '@/components/PageHeader';
import { getMyProgress, getUserStats, getMyViewHistory } from '@/services/mangaService';
import HistoryPageClient from './components/HistoryPageClient';
import { buildPageMetadata } from '@/lib/seo';

function HistorySkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-foreground rounded-lg h-24" />
                ))}
            </div>
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-foreground rounded-lg h-32" />
                ))}
            </div>
        </div>
    );
}

async function HistoryContent() {
    try {
        const [readingData, stats, viewData] = await Promise.all([
            getMyProgress(500),
            getUserStats(),
            getMyViewHistory(500),
        ]);

        const rawReadingHistory = Array.isArray(readingData) ? readingData : readingData?.progress || [];
        const viewHistory = Array.isArray(viewData) ? viewData : viewData?.views || [];

        // Map reading progress to match HistoryItem interface
        const readingHistory = rawReadingHistory.map((item: any) => ({
            seriesId: item.seriesId,
            seriesTitle: item.seriesTitle,
            seriesCover: item.seriesCover,
            chapterId: item.lastChapterId,
            chapterNumber: item.chapterNumber,
            chapterTitle: item.chapterTitle,
            pageNumber: item.lastPageNumber,
            completionPercentage: item.percentageCompleted,
            readAt: item.updatedAt,
            readingTimeSeconds: item.readingTimeSeconds,
        }));

        return (
            <HistoryPageClient initialReadingHistory={readingHistory} initialViewHistory={viewHistory} stats={stats} />
        );
    } catch (error) {
        console.error('Failed to load history:', error);
        return (
            <div className="text-center py-12">
                <p className="text-red-400">Failed to load history data</p>
            </div>
        );
    }
}

export const metadata: Metadata = buildPageMetadata({
  title: 'Reading History',
  description: 'View your manga reading history and analytics on HydraManga.',
  path: '/history',
  noIndex: true,
});

export default async function HistoryPage() {
    return (
        <>
            <PageHeader title="Reading History" description="Track your reading and viewing history"/>
            <div className="container mx-auto py-8 lg:py-12">
                <Suspense fallback={<HistorySkeleton />}>
                    <HistoryContent />
                </Suspense>
            </div>
        </>
    );
}