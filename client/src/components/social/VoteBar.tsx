"use client";

import type { MouseEvent } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toastApiError } from "@/lib/rateLimit";
import { postVoteScore } from "@/lib/forumExcerpt";

export default function VoteBar({votes, itemId, userId, onVote, showLabels = false, scoreMode = false, onClick}: {
  votes: { userId: string; type: string }[];
  itemId: number;
  userId?: string;
  onVote: (id: number, type: "like" | "dislike") => void | Promise<void>;
  showLabels?: boolean;
  scoreMode?: boolean;
  onClick?: (event: MouseEvent) => void;
}) {
  const myVote = votes?.find((v) => v.userId === userId)?.type;
  const likes = votes?.filter((v) => v.type === "like").length ?? 0;
  const dislikes = votes?.filter((v) => v.type === "dislike").length ?? 0;
  const score = postVoteScore(votes);

  const handleVoteClick = (event: MouseEvent, type: "like" | "dislike") => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
    void Promise.resolve(onVote(itemId, type)).catch((err) => {
      toastApiError(err, "Failed to vote.");
    });
  };

  if (scoreMode) {
    return (
      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={(event) => handleVoteClick(event, "like")}
          className={`inline-flex items-center hover:cursor-pointer transition-colors ${myVote === "like" ? "text-green-400" : "text-muted hover:text-green-400"}`}
          aria-label="Upvote"
        >
          <ThumbsUp className="size-4" />
        </button>
        <span className={`text-sm font-medium tabular-nums ${score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-muted"}`}>
          {score}
        </span>
        <button
          type="button"
          onClick={(event) => handleVoteClick(event, "dislike")}
          className={`inline-flex items-center hover:cursor-pointer transition-colors ${myVote === "dislike" ? "text-red-400" : "text-muted hover:text-red-400"}`}
          aria-label="Downvote"
        >
          <ThumbsDown className="size-4" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={(event) => handleVoteClick(event, "like")}
        className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === "like" ? "text-green-400" : "text-muted hover:text-green-400"}`}
      >
        <ThumbsUp className="size-4" />
        {showLabels ? <span>Upvote</span> : null}
        <span className="tabular-nums">{likes}</span>
      </button>
      <button
        type="button"
        onClick={(event) => handleVoteClick(event, "dislike")}
        className={`inline-flex items-center gap-1 text-sm hover:cursor-pointer transition-colors ${myVote === "dislike" ? "text-red-400" : "text-muted hover:text-red-400"}`}
      >
        <ThumbsDown className="size-4" />
        {showLabels ? <span>Downvote</span> : null}
        <span className="tabular-nums">{dislikes}</span>
      </button>
    </div>
  );
}
