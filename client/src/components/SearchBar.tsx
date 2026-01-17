import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function SearchBar({ onChange }: { onChange: (val: string) => void }) {
    const [query, setQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => onChange(query), 500);
        return () => clearTimeout(timer);
    }, [query, onChange]);

    return (
        <div>
            <div className="group hidden md:block relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-5 transition-colors text-muted group-focus-within:text-accent pointer-events-none" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search manga..." className="bg-foreground border border-borders text-primary rounded-md px-3 py-1 pl-9 w-64 outline-none transition-all focus:ring-2 focus:ring-accent" />
            </div>
        </div>
    );
}