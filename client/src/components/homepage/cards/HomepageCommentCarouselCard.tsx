"use client";

import Link from "next/link";
import { memo } from "react";
import UserAvatar from "@/components/UserAvatar";
import { formatTimeAgo } from "@/lib/utils";
import { extractImageUrls, toContentImageDisplayUrl } from "@/lib/contentImages";
import { markdownToPlainText } from "@/lib/markdownPreview";
import { mangaPath } from "@/lib/paths";

function HomepageCommentCarouselCard({ comment }: { comment: { id: number; content: string; createdAt: string; author?: { id: string; name?: string; image?: string | null }; series?: { id: number; title?: string } } }) {
  const imageUrls = extractImageUrls(comment.content);
  const previewText = markdownToPlainText(comment.content);

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
          <div className="mt-2 min-w-0">
            {imageUrls.length > 0 ? (
              <div className={`flex flex-wrap items-center gap-1 ${previewText ? "mb-1.5" : ""}`}>
                {imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={toContentImageDisplayUrl(url)} alt="" className="size-10 object-contain" loading="lazy" />
                ))}
              </div>
            ) : null}
            {previewText ? <p className="line-clamp-3 text-sm leading-relaxed text-muted">{previewText}</p> : null}
          </div>
        </div>
      </div>
      <Link href={comment.series?.id != null ? mangaPath(comment.series.id) : "#"} className="mt-auto pt-3 truncate text-xs font-medium text-accent transition-colors hover:underline">
        {comment.series?.title}
      </Link>
    </article>
  );
}

export default memo(HomepageCommentCarouselCard);
