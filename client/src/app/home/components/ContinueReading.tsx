"use client";
import { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { getMyProgress } from "@/services/mangaService";
import ContinueReadingCard from "@/components/ContinueReadingCard";
import SectionHeader from "@/app/home/components/SectionHeader";

export default function ContinueReading() {
    const { user } = useUser();
    const [progress, setProgress] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const fetchProgress = async () => {
            try {
                const data = await getMyProgress(12);
                setProgress(data.progress || []);
            } catch (error) {
                console.error('Failed to fetch progress:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProgress();
    }, [user]);

    if (!user || loading || progress.length === 0) return null;
    return (
        <section className="container mx-auto text-primary mb-24 pt-10 md:mt-0">
            <SectionHeader title="Continue Reading" link="/history"/>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {progress.slice(0, 12).map((item) => (
                    <ContinueReadingCard key={item.seriesId} progress={item} />
                ))}
            </div>
        </section>
    );
}
