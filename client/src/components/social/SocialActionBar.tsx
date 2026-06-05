"use client";

import { ChevronDown, MessageSquare } from "lucide-react";
import VoteBar from "./VoteBar";

export function ReplyButton({
  active,
  disabled,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active ? "text-accent" : "text-muted hover:text-primary"
      }`}
    >
      <MessageSquare className="size-4" />
      Reply
    </button>
  );
}

export function RepliesToggle({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  const label = count === 1 ? "1 reply" : `${count} replies`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors"
      aria-expanded={expanded}
    >
      <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      {label}
    </button>
  );
}

export default function SocialActionBar({
  votes,
  itemId,
  userId,
  onVote,
  onReply,
  replyActive,
  replyDisabled,
  repliesToggle,
  className = "",
}: {
  votes?: { userId: string; type: string }[];
  itemId: number;
  userId?: string;
  onVote?: (id: number, type: "like" | "dislike") => void | Promise<void>;
  onReply?: () => void;
  replyActive?: boolean;
  replyDisabled?: boolean;
  repliesToggle?: { count: number; expanded: boolean; onClick: () => void };
  className?: string;
}) {
  const hasLeft = onVote || onReply || repliesToggle;

  if (!hasLeft) return null;

  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      {onVote && votes && (
        <VoteBar votes={votes} itemId={itemId} userId={userId} onVote={onVote} />
      )}
      {onReply && (
        <ReplyButton active={replyActive} disabled={replyDisabled} onClick={onReply} />
      )}
      {repliesToggle && repliesToggle.count > 0 && (
        <RepliesToggle
          count={repliesToggle.count}
          expanded={repliesToggle.expanded}
          onClick={repliesToggle.onClick}
        />
      )}
    </div>
  );
}
