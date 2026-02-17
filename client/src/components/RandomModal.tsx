import React, { useEffect, useState } from 'react';
import { getRandomManga } from '@/services/mangaService';
import { X, RefreshCcw } from 'lucide-react';
import Link from 'next/link';

interface Manga {
    id: string;
    title: string;
    description: string;
    cover: {
        raw: {
            url: string;
        };
    };
}

interface RandomModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
}

export const RandomModal: React.FC<RandomModalProps> = ({isOpen, onClose, title = 'Random Manga', description = 'Discover new manga'}) => {
    const [randomMangas, setRandomMangas] = useState<Manga[]>([]);
    
    const fetchManga = async () => {
        try {
            const data = await getRandomManga();
            setRandomMangas(data);
        } catch (error) {
            console.error('Failed to fetch random manga:', error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchManga();
        }
    }, [isOpen]);

    // Lock scroll when modal is open
    useEffect(() => {
        const root = document.documentElement; 
        isOpen ? root.classList.add('lock-scroll') : root.classList.remove('lock-scroll');

    return () => root.classList.remove('lock-scroll');
    }, [isOpen]);


    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 bg-foreground border border-background rounded-lg shadow-2xl max-w-3xl w-[95%] md:w-full flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-background shrink-0">
                    <h2 className="text-xl md:text-2xl font-bold text-primary">{title}</h2>
                    <button onClick={onClose} className="text-muted hover:text-primary transition-colors hover:bg-background rounded-full cursor-pointer" aria-label="Close">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {randomMangas.map((manga) => (
                        <Link href={`/manga/${manga.id}`} key={manga.id} onClick={onClose} className="group flex flex-col border border-borders rounded-lg overflow-hidden bg-background  cursor-pointer">
                            <div className="relative h-40 md:h-72 w-full overflow-hidden">
                                <img src={manga.cover.raw.url} alt={manga.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            </div>
                            <h3 className="m-2 font-semibold text-base md:text-lg text-primary line-clamp-1">{manga.title}</h3>
                        </Link>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-background flex shrink-0 place-content-between">
                    <button onClick={fetchManga} className="px-6 py-2 bg-accent text-primary rounded-md transition-colors text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <RefreshCcw size={16} />
                        Roll Again
                    </button>
                    <button onClick={onClose} className="px-6 py-2 bg-background hover:bg-background/50 text-primary rounded-md transition-colors text-sm font-medium cursor-pointer">Close</button>
                </div>
            </div>
        </div>
  );
};