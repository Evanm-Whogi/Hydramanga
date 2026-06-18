"use client";

import Link from "next/link";
import { MessageCircle, TrendingDown, TrendingUp } from "lucide-react";
import { memo } from "react";
import UserAvatar from "@/components/UserAvatar";
import BadgeList from "@/components/badges/BadgeList";
import type { EarnedBadge } from "@/lib/badgeConfig";

const RANK_STYLES: Record<number, string> = {
  1: "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30",
  2: "bg-slate-400/15 text-slate-300 ring-slate-400/30",
  3: "bg-amber-700/15 text-amber-500 ring-amber-700/30",
};

function CommentTrendLabel({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-500">
        <TrendingUp className="size-3" />
        +{trend}%
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <TrendingDown className="size-3" />
        {trend}%
      </span>
    );
  }
  return null;
}

function HomepageCommenterCarouselCard({ user, rank }: { user: { id: string; name?: string; image?: string | null; badges?: EarnedBadge[]; totalComments?: number; trend?: number }; rank: number }) {
  const rankClass = RANK_STYLES[rank] ?? "bg-background text-muted ring-borders";

  return (
    <Link href={`/users/${user.id}`} className="group relative flex h-full min-h-44 flex-col items-center rounded-2xl border border-borders bg-foreground px-4 py-5 text-center transition-colors hover:border-accent/30 hover:bg-foreground/60">
      <span className={`absolute top-3 left-3 flex size-7 items-center justify-center rounded-full text-xs font-bold ring-1 ${rankClass}`}>{rank}</span>
      <UserAvatar src={user.image} width={72} height={72} className="size-18 rounded-full object-cover ring-2 ring-borders transition-transform duration-300 group-hover:scale-105" />
      <div className="mt-3 flex w-full min-w-0 items-center justify-center gap-1.5">
        <p className="truncate text-sm font-medium text-primary">{user.name}</p>
        <BadgeList badges={user.badges} iconSize={12} />
      </div>
      <div className="mt-auto flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3" />
          {user.totalComments?.toLocaleString()}
        </span>
        <CommentTrendLabel trend={user.trend ?? 0} />
      </div>
    </Link>
  );
}

export default memo(HomepageCommenterCarouselCard);
