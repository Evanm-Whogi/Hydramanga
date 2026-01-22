'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HouseIcon, BookOpenIcon, ZapIcon, ClockPlus, SearchIcon, BellIcon, MoonIcon, SunIcon, UserIcon, SettingsIcon, LogOutIcon, ListIcon, PaletteIcon, BookTextIcon } from 'lucide-react';
import NavItem from './NavItem';
import { authClient } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { useUser } from "@/providers/UserProvider";

export default function NavbarClient() {
    const [isOpen, setIsOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [theme, setTheme] = useState('theme-dark');
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const mobileMenuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useUser();

    const closeDropdown = () => setIsProfileOpen(false);
    // Load theme from localStorage on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'theme-dark';
        setTheme(savedTheme);
        document.documentElement.className = savedTheme;
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) { setIsProfileOpen(false); }
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node) && !(event.target as HTMLElement).closest('button[aria-label="Menu"]')) { setIsOpen(false); }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleScroll = () => { setIsScrolled(window.scrollY > 50); };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'theme-dark' ? 'theme-light' : 'theme-dark';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.className = newTheme;
    };

    const handleSignOut = async () => {
            await authClient.signOut({
                fetchOptions: {
                    onSuccess: () => {
                        setIsProfileOpen(false);
                        router.push('/');
                        router.refresh();
                        toast('See you next time.', { type: 'info' });
                    },
                },
            });
        };

        
    return (
        <nav id="header" className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 border-b ${ isScrolled ? 'bg-foreground border-borders shadow-lg' : 'bg-foreground/5 backdrop-blur-md border-white/10'}`}>
            <div className="flex container items-center h-18 pt-2 mx-auto px-5 md:px-0 justify-between">
                {/* Left Section */}
                <div className="flex items-center gap-8 h-full">
                    <Link href="/" className="z-50 flex items-center h-full w-55.5">
                    <Image 
                        src={theme === 'theme-dark' ? "/bannerDark.png" : "/bannerLight.png"} 
                        width={222} 
                        height={128} 
                        alt="Logo" 
                        priority 
                        className="object-contain" 
                        style={{ height: '100%', width: 'auto' }} 
                    />
                    </Link>
                    <nav className="hidden md:flex items-center space-x-6 text-md text-muted ml-6">
                        {user ? (
                            <>
                            <NavItem href='/home' icon={<HouseIcon className="size-4 inline" />} label='Home' />
                            <NavItem href='/discover' icon={<BookOpenIcon className="size-4 inline" />} label='Discover' />
                            <NavItem href='/lists' icon={<BookTextIcon className="size-4 inline" />} label='My Lists' />
                            </>
                        ) : (<></>) }
                    </nav>
                </div>

                {/* Right Section */}
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-3">
                        {user ? (
                            <>
                            <Link href="/discover" className="bg-background hover:bg-background/50 p-3 rounded-full"><SearchIcon className="size-5 hover:cursor-pointer" /></Link>
                            <Link href="/announcements" className="bg-background hover:bg-background/50 p-3 rounded-full"><BellIcon className="size-5 hover:cursor-pointer" /></Link>
                            
                            <div className="relative" ref={profileRef}>
                                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="block focus:outline-none focus:ring-2 focus:ring-borders rounded-full">
                                    <img src={user.image || "/default-avatar.jpg"} alt="ProfileImage" width={42} height={42} className="rounded-full border-2 border-transparent hover:border-borders transition-all"/></button>
                                {isProfileOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-background border border-borders rounded-xl shadow-xl py-2 z-80 animate-in fade-in zoom-in duration-200">
                                        <div className="px-4 py-2 border-b border-borders mb-">
                                            <p className="text-sm font-semibold truncate capitalize">{user.name}</p>
                                            <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                        <Link href="/profile?tab=overview" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><UserIcon className="size-4" /> My Profile</Link>
                                        <Link href="/lists" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><ListIcon className="size-4" /> My Lists</Link>
                                        <hr className="my-1 border-borders" />
                                        <div className="flex place-content-between w-fit">
                                            <Link href="/profile?tab=settings" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><SettingsIcon className="size-4" /> Settings</Link>
                                            <div className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors cursor-pointer" onClick={toggleTheme}><PaletteIcon className="size-4" /> Theme</div>
                                        </div>
                                        <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/50 transition-colors hover:cursor-pointer" onClick={handleSignOut}><LogOutIcon className="size-4" /> Sign Out</button>
                                    </div>
                                )}
                            </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-4">
                                <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-foreground hover:bg-foreground/50">Login</Link>
                                <Link href="/register" className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-foreground hover:bg-foreground/50">Sign Up</Link>
                                </div>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(!isOpen)} aria-label="Menu" className="md:hidden p-2 text-muted"><ListIcon className="size-6" /></button>
                </div>
            </div>

            {/* Mobile Nav */}
            {isOpen && (
                <div ref={mobileMenuRef} className="md:hidden border-t border-borders bg-foreground/95 backdrop-blur-sm">
                    <div className="px-5 py-4 space-y-4">
                        {user ? (
                            <>
                                <div className="flex items-center gap-3">
                                    <img src={user.image || "/default-avatar.jpg"} alt="ProfileImage" width={48} height={48} className="rounded-full border border-borders" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate capitalize">{user.name}</p>
                                        <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/home" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/home' ? 'text-primary' : 'text-muted'}`}>
                                        <HouseIcon className="size-4" /> Home
                                    </Link>
                                    <Link href="/discover" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                        <BookOpenIcon className="size-4" /> Discover
                                    </Link>
                                    <Link href="/discover?sort=weightedScore" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                        <ZapIcon className="size-4" /> Popular
                                    </Link>
                                    <Link href="/discover?sort=lastUpdatedAt" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                        <ClockPlus className="size-4" /> Latest
                                    </Link>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/discover" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                        <SearchIcon className="size-4" /> Search
                                    </Link>
                                    <Link href="/announcements" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/announcements' ? 'text-primary' : 'text-muted'}`}>
                                        <BellIcon className="size-4" /> Alerts
                                    </Link>
                                    <Link href="/lists" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/lists' ? 'text-primary' : 'text-muted'}`}>
                                        <ListIcon className="size-4" /> My Lists
                                    </Link>
                                    <Link href="/profile?tab=overview" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/profile' ? 'text-primary' : 'text-muted'}`}>
                                        <UserIcon className="size-4" /> Profile
                                    </Link>
                                    <Link href="/profile?tab=settings" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/profile' ? 'text-primary' : 'text-muted'}`}>
                                        <SettingsIcon className="size-4" /> Settings
                                    </Link>
                                    <button onClick={() => { toggleTheme(); setIsOpen(false); }} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 text-left">
                                        {theme === 'theme-dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />} Theme
                                    </button>
                                    <button onClick={async () => { setIsOpen(false); await handleSignOut(); }} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm text-red-500 hover:bg-red-500/20">
                                        <LogOutIcon className="size-4" /> Sign Out
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/login" onClick={() => setIsOpen(false)} className="w-full text-center rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-foreground/80">Login</Link>
                                    <Link href="/register" onClick={() => setIsOpen(false)} className="w-full text-center rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-foreground/80">Sign Up</Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </nav>
    );
}