import { useState, useEffect, useRef, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function DropdownContainer({ title, size, selectedLabel, children }: { title?: string; size?: string; selectedLabel: string; children: (setIsOpen: (open: boolean) => void) => ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className={`relative w-full`}>
            <label className="block text-lg font-medium leading-6 text-primary">{title}</label>
            <button onClick={() => setIsOpen(!isOpen)} className="mt-2 flex items-center justify-between w-full rounded-md bg-foreground border border-borders px-3 py-1.5 text-primary text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            {isOpen && <div className="absolute z-20 mt-1 w-full rounded-md bg-foreground border border-borders shadow-lg max-h-60 overflow-y-auto p-1">{children(setIsOpen)}</div>}
        </div>
    );
}