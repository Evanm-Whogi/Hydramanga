"use client";

import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils";

export type SocialAuthor = {
  id?: string;
  name?: string;
  role?: string;
  levelName?: string;
};

function formatRole(role: string | undefined): string {
  if (!role) return "User";
  const lower = role.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default function AuthorByline({author,createdAt}: {
  author?: SocialAuthor;
  createdAt?: string;
}) {
  const role = formatRole(author?.role);
  const levelName = author?.levelName ?? "Rookie Reader";
  const isAdmin = author?.role?.toLowerCase() === "admin";

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
      <Link href={`/users/${author?.id}`} className="font-medium text-primary hover:text-accent">
        {author?.name ?? "Unknown"}
      </Link>
      <span className="text-muted">·</span>
      <span className={isAdmin ? "text-teal-400" : "text-muted"}>{role}</span>
      <span className="text-muted">·</span>
      <span className="text-muted">{levelName}</span>
      {createdAt && (
        <>
          <span className="text-muted">·</span>
          <span className="text-muted">{formatTimeAgo(createdAt)}</span>
        </>
      )}
    </div>
  );
}
