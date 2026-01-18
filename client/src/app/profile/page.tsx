"use client";
import { FlagTriangleRight, LayoutDashboardIcon, ListIcon, SettingsIcon, UserPlusIcon } from 'lucide-react';
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from 'react';
import Overview from '@/app/profile/components/Overview';
import Settings from '@/app/profile/components/Settings';
import Lists from '@/app/profile/components/Lists'
import { toast } from 'react-toastify';
import { useUser } from "@/providers/UserProvider";

const VIEWS: { [key: string]: React.FC<{ user: any; isOwner: boolean }> } = {
    overview: Overview,
    settings: Settings,
    lists: Lists,
};
export default function ProfileContainer () {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useUser();

    // Initialize state from URL if present, otherwise default to overview
    const [page, setPage] = useState(searchParams.get("tab") || "overview");
    const ActiveView = VIEWS[page] || Overview;
    
    const verified = searchParams.get("verified");
    const tabParam = searchParams.get("tab");

    // Sync state if the URL tab parameter changes
    useEffect(() => {
        if (tabParam && VIEWS[tabParam]) {
            setPage(tabParam);
        }
    }, [tabParam]);

    useEffect(() => {
        if (verified === "true") {
            toast.success("Email verified successfully!");
            const params = new URLSearchParams(searchParams.toString());
            params.delete("verified");
            router.replace(`/profile?${params.toString()}`, { scroll: false });
        }
    }, [verified, searchParams, router]);


    return (
        <>
        <div className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110" style={{ '--manga-cover': `url(${user?.image})` } as React.CSSProperties}></div>
            <div className="container mx-auto pt-5 px-4 md:px-0 mb-5 md:mb-0">
                <div className="flex flex-col lg:flex-row lg:place-content-center">
                    <div className="relative mt-25 md:mt-0 md:-top-35 flex flex-col w-full lg:w-79.75 z-25 items-center lg:items-start">
                        <div className="w-48 lg:w-full aspect-square overflow-hidden rounded-md border-4 border-background shadow-lg">
                            <img src={(user?.image)!} alt="manga" className="w-full h-full object-cover" />
                        </div>

                        <div className="bg-foreground rounded-md p-5 w-full mt-5">
                            <div className="flex flex-col">
                                <div className="flex text-primary capitalize">Username: <span className="ml-2 text-muted">{user?.name}</span></div>
                                <div className="flex text-primary capitalize">Role: <span className="ml-2 text-muted">{user?.role}</span></div>
                                <div className="flex text-primary capitalize">Account Created: <span className="ml-2 text-muted">{user?.createdAt.toDateString()}</span></div>
                                <div className="flex text-primary capitalize">Last Online: <span className="ml-2 text-muted">{user?.createdAt.toDateString()}</span></div>
                            </div>
                        </div>

                        <div className="rounded-md w-full mt-5 flex flex-col space-y-3">
                            <button className="bg-foreground hover:bg-foreground/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer"><UserPlusIcon className="size-5 mr-2"/> Follow</button>
                            <button className="bg-foreground hover:bg-foreground/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer"><FlagTriangleRight className="size-5 mr-2"/> Report</button>
                        </div>
                    </div>
                    <div className="flex flex-col space-y-2 w-full lg:w-2/3 lg:ml-5 mt-5 lg:mt-0">
                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => setPage("overview")} className={`${page === 'overview' ? 'bg-foreground text-primary border border-borders' : 'bg-foreground text-muted'} hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}><LayoutDashboardIcon className="size-5 mr-2"/> Overview</button>
                            <button onClick={() => setPage("lists")} className={`${page === 'lists' ? 'bg-foreground text-primary border border-borders' : 'bg-foreground text-muted'} hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}><ListIcon className="size-5 mr-2"/> Lists</button>
                            <button onClick={() => setPage("settings")} className={`${page === 'settings' ? 'bg-foreground text-primary border border-borders' : 'bg-foreground text-muted'} hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}><SettingsIcon className="size-5 mr-2"/> Settings</button>
                        </div>

                        <div className="mt-4">
                            <ActiveView user={user} isOwner={true} />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}