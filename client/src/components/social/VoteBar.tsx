"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function VoteBar({votes, itemId, userId, onVote, showLabels = false}: {
  votes: { userId: string; type: string }[];
  itemId: number;
  userId?: string;
  onVote: (id: number, type: "like" | "dislike") => void;
  showLabels?: boolean;
}) {
  const myVote = votes?.find((v) => v.userId === userId)?.type;
  const likes = votes?.filter((v) => v.type === "like").length ?? 0;
  const dislikes = votes?.filter((v) => v.type === "dislike").length ?? 0;
  
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onVote(itemId, "like")}
        className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === "like" ? "text-green-400" : "text-muted hover:text-green-400"}`}
      >
        <ThumbsUp className="size-4" />
        {showLabels ? <span>Upvote</span> : null}
        <span className="tabular-nums">{likes}</span>
      </button>
      <button
        type="button"
        onClick={() => onVote(itemId, "dislike")}
        className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === "dislike" ? "text-red-400" : "text-muted hover:text-red-400"}`}
      >
        <ThumbsDown className="size-4" />
        {showLabels ? <span>Downvote</span> : null}
        <span className="tabular-nums">{dislikes}</span>
      </button>
    </div>
  );
}
