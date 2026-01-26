import Statistics from "@/app/stats/components/Statistics";
import PageHeader from "@/components/PageHeader";
import { getUserStats } from "@/services/mangaService";

export default async function StatsPage() {
    const userReadingStats = await getUserStats();

    return (
        <>
            <PageHeader title="Stats Page" description="Statistics and analytics overview." />
            <div className="container mx-auto py-12">
                <div className="flex flex-col gap-6">
                    <Statistics mangaStats={userReadingStats} />
                </div>
            </div>
        </>
    );
}