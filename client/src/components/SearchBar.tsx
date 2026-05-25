import { SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function SearchBar({ onChange, size, initialValue }: { onChange: (val: string) => void, size?: string, initialValue?: string }) {
    const [query, setQuery] = useState(initialValue || '');
    const lastEmittedRef = useRef(initialValue || '');
    const skipMountEmitRef = useRef(true);

    useEffect(() => {
        // Avoid firing onChange on mount — that schedules router.replace on discover and can cancel navigation.
        if (skipMountEmitRef.current) {
            skipMountEmitRef.current = false;
            lastEmittedRef.current = query;
            return;
        }
        if (query === lastEmittedRef.current) return;

        const timer = setTimeout(() => {
            lastEmittedRef.current = query;
            onChange(query);
        }, 500);
        return () => clearTimeout(timer);
    }, [query, onChange]);

    return (
        <div>
            <div className="group block relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-5 transition-colors text-muted group-focus-within:text-accent pointer-events-none" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search manga or authors..." className={`bg-foreground border border-borders text-primary rounded-md px-3 py-1 pl-9 outline-none transition-all focus:ring-2 focus:ring-accent ${size || "w-64"}`} />
            </div>
        </div>
    );
}