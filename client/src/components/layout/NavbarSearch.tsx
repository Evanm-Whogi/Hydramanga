'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SearchIcon, Loader2 } from 'lucide-react';
import { quickSearchSeries, type QuickSearchSeries } from '@/services/mangaService';
import { searchUsers, type QuickSearchUser } from '@/services/userService';
import { getPopularManga } from '@/services/homeService';
import { getCardCoverUrl } from '@/lib/coverUtils';
import UserAvatar from '@/components/UserAvatar';

type SearchMode = 'series' | 'users';

function cap(value?: string | null): string | null {
    if (!value) return null;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function SeriesRow({ item, onSelect }: { item: QuickSearchSeries; onSelect: () => void }) {
    const meta = [cap(item.type), cap(item.status), item.year ? String(item.year) : null].filter(Boolean);
    return (
        <Link href={`/manga/${item.id}`} onClick={onSelect} className="flex items-center gap-3 px-3 py-2 hover:bg-foreground/50 transition-colors">
            <img src={getCardCoverUrl(item.cover)} alt="" className="w-10 h-14 shrink-0 rounded object-cover bg-foreground" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary truncate">{item.displayTitle || item.title || 'Untitled'}</p>
                {meta.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                        {meta.map((part, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-muted/60">·</span>}
                                {part}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}

function UserRow({ item, onSelect }: { item: QuickSearchUser; onSelect: () => void }) {
    return (
        <Link href={`/users/${item.username}`} onClick={onSelect} className="flex items-center gap-3 px-3 py-2 hover:bg-foreground/50 transition-colors">
            <UserAvatar src={item.image} alt="" width={40} />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary truncate">{item.name}</p>
                <p className="text-xs text-muted truncate">@{item.username}</p>
            </div>
        </Link>
    );
}

export default function NavbarSearch() {
    const rootRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef(0);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState<SearchMode>('series');
    const [loading, setLoading] = useState(false);
    const [seriesResults, setSeriesResults] = useState<QuickSearchSeries[]>([]);
    const [userResults, setUserResults] = useState<QuickSearchUser[]>([]);
    const [popular, setPopular] = useState<QuickSearchSeries[]>([]);

    // Close on outside click (mousedown to avoid races with link clicks).
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Lazily load popular manga once the dropdown is first opened.
    useEffect(() => {
        if (!isOpen || popular.length > 0) return;
        let active = true;
        getPopularManga('week', 12)
            .then((res) => { if (active && Array.isArray(res)) setPopular(res as QuickSearchSeries[]); })
            .catch(() => {});
        return () => { active = false; };
    }, [isOpen, popular.length]);

    // Debounced search whenever query or mode changes.
    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setLoading(false);
            setSeriesResults([]);
            setUserResults([]);
            return;
        }
        setLoading(true);
        const token = ++requestRef.current;
        const timer = setTimeout(async () => {
            try {
                if (mode === 'series') {
                    const res = await quickSearchSeries(trimmed, 8);
                    if (token !== requestRef.current) return;
                    setSeriesResults(res.items || []);
                } else {
                    const res = await searchUsers(trimmed, 8);
                    if (token !== requestRef.current) return;
                    setUserResults(res.items || []);
                }
            } catch {
                if (token === requestRef.current) { setSeriesResults([]); setUserResults([]); }
            } finally {
                if (token === requestRef.current) setLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, mode]);

    const handleSelect = () => { setIsOpen(false); setQuery(''); };
    const hasQuery = query.trim().length > 0;
    const results = mode === 'series' ? seriesResults : userResults;

    return (
        <div className="relative" ref={rootRef}>
            <div className="group block relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-5 transition-colors text-muted group-focus-within:text-accent pointer-events-none" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
                    placeholder="Quick Search..."
                    aria-label="Search"
                    className="w-56 bg-background border border-borders text-primary rounded-md px-3 py-1.5 pl-9 outline-none transition-all focus:ring-2 focus:ring-accent"
                />
            </div>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-[min(28rem,70vh)] flex flex-col bg-background border border-borders rounded-xl shadow-xl z-80 animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center gap-2 p-2 border-b border-borders shrink-0">
                        {(['series', 'users'] as SearchMode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? 'bg-accent text-white' : 'bg-background text-muted hover:bg-foreground/50'}`}
                            >
                                {m === 'series' ? 'Series' : 'Users'}
                            </button>
                        ))}
                    </div>

                    <div className="overflow-y-auto flex-1 py-1">
                        {!hasQuery ? (
                            mode === 'users' ? (
                                <p className="px-3 py-6 text-sm text-muted text-center">Start typing to search users</p>
                            ) : (
                            <>
                                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Popular searches</p>
                                {popular.length === 0 ? (
                                    <p className="px-3 py-4 text-sm text-muted text-center">Loading…</p>
                                ) : (
                                    popular.map((item) => <SeriesRow key={item.id} item={item} onSelect={handleSelect} />)
                                )}
                            </>
                            )
                        ) : loading ? (
                            <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Searching…</div>
                        ) : results.length === 0 ? (
                            <p className="px-3 py-6 text-sm text-muted text-center">No results</p>
                        ) : mode === 'series' ? (
                            seriesResults.map((item) => <SeriesRow key={item.id} item={item} onSelect={handleSelect} />)
                        ) : (
                            userResults.map((item) => <UserRow key={item.id} item={item} onSelect={handleSelect} />)
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
