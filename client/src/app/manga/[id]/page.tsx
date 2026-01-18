"use client";
import { useEffect, useState, memo, useTransition } from 'react';
import { fetchOne, getMangaAnalytics } from '@/services/mangaService';
import { formatDate, formatToStars, formatToRating } from '@/lib/utils';
import Link from 'next/link';
import MangaActions from './components/MangaActions';
import { Eye, TrendingUp } from 'lucide-react';

// Memoized Header to prevent blur/filter recalculations on state changes
const MangaHeader = memo(({ cover }: { cover: string }) => {
    return <div className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110" style={{ '--manga-cover': `url(${cover})` } as React.CSSProperties}></div>;
});

const getLinkName = (url: string) => {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
        
        // Custom mapping for complex subdomains and specific brands
        const domainMap: Record<string, string> = {
            'magazine.younganimal.com': 'Young Animal',
            'series.naver.com': 'Naver Series',
            'm.comic.naver.com': 'Naver Webtoon',
            'kana.fr': 'Kana',
            'shogakukan.co.jp': 'Shogakukan',
            'viz.com': 'VIZ Media',
            'kodansha.co.jp': 'Kodansha',
            'morning.kodansha.co.jp': 'Kodansha Morning',
            'morningmanga.com': 'Morning Manga',
            'en.wikipedia.org': 'Wikipedia (EN)',
            'ja.wikipedia.org': 'Wikipedia (JA)',
            'mangabaka.org': 'MangaBaka'
        };

        if (domainMap[hostname]) return domainMap[hostname];

        // Advanced Fallback: 
        // If it's a subdomain like 'magazine.site.com', it will grab 'Site' instead of 'Magazine'
        const parts = hostname.split('.');
        const namePart = parts.length > 2 ? parts[parts.length - 2] : parts[0];
        
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    } catch {
        return 'Link';
    }
};

MangaHeader.displayName = "MangaHeader";

// Memoized Details section to prevent re-renders
const MangaDetails = memo(({ manga }: { manga: any }) => (
    <div className="mt-2 flex flex-col gap-3">
        <div className="flex gap-2 items-center flex-wrap">
            <strong className="text-muted">Authors:</strong> 
            { manga.authors && manga.authors.slice(0, 10).map((author: string, index: number) => (
                <div key={index} className="px-2 py-1 bg-foreground rounded-md text-sm">{author}</div>
            ))}
            {manga.authors?.length > 10 && <span className="text-xs text-muted">+{manga.authors.length - 10} more</span>}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
            <strong className="text-muted">Artists:</strong> 
            { manga.artists && manga.artists.slice(0, 10).map((artist: string, index: number) => (
                <div key={index} className="px-2 py-1 bg-foreground rounded-md text-sm">{artist}</div>
            ))}
            {manga.artists?.length > 10 && <span className="text-xs text-muted">+{manga.artists.length - 10} more</span>}
        </div>
        <div className="flex gap-2 items-center flex-wrap mb-5">
            <strong className="text-muted">External Links:</strong> 
            {manga.links && manga.links.slice(0, 8).map((link: string, index: number) => (
                <a key={index} href={link} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-foreground rounded-md text-sm hover:bg-foreground/70">{getLinkName(link)}</a>
            ))}
            {manga.links?.length > 8 && <span className="text-xs text-muted">+{manga.links.length - 8} more</span>}
        </div>
    </div>
));

MangaDetails.displayName = "MangaDetails";

export default function Manga({ params }: { params: Promise<{ id: string }> }) {
    const [data, setData] = useState<{ manga: any; userStatus: any } | null>(null);
    const [analytics, setAnalytics] = useState<any>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let isMounted = true;
        const getMangaData = async () => {
            try {
                const { id } = await params;
                const [result, analyticsData] = await Promise.all([
                    fetchOne(id),
                    getMangaAnalytics(Number(id)).catch(() => null) // Don't fail if analytics fails
                ]);
                if (isMounted) {
                    setData(result);
                    setAnalytics(analyticsData?.stats);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Failed to fetch:", error);
            }
        };

        getMangaData();
        const intervalId = setInterval(getMangaData, 60000); // Refresh every 60 seconds

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [params]);

    if (loading || !data) return <div className="container mx-auto pt-10 text-center">Loading...</div>;

    const { manga, userStatus } = data;
    const lastChapterDate = manga.chapters.length > 0 ? manga.chapters[manga.chapters.length - 1].updatedAt : null;

    return (
        <>
            <MangaHeader cover={manga.cover.x350.x3 || manga.cover.raw.url} />
            <div className="container mx-auto pt-5">
                <div className="flex flex-row gap-6 place-content-evenly">
                    <div className="flex flex-col space-y-2 w-2/3 mb-5">
                        <h1 className="text-3xl font-bold">{manga.title} <span className="text-base text-muted">{formatToStars(manga.weightedScore)} {formatToRating(manga.weightedScore)}</span></h1>
                        {manga.nativeTitle && <h2 className="text-lg text-muted font-semibold">({manga.nativeTitle})</h2>}
                        
                        <div className="flex gap-2 items-center">
                            <span className="bg-green-400/20 w-fit px-2 py-1 rounded-lg capitalize">{manga.status}</span>
                            {analytics?.manga && (
                                <div className="flex items-center gap-3 text-sm text-muted">
                                    <div className="flex items-center">
                                        <Eye className="size-4 mr-1 text-blue-400" />
                                        <span className="font-semibold">{formatNumber(analytics.manga.totalViews)}</span>
                                        <span className="ml-1">views</span>
                                    </div>
                                    <div className="flex items-center">
                                        <TrendingUp className="size-4 mr-1 text-accent" />
                                        <span className="font-semibold">{formatNumber(analytics.manga.uniqueViews)}</span>
                                        <span className="ml-1">unique</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <p className="text-muted">{manga.description}</p>
                        {showDetails && <MangaDetails manga={manga} /> }

                        <div className="flex gap-2">
                            {manga.genres && manga.genres.map((item: string, index: number) => (
                                <Link href={`/catalog?genres=${item}`} key={index} className="bg-foreground w-fit px-2 py-1 rounded-lg capitalize hover:bg-foreground/50">{item}</Link>
                            ))}
                        </div>
                        
                        <button onClick={() => startTransition(() => setShowDetails(prev => !prev))} disabled={isPending} className="mt-4 px-4 py-2 bg-foreground text-primary rounded-lg w-fit hover:bg-foreground/50 hover:cursor-pointer disabled:opacity-50">
                            {showDetails ? "Hide Details" : "Show Details..."}
                        </button>

                        <MangaActions manga={manga} comments={manga.comments} userStatus={userStatus} />
                    </div>

                    <div className="relative -top-35 flex flex-col w-[319] z-25">
                        <div className="w-full overflow-hidden rounded-md border-4 border-background shadow-lg">
                            <img src={manga.cover.raw.url} alt="manga" className="w-full h-full object-cover" />
                        </div>
                        <div className="bg-foreground rounded-md p-5 w-full mt-5">
                            <div className="flex flex-col">
                                <div className="flex justify-between w-full text-muted capitalize">Rating <span>{manga.contentRating}</span></div>
                                <div className="flex justify-between w-full text-muted">Release Year <span>{manga.year}</span></div>
                                <div className="flex justify-between w-full text-muted">Total Chapters <span>{manga.totalChapters}</span></div>
                                <div className="flex justify-between w-full text-muted">Has Anime? <span>{manga.hasAnime ? "Yes" : "No"}</span></div>
                                <div className="flex justify-between w-full text-muted">Score <span>{Math.floor(manga.weightedScore)}</span></div>
                            </div>
                        </div>
                        <div className="bg-foreground rounded-md p-5 w-full mt-2">
                            <div className="flex justify-between w-full text-muted text-sm">Meta Updated: <span className="text-normal">{formatDate(manga.lastUpdatedAt)}</span></div>
                            <div className="flex justify-between w-full text-muted text-sm">Chapters Updated: <span className="text-normal">{lastChapterDate ? formatDate(lastChapterDate) : "N/A"}</span></div>
                        </div>

                        <div className="bg-foreground rounded-md p-5 w-full mt-2">
                            <div className="flex flex-col">
                                <h2 className="text-lg font-bold mb-3">Relations</h2>
                                {manga.relationships && Object.keys(manga.relationships).length > 0 ? (
                                    <div className="flex flex-col gap-4">
                                        {Object.entries(manga.relationships).map(([category, items]: [string, any]) => (
                                            <div key={category} className="flex flex-col gap-2">
                                                <h3 className="text-sm font-semibold capitalize text-muted">{category}</h3>
                                                <div className="flex flex-col gap-2 pl-2 border-l border-muted/30">
                                                    {items.map((item: any, index: number) => (
                                                        <Link key={index} href={`/manga/${item.id}`} className="flex gap-2 items-start hover:opacity-80 transition-opacity" >
                                                            {item.image?.x150?.x2 && ( <img src={item.image.x150.x2} alt={item.name} className="w-12 h-16 object-cover rounded"/>)}
                                                            <div className="flex flex-col justify-center">
                                                                <span className="text-sm font-medium">{item.name}</span>
                                                                <span className="text-xs text-muted">ID: {item.id}</span>
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-muted">No relations available.</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}