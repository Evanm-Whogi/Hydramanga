"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import MarkdownView from "@/components/markdown/MarkdownView";
import AuthorByline, { type SocialAuthor } from "./AuthorByline";
import SocialActionBar from "./SocialActionBar";

export default function SocialPostCard({
  author,
  createdAt,
  content,
  title,
  titlePrefix,
  headerRight,
  variant = "root",
  votes,
  itemId,
  userId,
  onVote,
  onReply,
  replyActive,
  replyDisabled,
  repliesToggle,
  overflowMenu,
  actionBarClassName,
  children,
  className = "",
  anchorId,
}: {
  author?: SocialAuthor & { image?: string | null };
  createdAt?: string;
  content: string;
  title?: string;
  titlePrefix?: ReactNode;
  headerRight?: ReactNode;
  variant?: "root" | "nested";
  votes?: { userId: string; type: string }[];
  itemId: number;
  userId?: string;
  onVote?: (id: number, type: "like" | "dislike") => void | Promise<void>;
  onReply?: () => void;
  replyActive?: boolean;
  replyDisabled?: boolean;
  repliesToggle?: { count: number; expanded: boolean; onClick: () => void };
  overflowMenu?: ReactNode;
  actionBarClassName?: string;
  children?: ReactNode;
  className?: string;
  /** HTML id for deep links (e.g. board#post-12) */
  anchorId?: string;
}) {
  const isNested = variant === "nested";
  const shell = isNested
    ? "bg-background rounded-lg p-3"
    : "bg-foreground rounded-lg p-4 border border-borders";
  const avatarSize = isNested ? 32 : 40;
  const topRight = overflowMenu || headerRight;
  const showTopRightAbsolute = topRight && !title;

  const body = (
    <div className="prose prose-invert max-w-none min-w-0 break-words overflow-x-hidden text-primary">
      <MarkdownView content={content} />
    </div>
  );

  return (
    <div id={anchorId} className={`${shell} relative scroll-mt-24 min-w-0 overflow-x-hidden ${className}`}>
      {showTopRightAbsolute && (
        <div className={`absolute ${isNested ? "top-3 right-3" : "top-4 right-4"} flex items-center gap-2 z-10`}>
          {headerRight}
          {overflowMenu}
        </div>
      )}

      {title && (
        <div className="flex justify-between items-start gap-3 mb-4 min-w-0 overflow-x-hidden">
          <div className="flex items-start gap-2 min-w-0 flex-1 overflow-hidden">
            {titlePrefix ? (
              <div className="flex shrink-0 items-center gap-1 pt-1">{titlePrefix}</div>
            ) : null}
            <h2 className="min-w-0 flex-1 text-2xl font-bold text-primary leading-tight break-words overflow-x-hidden">{title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            {overflowMenu}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Image
          src={author?.image || "/media/pfp/default.jpg"}
          alt=""
          width={avatarSize}
          height={avatarSize}
          className={`rounded-full object-cover shrink-0 ${isNested ? "size-8" : "size-10"}`}
        />
        <div className={`min-w-0 flex-1`}>
          <AuthorByline author={author} createdAt={createdAt} />
          <div className={title ? "mt-1" : "mt-2"}>{body}</div>
        </div>
      </div>

      <SocialActionBar
        className={actionBarClassName ?? "mt-3"}
        votes={votes}
        itemId={itemId}
        userId={userId}
        onVote={onVote}
        onReply={onReply}
        replyActive={replyActive}
        replyDisabled={replyDisabled}
        repliesToggle={repliesToggle}
      />

      {children}
    </div>
  );
}
