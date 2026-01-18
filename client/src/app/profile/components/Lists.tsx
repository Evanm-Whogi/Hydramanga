import { useState, useEffect } from 'react';
import { fetchUserLists } from '@/services/mangaService';
import MangaCard from '@/components/MangaCard';


const TABS = ["unread", "reading", "finished", "dropped"] as const;

export default function Lists() {
    const [page, setPage] = useState<typeof TABS[number]>("unread");
    const [mangas, setMangas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getList = async () => {
            setLoading(true);
            try {
                const data = await fetchUserLists(page);
                setMangas(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Error loading user lists:", err);
            } finally {
                setLoading(false);
            }
        };
        getList();
    }, [page]);

    return (
        <>
        <div className="flex flex-col space-y-2 w-full ml-0 md:ml-5 mb-5">
            <div className="flex gap-3">
                {TABS.map((tab) => (
                    <button key={tab} onClick={() => setPage(tab)} className={`px-4 py-2 rounded-lg inline-flex items-center text-lg cursor-pointer transition-colors capitalize ${page === tab ? 'bg-foreground text-primary border border-borders' : 'bg-foreground text-muted hover:bg-foreground/50'}`}>
                        {tab}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 pt-5 w-full">
                {mangas.map((manga) => (
                    <MangaCard key={manga.id} manga={manga} />
                ))}
            </div>

        </div>
        </>
    )
}