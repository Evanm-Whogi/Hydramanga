"use client";

import { useState, useEffect, useMemo } from 'react';
import { HeartIcon, ChevronDownIcon, Trash2Icon, CheckCircle2 } from 'lucide-react';
import { updateMangaList, removeFromList } from '@/services/mangaService';
import { toast } from 'react-toastify';

const STATUS_OPTIONS = ['unread', 'reading', 'finished', 'dropped'] as const;

export default function ListDropdown({ seriesId, initialStatus }: { seriesId: number, initialStatus: string | null }) {
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState(initialStatus || 'Add to Library');
    const [loading, setLoading] = useState(false);


    const handleAction = async (action: 'update' | 'remove', value?: string) => {
        setLoading(true);
        setOpen(false);
        const startTime = Date.now();

        try {
            if (action === 'update' && value) {
                await updateMangaList(seriesId, value);
                setStatus(value);
                toast(`Manga added to ${value.charAt(0).toUpperCase() + value.slice(1)}`, { type: 'success' });
            } else {
                await removeFromList(seriesId);
                setStatus('Add to Library');
                toast(`Manga removed from ${status.charAt(0).toUpperCase() + status.slice(1)}`, { type: 'info' });
            }
            // Ensure smooth transition if API is too fast
            const elapsed = Date.now() - startTime;
            if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
        } catch (error) {
            console.error("Failed to update manga list:", error);
        } finally {
            setLoading(false);
        }
    };

    const isAdded = status !== 'Add to Library';

    return (
        <div className="relative inline-flex items-center gap-3">
            <div className="relative">
                <button onClick={() => setOpen(!open)} disabled={loading} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none text-primary transition-all ${loading ? 'animate-manga-pulse' : ''}`}>
                    <HeartIcon className={`size-6 mr-2 transition-colors ${isAdded ? 'fill-red-500 text-red-500' : ''}`} />
                    <span className="capitalize">{status}</span>
                    <ChevronDownIcon className={`ml-2 size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                    <div className="absolute top-full left-0 mt-1 bg-foreground rounded-md shadow-xl z-50 flex flex-col min-w-37.5 overflow-hidden border border-white/10">
                        {STATUS_OPTIONS.map((s) => (
                            <button key={s} onClick={() => handleAction('update', s)} className="px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer capitalize">
                                {s}
                            </button>
                        ))}
                        
                        {isAdded && (
                            <>
                                <div className="h-px bg-white/10 w-full" />
                                <button onClick={() => handleAction('remove')} className="px-4 py-2 hover:bg-red-500/10 text-left border-none bg-transparent text-red-400 cursor-pointer flex items-center font-medium">
                                    <Trash2Icon className="size-4 mr-2" /> Remove
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}