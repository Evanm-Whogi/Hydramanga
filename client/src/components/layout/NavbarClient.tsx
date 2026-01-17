'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HouseIcon, BookOpenIcon, ZapIcon, ClockPlus, SearchIcon, BellIcon, MoonIcon, SunIcon, UserIcon, SettingsIcon, LogOutIcon, ListIcon, MegaphoneIcon, PaletteIcon, LanguagesIcon } from 'lucide-react';
import NavItem from './NavItem';
import { authClient } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useUser } from "@/providers/UserProvider";

export default function NavbarClient({ initialTheme }: {initialTheme: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [theme, setTheme] = useState(initialTheme);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const { user } = useUser();

    const closeDropdown = () => setIsProfileOpen(false);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(event.target as Node)) { setIsProfileOpen(false); } };
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
        document.cookie = `theme=${newTheme}; path=/; max-age=31536000`;
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
                            <NavItem href='/catalog' icon={<BookOpenIcon className="size-4 inline" />} label='Catalog' />
                            <NavItem href='/catalog?sort=weightedScore' icon={<ZapIcon className="size-4 inline" />} label='Popular' />
                            <NavItem href='/catalog?sort=lastUpdatedAt' icon={<ClockPlus className="size-4 inline" />} label='Latest' />
                            </>
                        ) : (<></>) }
                    </nav>
                </div>

                {/* Right Section */}
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-3">
                        {user ? (
                            <>
                            <Link href="/catalog" className="bg-background hover:bg-background/50 p-3 rounded-full"><SearchIcon className="size-5 hover:cursor-pointer" /></Link>
                            <Link href="/announcements" className="bg-background hover:bg-background/50 p-3 rounded-full"><BellIcon className="size-5 hover:cursor-pointer" /></Link>
                            
                            <div className="relative" ref={profileRef}>
                                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="block focus:outline-none focus:ring-2 focus:ring-borders rounded-full">
                                    <Image src={user.image || "/default-avatar.jpg"} alt="ProfileImage" width={42} height={42} className="rounded-full border-2 border-transparent hover:border-borders transition-all"/></button>
                                {isProfileOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-background border border-borders rounded-xl shadow-xl py-2 z-80 animate-in fade-in zoom-in duration-200">
                                        <div className="px-4 py-2 border-b border-borders mb-">
                                            <p className="text-sm font-semibold truncate capitalize">{user.name}</p>
                                            <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                        <Link href="/profile?tab=overview" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><UserIcon className="size-4" /> My Profile</Link>
                                        <Link href="/profile?tab=lists" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><ListIcon className="size-4" /> My Lists</Link>
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
                    <button onClick={() => setIsOpen(!isOpen)} className="md:hidden p-2 text-muted"><ListIcon className="size-6" /></button>
                </div>
            </div>

            {/* Mobile Nav Logic Preserved */}
            {isOpen && (
                <div className="md:hidden absolute top-0 w-full"><div className="bg-foreground w-full text-lg p-5 space-y-2 rounded-b-md pt-24"><NavItem href='/home' icon={<HouseIcon className="size-5 inline" />} label='Home' /></div></div>
            )}
        </nav>
    );
}