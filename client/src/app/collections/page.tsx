import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import type { Metadata } from "next";
import { getCollections } from "@/services/mangaService";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Collections',
  description: 'Browse curated manga, manhwa, and manhua collections by genre and theme on HydraManga.',
  path: '/collections',
});

export default async function CollectionsPage() {
    const collections = await getCollections();

    return (
        <> 
            <PageHeader title="Collections" description="Explore curated manga collections by genre and theme." />
            <div className="container mx-auto text-primary flex flex-col py-10 min-h-[65vh] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.entries(collections).map(([genreName, details]: [string, any]) => (
                        <div key={genreName} className="p-4 rounded-md border border-borders bg-foreground">
                            <h1 className="text-xl font-bold">{genreName}</h1>
                            <p className="text-sm text-muted mt-2">{details.description}</p>
                            <div className="grid grid-cols-3 gap-2 place-content-between w-full mt-3">
                                {details.topManga.map((item: any) => (
                                    <Link key={item.id} href={`/manga/${item.id}`} className="transition hover:scale-105 duration-300">
                                        <img src={item?.cover?.raw?.url} alt={item.name} className="w-full h-36 md:h-72 object-cover rounded-md" />
                                    </Link>
                                ))}
                            </div>
                            <div className="flex place-content-between mt-3 items-center">
                                <span>{details.count} Titles</span>
                                <Link href={`/discover?genres=${genreName}`} className="text-md text-whiteunderline">View Collection</Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}