"use client";

import Link from "next/link";
import { BookOpen, Eye, Plus, Star } from "lucide-react";
import { memo, type MouseEvent } from "react";
import CoverImage from "@/components/CoverImage";
import { authClient } from "@/lib/auth";
import { requireAuth } from "@/lib/requireAuth";
import { formatCompactNumber, formatToRating } from "@/lib/utils";
import { formatChapterCount, formatDisplayStatus } from "@/lib/seriesFormat";

function SeriesGridCard({ seriesId, title, cover, href, type, status, rating, views, totalChapters, isNew, priority, onSaveClick, onNavigate }: {
  seriesId: number;
  title: string;
  cover: unknown;
  href: string;
  type?: string | null;
  status?: string | null;
  rating?: number | null;
  views?: number | null;
  totalChapters?: string | number | null;
  isNew?: boolean;
  priority?: boolean;
  onSaveClick?: (seriesId: number, title: string) => void;
  onNavigate?: () => void;
}) {
  const shouldHandleNavigate = (e: MouseEvent<HTMLAnchorElement>) =>
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey &&
    !e.defaultPrevented;

  const handlePointerDown = (e: MouseEvent<HTMLAnchorElement>) => {
    if (shouldHandleNavigate(e)) onNavigate?.();
  };

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleNavigate(e)) return;
    onNavigate?.();
  };

  const handleBookmarkClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void authClient.getSession().then(({ data }) => {
      if (!requireAuth(data?.user, window.location.pathname)) return;
      onSaveClick?.(seriesId, title);
    });
  };

  return (
    <Link href={href} prefetch={false} className="group flex h-full w-full flex-col" onPointerDown={handlePointerDown} onClick={handleClick}>
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-2xl bg-foreground">
        <CoverImage cover={cover} alt={title} priority={priority} className="h-full w-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-0 bg-black/20 transition-colors duration-300 ease-in-out group-hover:bg-black/0" />
        {isNew ? (
          <div className="absolute top-2 left-2 z-10" title="Newly Added">
            <span className="rounded-full bg-accent/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg">NEW</span>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-x-2 bg-black/50 px-3 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex items-center text-sm font-semibold text-white">
            <Star className="mr-1 size-3.5 fill-yellow-400 text-yellow-400" />
            {formatToRating(rating ?? null)}
          </div>
          <span aria-hidden className="text-white/60">·</span>
          <div className="flex items-center text-sm font-semibold text-white">
            <Eye className="mr-1 size-3.5 text-blue-300" />
            {views != null && views > 0 ? formatCompactNumber(views) : "0"}
          </div>
          <span aria-hidden className="text-white/60">·</span>
          <div className="flex items-center text-sm font-semibold text-white">
            <BookOpen className="mr-1 size-3.5 text-emerald-300" />
            {formatChapterCount(totalChapters)}
          </div>
        </div>
        {onSaveClick ? (
          <button
            type="button"
            aria-label={`Add ${title} to bookmarks`}
            onClick={handleBookmarkClick}
            className="absolute top-2 right-2 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-background text-primary opacity-0 shadow-md transition-opacity duration-300 group-hover:opacity-100 hover:bg-accent hover:text-white"
          >
            <Plus size={18} />
          </button>
        ) : null}
      </div>
      <div className="flex min-h-19 flex-col justify-start space-y-1 pt-2">
        <div className="flex place-content-between">
          <p className="text-xs font-medium capitalize text-muted">{type || "Unknown"}</p>
          <p className="text-xs font-medium capitalize text-muted">{formatDisplayStatus(status)}</p>
        </div>
        <h3 className="line-clamp-2 text-left text-sm leading-tight text-primary">{title}</h3>
      </div>
    </Link>
  );
}

export default memo(SeriesGridCard);
