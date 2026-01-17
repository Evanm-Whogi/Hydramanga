'use client';
import useSWR from 'swr';
import ProgressBar from '@/components/ProgressBar';

const fetcher = (url: string) => fetch(url).then(res => res.json()).then(data => data.progress);

export default function ImportStatus() {
    // const { data: progress, error } = useSWR('/api/import-status', fetcher, {
    //     refreshInterval: 10000, // Polling every 10 seconds
    //     revalidateOnFocus: true
    // });

    // Static while in development
    const progress = 100;

    return (
        <div className="flex flex-col ml-auto space-x-2 items-center gap-2 w-42">
            <span className="text-sm text-muted">Import Status: {progress ?? 100}%</span>
            <ProgressBar progress={progress ?? 100} color="bg-accent" />
        </div>
    );
}