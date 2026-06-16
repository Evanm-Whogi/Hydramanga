"use client";
import { useEffect, useState } from 'react';
import { getRecommendedManga } from '@/services/mangaService';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { formatToRating } from '@/lib/utils';

interface RecommendedMangaProps {
    currentMangaId: number;
}

export default function RecommendedManga({ currentMangaId }: RecommendedMangaProps) {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        
        const fetchRecommendations = async () => {
            try {
                const data = await getRecommendedManga(currentMangaId, 8);
                if (isMounted) {
                    setRecommendations(data || []);
                }
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
                if (isMounted) {
                    setRecommendations([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchRecommendations();
        return () => { isMounted = false; };
    }, [currentMangaId]);

    if (loading) {
        return (
            <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
                <h2 className="text-base md:text-lg font-bold mb-3">Recommended</h2>
                <div className="flex flex-col gap-2">
                    <span className="text-muted text-sm">Loading recommendations...</span>
                </div>
            </div>
        );
    }

    if (recommendations.length === 0) {
        return (
            <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
                <h2 className="text-base md:text-lg font-bold mb-3">Recommended</h2>
                <div className="flex flex-col gap-2">
                    <span className="text-muted text-sm">No recommendations available.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
            <div className="flex flex-col gap-3">
                <h2 className="text-base md:text-lg font-bold">Recommended</h2>
                <div className="flex flex-col gap-3">
                    {recommendations.map((manga: any) => (
                        <Link 
                            key={manga.id} 
                            href={`/manga/${manga.id}`} 
                            className="flex gap-3 items-start hover:opacity-80 transition-opacity"
                        >
                            {manga.cover?.x150?.x2 && (
                                <img 
                                    src={manga.cover.x150.x2} 
                                    alt={manga.title} 
                                    className="w-12 md:w-14 h-16 md:h-20 object-cover rounded shrink-0" 
                                />
                            )}
                            <div className="flex flex-col justify-center min-w-0 flex-1">
                                <span className="text-xs md:text-sm font-medium line-clamp-2">{manga.title}</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="flex items-center text-xs text-yellow-400">
                                        <Star className="size-3 mr-1 fill-yellow-400" />
                                        {formatToRating(manga.weightedScore)}
                                    </div>
                                    {manga.genres && manga.genres.length > 0 && (
                                        <span className="text-xs text-muted truncate">
                                            {(manga.genres as string[]).slice(0, 6).join(', ')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
