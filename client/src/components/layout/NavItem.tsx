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
    return (
        <Link href={href} className={`flex items-center gap-1 ${pathname === href ? 'text-primary' : 'text-muted hover:text-primary'}`} onClick={closeMenu}>
            {icon}
            <span>{label}</span>
        </Link>
    );
}