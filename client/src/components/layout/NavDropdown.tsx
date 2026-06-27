'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon } from 'lucide-react';

export interface NavDropdownItem {
    label: string;
    href: string;
    icon?: React.ReactNode;
    external?: boolean;
}

interface NavDropdownProps {
    label: string;
    icon?: React.ReactNode;
    items: NavDropdownItem[];
}

export default function NavDropdown({ label, icon, items }: NavDropdownProps) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const matchesPath = (href: string) => {
        const base = href.split('?')[0];
        return pathname === base || (base !== '/' && pathname.startsWith(`${base}/`));
    };

    const isActive = items.some((item) => !item.external && matchesPath(item.href));

    const handleEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const handleLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 120);
    };

    return (
        <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
            <button
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap hover:cursor-pointer ${isActive ? 'text-primary' : 'text-muted hover:text-primary'}`}
            >
                {icon}
                <span>{label}</span>
                <ChevronDownIcon className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-full pt-3 z-80">
                    <div className="grid grid-cols-2 gap-1 w-80 bg-background border border-borders rounded-xl shadow-xl p-2 animate-in fade-in zoom-in duration-150">
                        {items.map((item) =>
                            item.external ? (
                                <a
                                    key={item.label}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-primary hover:bg-foreground/50 transition-colors"
                                    onClick={() => setOpen(false)}
                                >
                                    {item.icon}
                                    {item.label}
                                </a>
                            ) : (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-foreground/50 transition-colors ${matchesPath(item.href) ? 'text-primary' : 'text-muted hover:text-primary'}`}
                                    onClick={() => setOpen(false)}
                                >
                                    {item.icon}
                                    {item.label}
                                </Link>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
