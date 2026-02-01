'use client'
import MangaCard from "@/components/MangaCard";
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useInfiniteScroll } from '@/lib/useIfiniteScroll';
import { ArrowBigUp, ArrowUp } from "lucide-react";
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
    const [showButton, setShowButton] = useState(false);
    const [displayItems, setDisplayItems] = useState<any[]>([]);
    const [fade, setFade] = useState(false);

    // Keep previous items visible while loading new data
    useEffect(() => {
        if (!loading) {
            setFade(false);
            // Trigger fade out, then fade in
            setTimeout(() => {
                setDisplayItems(items);
                setFade(true);
            }, 10);
        }
    }, [items, loading]);

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

    useEffect(() => {
        const handleScroll = () => {
            setShowButton(window.scrollY > 300);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <section id="MangaList" className="pb-25 relative">
            <div className="container mx-auto text-primary space-y-2">
                <div className="text-sm text-gray-400">Total: {meta?.total || 0} items</div>
                <div
                    className={`grid grid-cols-2 md:grid-cols-8 gap-6 transition-opacity duration-500 ${fade ? 'opacity-100' : 'opacity-0'}`}
                >
                    {displayItems.map((item, index) => {
                        const isLastElement = displayItems.length === index + 1;
                        return (
                            <div key={item.id} ref={isLastElement ? lastElementRef : null}>
                                <MangaCard manga={item} />
                            </div>
                        )
                    })}
                </div>
                {!loading && displayItems.length === 0 && (
                    <div className="w-full text-center py-8">
                        <p className="text-primary/60">No results found. Try adjusting your filters.</p>
                    </div>
                )}
                {loading && (
                    <div className="w-full text-center py-4">
                        <span className="text-primary animate-pulse">Loading...</span>
                    </div>
                )}
            </div>
            {showButton && 
            <button onClick={scrollToTop} className="fixed bottom-8 right-8 z-50 bg-foreground text-primary rounded-full p-2 shadow-lg hover:bg-foreground/50 transition-colors cursor-pointer" aria-label="Back to Top">
                <ArrowUp className="size-8" />
            </button>}
        </section>
    );
}