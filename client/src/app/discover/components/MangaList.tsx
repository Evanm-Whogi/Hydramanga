'use client';
import { useRef, useCallback, useState, useEffect } from 'react';
import { ArrowUp, Grid2X2, TextAlignJustify } from "lucide-react";
import { useInfiniteScroll } from '@/lib/useIfiniteScroll';
import MangaCard from "@/components/MangaCard";
import MangaCardList from "@/app/discover/components/MangaCardList";

interface MangaListProps {
  filters: {
    search: string;
    genres: string[];
    tags: string[];
    sort: string;
    type: string;
    status: string;
    years: string[];
  };
  onMangaNavigate?: () => void;
}

export default function MangaList({ filters, onMangaNavigate }: MangaListProps) {
    const { items, loading, hasMore, meta, fetchData } = useInfiniteScroll(filters);
    const observer = useRef<IntersectionObserver | null>(null);
    const [showButton, setShowButton] = useState(false);
    const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');

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
                <div className="flex flex-row place-content-between items-center">
                    <div className="text-sm text-gray-400">Total: {meta?.total || 0} items</div>
                    <div className="flex flex-row gap-2 mb-2">
                        <button onClick={() => setDisplayMode('grid')} className={`p-2 rounded-md cursor-pointer transition-colors ${displayMode === 'grid' ? 'bg-accent text-foreground' : 'bg-foreground hover:bg-foreground/50'}`}><Grid2X2 className="size-5" /></button>
                        <button onClick={() => setDisplayMode('list')} className={`p-2 rounded-md cursor-pointer transition-colors ${displayMode === 'list' ? 'bg-accent text-foreground' : 'bg-foreground hover:bg-foreground/50'}`}><TextAlignJustify className="size-5" /></button>
                    </div>

                </div>
                <div className={`grid ${displayMode === 'grid' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8' : 'grid-cols-1 xl:grid-cols-2'} gap-6`}>
                    {items.map((item, index) => {
                        const isLastElement = items.length === index + 1;
                        return (
                            <div key={item.id} ref={isLastElement ? lastElementRef : null}>
                                {displayMode === 'grid' ? (
                                    <MangaCard manga={item} onNavigate={onMangaNavigate} />
                                ) : (
                                    <MangaCardList manga={item} onNavigate={onMangaNavigate} />
                                )}
                            </div>
                        )
                    })}
                </div>
                {!loading && items.length === 0 && (
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
            {showButton && (
                <button onClick={scrollToTop} className="fixed bottom-8 right-8 z-50 bg-foreground text-primary rounded-full p-2 shadow-lg hover:bg-foreground/50 transition-colors cursor-pointer" aria-label="Back to Top">
                    <ArrowUp className="size-8" />
                </button>
            )}
        </section>
    );
}