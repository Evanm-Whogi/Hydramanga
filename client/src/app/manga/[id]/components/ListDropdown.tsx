"use client";

import { useState, useEffect } from 'react';
import { HeartIcon, ChevronDownIcon, Trash2Icon, CheckCircle2 } from 'lucide-react';
import { fetchUserLists, addToList, removeFromList as removeFromListService, UserList } from '@/services/listService';
import { toast } from 'react-toastify';
import { trackMangaListAction } from '@/lib/analytics';

export default function ListDropdown({ seriesId, initialListName, mangaTitle }: { seriesId: number, initialListName: string | null, mangaTitle?: string }) {
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState(initialListName || 'Add to List');
    const [loading, setLoading] = useState(false);
    const [userLists, setUserLists] = useState<UserList[]>([]);

    const loadLists = async () => {
        try {
            const result = await fetchUserLists();
            const lists = result?.lists ?? [];
            const DEFAULT_ORDER = ['unread', 'reading', 'finished', 'dropped'];
            const sorted = [...lists].sort((a, b) => {
                const aIdx = DEFAULT_ORDER.indexOf(a.slug);
                const bIdx = DEFAULT_ORDER.indexOf(b.slug);
                const aIsDefault = aIdx !== -1;
                const bIsDefault = bIdx !== -1;

                // Default lists first, in fixed order
                if (aIsDefault && bIsDefault) return aIdx - bIdx;
                if (aIsDefault) return -1;
                if (bIsDefault) return 1;

                // Then user-created lists by sortOrder
                return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            });
            setUserLists(sorted);
        } catch (error) {
            console.error('Failed to load lists:', error);
            setUserLists([]);
        }
    };

    useEffect(() => {
        loadLists();
    }, []);

    const handleCreateList = async () => {
        const name = prompt('Enter a name for your new list:');
        if (!name || !name.trim()) return;
        try {
            const { createList } = await import('@/services/listService');
            const res = await createList(name.trim());
            await loadLists();
            if (res?.list) {
                // Automatically add this manga to the new list
                await addToList(res.list.id, seriesId);
                setStatus(res.list.name);
                toast.success(`List "${res.list.name}" created and manga added`);
            }
        } catch (error) {
            console.error('Failed to create list:', error);
            toast.error('Could not create list');
        }
    };

    const handleAction = async (action: 'update' | 'remove', list?: UserList) => {
        setLoading(true);
        setOpen(false);

        try {
            if (action === 'update' && list) {
                await addToList(list.id, seriesId);
                setStatus(list.name);
                toast.success(`Manga added to ${list.name}`);
                // Track manga added to list
                if (mangaTitle) {
                  trackMangaListAction('added_to_list', list.id.toString(), list.name, seriesId.toString(), mangaTitle);
                }
            } else {
                await removeFromListService(seriesId);
                setStatus('Add to List');
                toast.info('Manga removed from all lists');
                // Track manga removed from list
                if (mangaTitle) {
                  trackMangaListAction('removed_from_list', '', '', seriesId.toString(), mangaTitle);
                }
            }
        } catch (error) {
            console.error("Failed to update manga list:", error);
            toast.error('Failed to update list');
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
                        {userLists.length > 0 ? (
                            userLists.map((list) => (
                                <button key={list.id} onClick={() => handleAction('update', list)} className="px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer">
                                    {list.name}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-muted">No lists available. Create one to add this manga.</div>
                        )}
                        
                        {isAdded && (
                            <>
                                <div className="h-px bg-white/10 w-full" />
                                <button onClick={() => handleAction('remove')} className="px-4 py-2 hover:bg-red-500/10 text-left border-none bg-transparent text-red-400 cursor-pointer flex items-center font-medium">
                                    <Trash2Icon className="size-4 mr-2" /> Remove
                                </button>
                            </>
                        )}

                        <div className="h-px bg-white/10 w-full" />
                        <button onClick={handleCreateList} className="px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer flex items-center">
                            Create new list
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}