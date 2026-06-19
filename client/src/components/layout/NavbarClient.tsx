'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HouseIcon, BookOpenIcon, DicesIcon, LibraryBig, SearchIcon, BellIcon, UserIcon, SettingsIcon, LogOutIcon, ListIcon, PaletteIcon, BookTextIcon, ChartBarDecreasingIcon, CirclePlusIcon, ShieldIcon, TrophyIcon, MessagesSquareIcon, MessageCircleIcon, Bookmark } from 'lucide-react';
import NavItem from './NavItem';
import { authClient } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { useUser } from "@/providers/UserProvider";
import { RandomModal } from '@/components/RandomModal';
import { ThemeModal, restoreThemeFromCookies } from '@/components/ThemeModal';
import NotificationsMenu from '@/components/layout/NotificationsMenu';
import UserAvatar from '@/components/UserAvatar';

type ThemeMode = 'theme-dark' | 'theme-light' | 'theme-night';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? "https://discord.gg/A27sQQTWWe";

export default function NavbarClient() {
    const [isOpen, setIsOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemeMode>('theme-dark');
    const [isRandomModalOpen, setIsRandomModalOpen] = useState(false);
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const mobileMenuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useUser();
    const { data: sessionData } = authClient.useSession();
    const isImpersonating = Boolean(sessionData?.session?.impersonatedBy);

    const closeDropdown = () => setIsProfileOpen(false);

    // Restore theme from cookies on mount
    useEffect(() => {
        const { mode } = restoreThemeFromCookies();
        setThemeMode(mode as ThemeMode);
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

    const toggleRandomManga = () => {
        setIsRandomModalOpen(true);
    };

    const openRandomManga = () => {
        closeDropdown();
        setIsOpen(false);
        setIsRandomModalOpen(true);
    };

    const openThemeModal = () => {
        setIsProfileOpen(false);
        setIsOpen(false);
        setIsThemeModalOpen(true);
    };

    const profileOverflowItems = (
        <div className="min-[1700px]:hidden">
            <hr className="my-1 border-borders" />
            <Link href="/request" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><CirclePlusIcon className="size-4" /> Request</Link>
            <button type="button" className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors hover:cursor-pointer" onClick={openRandomManga}><DicesIcon className="size-4" /> Random</button>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}>
                <img src="/oauthIcons/discord.webp" alt="" className="size-4 rounded-sm" />
                Discord
            </a>
            <Link href="/discover" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><SearchIcon className="size-4" /> Search</Link>
            <NotificationsMenu variant="dropdown" onOpen={closeDropdown} />
        </div>
    );

    return (
        <>
            <nav id="header" className={`fixed left-0 w-full z-50 transition-all duration-300 border-b ${isImpersonating ? 'top-10' : 'top-0'} ${isScrolled ? 'bg-foreground border-borders shadow-lg' : 'bg-foreground/5 backdrop-blur-md border-white/10'}`}>
                <div className="flex container items-center h-18 pt-2 mx-auto px-5 lg:px-8 justify-between min-w-0">
                    {/* Left Section */}
                    <div className="flex items-center gap-8 h-full">
                        <Link href="/" className="z-50 flex items-center h-full w-56">
                            <Image
                                src={'/logoIcon.png'}
                                width={222}
                                height={128}
                                alt="Logo"
                                priority
                                className="object-contain"
                                style={{ height: '3.5rem', width: 'auto' }}
                            />
                            <h1 className="text-2xl font-bold text-primary flex ml-3">Hydra <span className="text-accent">Manga</span></h1>
                        </Link>
                        <nav className="hidden xl:flex items-center space-x-6 text-md text-muted ml-6">
                            <NavItem href='/' icon={<HouseIcon className="size-4 inline" />} label='Home' />
                            <NavItem href='/discover' icon={<BookOpenIcon className="size-4 inline" />} label='Discover' />
                            <NavItem href='/collections' icon={<LibraryBig className="size-4 inline" />} label='Collections' />
                            <NavItem href='/lists' icon={<ListIcon className="size-4 inline" />} label='Lists' />
                            <NavItem href='/leaderboard' icon={<TrophyIcon className="size-4 inline" />} label='Leaderboard' />
                            <NavItem href='/forum' icon={<MessagesSquareIcon className="size-4 inline" />} label='Forum' />
                            <NavItem href='/chat' icon={<MessageCircleIcon className="size-4 inline" />} label='Chat' />
                        </nav>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-6">
                        <div className="hidden xl:flex items-center gap-3">
                            <div className="hidden min-[1700px]:flex items-center gap-3">
                                {user && (
                                    <Link href="/request" className="flex items-center gap-2 px-3 py-2 text-sm bg-background rounded-lg hover:bg-foreground/80 transition-colors cursor-pointer"><CirclePlusIcon className="size-4" /> Request</Link>
                                )}
                                <div onClick={toggleRandomManga} className="flex items-center gap-2 px-3 py-2 text-sm bg-background rounded-lg hover:bg-foreground/80 transition-colors cursor-pointer"><DicesIcon className="size-4" />Random</div>
                                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="size-11" ><img src="/oauthIcons/discord.webp" alt="discord" /></a>
                                <Link href="/discover" className="bg-background hover:bg-background/50 p-3 rounded-full"><SearchIcon className="size-5 hover:cursor-pointer" /></Link>
                                {user && <NotificationsMenu />}
                            </div>

                            {user ? (
                                <>
                                    <div className="relative" ref={profileRef}>
                                        <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="block focus:outline-none focus:ring-2 focus:ring-borders rounded-full">
                                            <UserAvatar src={user.image} alt="Profile" width={44} className="border-2 border-transparent hover:border-borders transition-all" /></button>
                                        {isProfileOpen && (
                                            <div className="absolute right-0 mt-2 w-56 bg-background border border-borders rounded-xl shadow-xl py-2 z-80 animate-in fade-in zoom-in duration-200">
                                                <div className="px-4 py-2 border-b border-borders">
                                                    <p className="text-sm font-semibold truncate capitalize">{user.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                </div>
                                                <Link href="/users/me?tab=overview" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><UserIcon className="size-4" /> My Profile</Link>
                                                <Link href="/users/me?tab=bookmarks" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><BookTextIcon className="size-4" /> Bookmarks</Link>
                                                <Link href="/users/me?tab=lists" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><ListIcon className="size-4" /> My Lists</Link>
                                                <Link href="/users/me?tab=saved-lists" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><Bookmark className="size-4" /> Saved Lists</Link>
                                                <Link href="/history" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><ChartBarDecreasingIcon className="size-4" /> History</Link>
                                                {user?.role === "admin" && (
                                                    <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><ShieldIcon className="size-4" /> Admin</Link>
                                                )}

                                                {profileOverflowItems}
                                                
                                                <hr className="my-1 border-borders" />
                                                <div className="flex place-content-between w-fit">
                                                    <Link href="/users/me?tab=settings" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors" onClick={closeDropdown}><SettingsIcon className="size-4" /> Settings</Link>
                                                    <div className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors cursor-pointer" onClick={openThemeModal}><PaletteIcon className="size-4" /> Theme</div>
                                                </div>
                                                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/50 transition-colors hover:cursor-pointer" onClick={handleSignOut}><LogOutIcon className="size-4" /> Sign Out</button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={openThemeModal} className="bg-background hover:bg-background/50 p-3 rounded-full" aria-label="Theme"><PaletteIcon className="size-5" /></button>
                                    <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-foreground hover:bg-foreground/50">Login</Link>
                                    <Link href="/register" className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-foreground hover:bg-foreground/50">Sign Up</Link>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setIsOpen(!isOpen)} aria-label="Menu" className="xl:hidden p-2 text-muted"><ListIcon className="size-6" /></button>
                    </div>
                </div>

                {/* Mobile Nav */}
                {isOpen && (
                    <div ref={mobileMenuRef} className="xl:hidden border-t border-borders bg-foreground/95 backdrop-blur-sm">
                        <div className="px-5 py-4 space-y-4">
                            {user ? (
                                <>
                                    <div className="flex items-center gap-3">
                                        <UserAvatar src={user.image} alt="Profile" width={48} className="border border-borders" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate capitalize">{user.name}</p>
                                            <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <Link href="/" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/' ? 'text-primary' : 'text-muted'}`}>
                                            <HouseIcon className="size-4" /> Home
                                        </Link>
                                        <Link href="/discover" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                            <BookOpenIcon className="size-4" /> Discover
                                        </Link>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <Link href="/lists" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/lists' ? 'text-primary' : 'text-muted'}`}>
                                            <ListIcon className="size-4" /> Lists
                                        </Link>
                                        <Link href="/users/me?tab=bookmarks" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/users/me' ? 'text-primary' : 'text-muted'}`}>
                                            <BookTextIcon className="size-4" /> Bookmarks
                                        </Link>
                                        <Link href="/users/me?tab=lists" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/users/me' ? 'text-primary' : 'text-muted'}`}>
                                            <ListIcon className="size-4" /> My Lists
                                        </Link>
                                        <Link href="/users/me?tab=saved-lists" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/users/me' ? 'text-primary' : 'text-muted'}`}>
                                            <Bookmark className="size-4" /> Saved Lists
                                        </Link>
                                        <Link href="/collections" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/collections' ? 'text-primary' : 'text-muted'}`}>
                                            <LibraryBig className="size-4" /> Collections
                                        </Link>
                                        <Link href="/history" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/history' ? 'text-primary' : 'text-muted'}`}>
                                            <ChartBarDecreasingIcon className="size-4" /> History
                                        </Link>
                                        <Link href="/leaderboard" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/leaderboard' ? 'text-primary' : 'text-muted'}`}>
                                            <TrophyIcon className="size-4" /> Leaderboard
                                        </Link>
                                        <Link href="/forum" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/forum' || pathname.startsWith('/forum/') ? 'text-primary' : 'text-muted'}`}>
                                            <MessagesSquareIcon className="size-4" /> Forum
                                        </Link>
                                        <Link href="/chat" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/chat' ? 'text-primary' : 'text-muted'}`}>
                                            <MessageCircleIcon className="size-4" /> Chat
                                        </Link>
                                        <NotificationsMenu variant="link" />
                                        <Link href="/users/me?tab=overview" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/users/me' ? 'text-primary' : 'text-muted'}`}>
                                            <UserIcon className="size-4" /> Profile
                                        </Link>
                                        <Link href="/users/me?tab=settings" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/users/me' ? 'text-primary' : 'text-muted'}`}>
                                            <SettingsIcon className="size-4" /> Settings
                                        </Link>
                                        <Link href="/request" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/request' ? 'text-primary' : 'text-muted'}`}>
                                            <CirclePlusIcon className="size-4" /> Request
                                        </Link>
                                        <button onClick={openThemeModal} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 text-left">
                                            <PaletteIcon className="size-4" /> Theme
                                        </button>
                                        {user?.role === "admin" && (
                                            <Link href="/admin" className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/admin' ? 'text-primary' : 'text-muted'}"><ShieldIcon className="size-4" /> Admin</Link>
                                        )}
                                        <button onClick={async () => { setIsOpen(false); await handleSignOut(); }} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm text-red-500 hover:bg-red-500/20">
                                            <LogOutIcon className="size-4" /> Sign Out
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Link href="/" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/' ? 'text-primary' : 'text-muted'}`}>
                                            <HouseIcon className="size-4" /> Home
                                        </Link>
                                        <Link href="/discover" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/discover' ? 'text-primary' : 'text-muted'}`}>
                                            <BookOpenIcon className="size-4" /> Discover
                                        </Link>
                                        <Link href="/collections" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/collections' ? 'text-primary' : 'text-muted'}`}>
                                            <LibraryBig className="size-4" /> Collections
                                        </Link>
                                        <Link href="/leaderboard" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/leaderboard' ? 'text-primary' : 'text-muted'}`}>
                                            <TrophyIcon className="size-4" /> Leaderboard
                                        </Link>
                                        <Link href="/forum" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/forum' || pathname.startsWith('/forum/') ? 'text-primary' : 'text-muted'}`}>
                                            <MessagesSquareIcon className="size-4" /> Forum
                                        </Link>
                                        <Link href="/chat" onClick={() => setIsOpen(false)} className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 ${pathname === '/chat' ? 'text-primary' : 'text-muted'}`}>
                                            <MessageCircleIcon className="size-4" /> Chat
                                        </Link>
                                        <button onClick={openRandomManga} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 text-left">
                                            <DicesIcon className="size-4" /> Random
                                        </button>
                                        <button onClick={openThemeModal} className="flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 text-left">
                                            <PaletteIcon className="size-4" /> Theme
                                        </button>
                                    </div>
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

            <RandomModal isOpen={isRandomModalOpen} onClose={() => setIsRandomModalOpen(false)} />
            <ThemeModal
                isOpen={isThemeModalOpen}
                onClose={() => setIsThemeModalOpen(false)}
                currentMode={themeMode}
                onModeChange={(mode) => setThemeMode(mode)}
            />
        </>
    );
}