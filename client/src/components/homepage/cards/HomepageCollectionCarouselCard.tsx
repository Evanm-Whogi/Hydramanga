"use client";

import Link from "next/link";
import { memo } from "react";
import CoverImage from "@/components/CoverImage";

function HomepageCollectionCarouselCard({ collection }: { collection: { name: string; description?: string; topManga?: { cover?: unknown }[] } }) {
  const cover = collection.topManga?.[0]?.cover;

  return (
    <Link href={`/discover?genres=${encodeURIComponent(collection.name)}`} prefetch={false} className="group flex h-full w-full flex-col">
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl bg-foreground">
        <CoverImage cover={cover} alt={collection.name} className="h-full w-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-0 bg-black/20 transition-colors duration-300 ease-in-out group-hover:bg-black/0" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white">{collection.name}</h3>
          {collection.description ? <p className="mt-1 line-clamp-2 text-xs text-white/70">{collection.description}</p> : null}
        </div>
      </div>
    </Link>
  );
}

export default memo(HomepageCollectionCarouselCard);
