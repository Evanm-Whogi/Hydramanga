'use client';
import Link from "next/link";
import { usePathname } from 'next/navigation';

interface navItemProps {
    href: string;
    icon?: React.ReactNode;
    label: string;
    className?: string;
    closeMenu?: () => void;
}

export default function navItem ({ href, icon, label, className, closeMenu}: navItemProps) {
    const pathname = usePathname();
    const isActive = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
    return (
        <Link href={href} className={`flex shrink-0 items-center gap-1 whitespace-nowrap ${isActive ? 'text-primary' : 'text-muted hover:text-primary'} ${className ?? ''}`} onClick={closeMenu}>
            {icon}
            <span>{label}</span>
        </Link>
    );
}