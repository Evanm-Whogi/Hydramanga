import { useState, useEffect, useRef, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function DropdownContainer({ title, size, selectedLabel, children, className, matchInputHeight }: { title?: string; size?: string; selectedLabel: string; children: (setIsOpen: (open: boolean) => void) => ReactNode; className?: string; matchInputHeight?: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const surfaceBg = className?.includes('bg-background') ? 'bg-background' : 'bg-foreground';
    const buttonShape = matchInputHeight ? 'min-h-[42px] h-full py-2 rounded-lg' : 'py-1.5 rounded-md text-sm';

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div ref={containerRef} className={`relative w-full ${matchInputHeight ? 'h-full' : ''} ${size ?? ''}`}>
            {title ? <label className="block text-lg font-medium leading-6 text-primary">{title}</label> : null}
            <button onClick={() => setIsOpen(!isOpen)} className={`${title ? 'mt-2' : ''} flex items-center justify-between w-full ${buttonShape} ${surfaceBg} border border-borders px-3 text-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className ?? ''}`}>
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            {isOpen && <div className={`absolute left-0 z-100 mt-1 w-full min-w-0 rounded-md ${surfaceBg} border border-borders shadow-lg max-h-60 overflow-y-auto overflow-x-hidden p-1`}>{children(setIsOpen)}</div>}
        </div>
    );
}