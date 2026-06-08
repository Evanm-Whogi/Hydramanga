"use client";

import Link from "next/link";
import { memo } from "react";
import { Eye, Bookmark, ThumbsUp, ListIcon, Lock, Globe } from "lucide-react";
import type { CuratedList } from "@/services/curatedListService";
import { formatCompactNumber, formatTimeAgo } from "@/lib/utils";

function ListCard({ list }: { list: CuratedList }) {
  const covers = list.previewCovers ?? [];
  const netLikes = (list.likeCount ?? 0) - (list.dislikeCount ?? 0);
  const authorName = list.author?.displayUsername || list.author?.username || list.author?.name || "Unknown";

  return (
    <Link href={`/lists/${list.id}`} className="flex gap-4 p-4 rounded-xl border border-borders bg-foreground hover:bg-foreground/80 transition-colors group min-h-38">
      <div className="shrink-0 w-28 h-36 rounded-lg overflow-hidden bg-background grid grid-cols-2 grid-rows-2 gap-px">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative overflow-hidden bg-foreground min-h-0 min-w-0">
            {covers[i] ? (
              <img src={covers[i]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted"><ListIcon className="size-4" /></div>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col flex-1 min-w-0 gap-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-primary line-clamp-2 group-hover:text-accent transition-colors">{list.title}</h3>
          <span className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${list.visibility === 'private' ? 'bg-background text-muted' : 'bg-accent/20 text-accent'}`}>
            {list.visibility === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
            {list.visibility === 'private' ? 'Private' : 'Public'}
          </span>
        </div>
        <p className="text-xs text-muted">by <span className="text-primary">{authorName}</span></p>
        {list.description ? <p className="text-sm text-muted line-clamp-2 mt-1">{list.description}</p> : null}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted mt-auto">
          <span>{list.itemCount} manga</span>
          <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3" />{formatCompactNumber(netLikes)}</span>
          <span className="inline-flex items-center gap-1"><Eye className="size-3" />{formatCompactNumber(list.viewCount)}</span>
          <span className="inline-flex items-center gap-1"><Bookmark className="size-3" />{formatCompactNumber(list.saveCount)}</span>
          <span>{formatTimeAgo(list.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export default memo(ListCard);
