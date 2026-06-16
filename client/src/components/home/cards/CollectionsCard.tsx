import Link from 'next/link';

export default function CollectionCard({ collection }: { collection: any }) {
    return (
        <Link href={`/discover?genres=${collection.name}`} className="relative aspect-2/3 w-full overflow-hidden rounded-2xl shadow-md">
            <img src={`${collection.topManga[0].cover?.raw.url || '/notFound.png'}`} alt={collection.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute bottom-0 inset-x-0 flex flex-col items-start p-3 bg-linear-to-t from-transparent-card/80 to-transparent-card/50">
                <h3 className="text-lg font-semibold text-primary leading-tight line-clamp-2">{collection.name}</h3>
                <h4 className="text-sm text-muted font-medium mt-1 line-clamp-3">{collection.description}</h4>
            </div>
        </Link>
    );
}