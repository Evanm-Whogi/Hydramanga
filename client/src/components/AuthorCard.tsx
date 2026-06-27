"use client";

import Link from "next/link";
import { memo } from "react";
import { BookOpen, PenTool } from "lucide-react";
import type { AuthorSummary } from "@/services/authorService";
import { authorPath } from "@/lib/paths";

function AuthorCard({ author }: { author: AuthorSummary }) {
  const covers = author.previewCovers ?? [];

  return (
    <Link href={authorPath(author.name)} className="flex gap-4 p-4 rounded-xl border border-borders bg-foreground hover:bg-foreground/80 transition-colors group min-h-38 shadow-md">
      <div className="shrink-0 w-28 h-36 rounded-lg overflow-hidden bg-background grid grid-cols-2 grid-rows-2 gap-px">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative overflow-hidden bg-foreground min-h-0 min-w-0">
            {covers[i] ? (
              <img src={covers[i]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted"><PenTool className="size-4" /></div>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col flex-1 min-w-0 gap-1 py-0.5">
        <h3 className="font-semibold text-primary line-clamp-2 group-hover:text-accent transition-colors">{author.name}</h3>
        {author.type ? <p className="text-xs text-muted capitalize">{author.type}</p> : null}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted mt-auto">
          <span className="inline-flex items-center gap-1"><BookOpen className="size-3" />{author.works} {author.works === 1 ? "work" : "works"}</span>
        </div>
      </div>
    </Link>
  );
}

export default memo(AuthorCard);
