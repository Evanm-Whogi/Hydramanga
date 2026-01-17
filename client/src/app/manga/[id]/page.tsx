"use server";
import { fetchOne } from '@/services/mangaService'
import { formatDate, formatToStars, formatToRating } from '@/lib/utils'
import Link from 'next/link';
import MangaActions from './components/MangaActions';

export default async function Manga(props: { params: Promise<{ id: string}> }) {
    const { id } = await props.params;
    const { manga, userStatus } = await fetchOne(id);
    
    return (
        <>
        <div className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110" style={{ '--manga-cover': `url(${manga.cover.x350.x3 || manga.cover.raw.url })` } as React.CSSProperties}></div>
            <div className="container mx-auto pt-5">
                <div className="flex flex-row gap-6 place-content-evenly">
                    <div className="flex flex-col space-y-2 w-2/3 mb-5">
                        <h1 className="text-3xl font-bold">{manga.title} <span className="text-base text-muted">{formatToStars(manga.weightedScore)} {formatToRating(manga.weightedScore)}</span></h1>
                        {manga.nativeTitle && <h2 className="text-lg text-muted font-semibold">({manga.nativeTitle})</h2>}
                        <span className="bg-green-400/20 w-fit px-2 py-1 rounded-lg capitalize">{manga.status}</span>
                        <p className='text-muted'>{manga.description}</p>
                        <div className="flex gap-2">
                            {manga.genres && manga.genres.map((item: string, index: number) => (
                                <Link href={`/catalog?genres=${item}`} key={index} className="bg-foreground w-fit px-2 py-1 rounded-lg capitalize hover:bg-foreground/50">{item}</Link>
                            ))}
                        </div>
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
                            <div className="flex justify-between w-full text-muted">Last Updated: <span>{formatDate(manga.lastUpdatedAt)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}