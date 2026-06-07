"use client";

import Link from "next/link";
import { formatCompactNumber, formatTimeAgo } from "@/lib/utils";
import BadgeList from "@/components/badges/BadgeList";
import type { EarnedBadge } from "@/lib/badgeConfig";

export type SocialAuthor = {
  id?: string;
  name?: string;
  role?: string;
  levelName?: string;
  karmaTotal?: number;
  badges?: EarnedBadge[];
};

export default function AuthorByline({author, createdAt}: {
  author?: SocialAuthor;
  createdAt?: string;
}) {
  const karmaTotal = author?.karmaTotal ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
      <Link href={`/users/${author?.id}`} className="font-medium text-primary hover:text-accent">
        {author?.name ?? "Unknown"}
      </Link>
      {author?.badges?.length ? (
        <>
          <span className="text-muted">·</span>
          <BadgeList badges={author.badges} />
        </>
      ) : null}
      <span className="text-muted tabular-nums rounded-md bg-background px-2 py-1">{formatCompactNumber(karmaTotal)}</span>
      {createdAt && (
        <>
          <span className="text-muted">·</span>
          <span className="text-muted">{formatTimeAgo(createdAt)}</span>
        </>
      )}
    </div>
  );
}
