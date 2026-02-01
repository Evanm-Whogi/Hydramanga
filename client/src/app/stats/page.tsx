import { Suspense } from 'react';
import PageHeader from '@/components/PageHeader';
import Statistics from '@/app/stats/components/Statistics';
import { getUserStats } from '@/services/mangaService';

/**
 * Loading skeleton for statistics
 */
function StatisticsLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col lg:flex-row gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-foreground rounded-lg p-4 flex items-start flex-1 h-24"
          />
        ))}
      </div>
      <div className="bg-foreground rounded-lg p-8 h-96" />
    </div>
  );
}

export const metadata = {
  title: 'Reading Statistics',
  description: 'View your manga reading statistics and analytics.',
};

export default async function StatsPage() {
  const userReadingStats = await getUserStats();

  return (
    <>
      <PageHeader
        title="Statistics"
        description="Track your reading progress and analytics."
      />
      <div className="container mx-auto py-8 lg:py-12">
        <Suspense fallback={<StatisticsLoadingSkeleton />}>
          <Statistics mangaStats={userReadingStats} />
        </Suspense>
      </div>
    </>
  );
}
