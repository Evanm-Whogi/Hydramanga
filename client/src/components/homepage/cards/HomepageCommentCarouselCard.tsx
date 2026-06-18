"use client";

import Link from "next/link";
import { memo } from "react";
import UserAvatar from "@/components/UserAvatar";
import { formatTimeAgo } from "@/lib/utils";
import { markdownToPlainText } from "@/lib/markdownPreview";
import { mangaPath } from "@/lib/paths";

function HomepageCommentCarouselCard({ comment }: { comment: { id: number; content: string; createdAt: string; author?: { id: string; name?: string; image?: string | null }; series?: { id: number; title?: string } } }) {
  return (
    <article className="flex h-full max-h-[155px] flex-col rounded-2xl border border-borders bg-foreground p-4 transition-colors hover:border-accent/30 hover:bg-foreground/60">
      <div className="flex items-start gap-3">
        <UserAvatar src={comment.author?.image} width={40} height={40} className="size-10 shrink-0 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/users/${comment.author?.id}`} className="text-sm font-medium text-primary transition-colors hover:text-accent">
              {comment.author?.name}
            </Link>
            <span className="text-xs text-muted">{formatTimeAgo(comment.createdAt)}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{markdownToPlainText(comment.content)}</p>
        </div>
      </div>
      <Link href={comment.series?.id != null ? mangaPath(comment.series.id) : "#"} className="mt-auto pt-3 truncate text-xs font-medium text-accent transition-colors hover:underline">
        {comment.series?.title}
      </Link>
    </article>
  );
}

export default memo(HomepageCommentCarouselCard);
