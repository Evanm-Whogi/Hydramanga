'use client'
import MangaCard from "@/components/MangaCard";
import React, { useRef, useCallback } from 'react';
import { useInfiniteScroll } from '@/lib/useIfiniteScroll';

interface MangaListProps {
  filters: {
    search: string;
    genres: string[];
    sort: string;
    type: string;
    status: string;
    nsfw: string;
  };
}

export default function MangaList({ filters }: MangaListProps) {
    const { items, loading, hasMore, meta, fetchData } = useInfiniteScroll(filters);
    const observer = useRef<IntersectionObserver | null>(null);

    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                fetchData();
            }
        });

        if (node) observer.current.observe(node);
    }, [loading, hasMore, fetchData]);

    return (
    <section id="MangaList" className="pb-25">
        <div className="container mx-auto text-primary space-y-2">
            <div className="text-sm text-gray-400">Total: {meta?.total || 0} items</div>
            <div className="grid grid-cols-2 md:grid-cols-8 gap-6">
                {items.map((item, index) => {
                    const isLastElement = items.length === index + 1;
                    return ( 
                        <div key={item.id} ref={isLastElement ? lastElementRef : null}>
                            <MangaCard manga={item} />
                        </div>
                    )
                })}
            </div>
        </div>
    </section>
    )
}