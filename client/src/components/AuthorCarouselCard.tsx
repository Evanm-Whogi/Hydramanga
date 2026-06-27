"use client";

import Link from "next/link";
import { memo } from "react";
import { PenTool } from "lucide-react";
import type { AuthorSummary } from "@/services/authorService";
import { authorPath } from "@/lib/paths";

function AuthorCarouselCard({ author }: { author: AuthorSummary }) {
  const cover = author.previewCovers?.[0];

  return (
    <Link href={authorPath(author.name)} prefetch={false} className="group flex h-full w-full flex-col">
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl bg-foreground">
        {cover ? (
          <img src={cover} alt={author.name} className="h-full w-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted"><PenTool className="size-8 opacity-40" /></div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-black/20 transition-colors duration-300 ease-in-out group-hover:bg-black/0" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white">{author.name}</h3>
          <p className="mt-1 text-xs text-white/70">{author.works} {author.works === 1 ? "work" : "works"}</p>
        </div>
      </div>
    </Link>
  );
}

export default memo(AuthorCarouselCard);
