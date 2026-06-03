"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postComment, voteComment, updateComment, deleteComment } from "@/services/commentService";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";
import ContentComposer from "@/components/content/ContentComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";

function CommentOverflowMenu({
  id,
  authorId,
  userId,
  isAdmin,
  menuOpenId,
  setMenuOpenId,
  onEdit,
  onDelete,
  nested,
}: {
  id: number;
  authorId?: string;
  userId?: string;
  isAdmin: boolean;
  menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  nested?: boolean;
}) {
  const isOwner = authorId === userId;
  if (!isOwner && !isAdmin) return null;

  return (
    <ContentOverflowMenu
      open={menuOpenId === id}
      onOpenChange={(open) => setMenuOpenId(open ? id : null)}
      iconClassName={nested ? "size-4" : "size-5"}
      isOwner={isOwner}
      isAdmin={isAdmin}
      onEdit={isOwner ? onEdit : undefined}
      onDelete={isOwner ? onDelete : undefined}
      adminItems={
        isAdmin && !isOwner
          ? [{ label: "Delete", variant: "danger", onClick: onDelete }]
          : []
      }
    />
  );
}

export default function Comments({ manga, comments }: { manga: any; comments: any[] }) {
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = isAdminUser(user?.role);
  const {isRateLimited: isCommentRateLimited, applyRateLimitFromError: applyCommentRateLimit, rateLimitSecondsLeft: commentRateLimitSecondsLeft} = useSubmitRateLimit();

  const commentRateHint = isCommentRateLimited
    ? `Please wait ${commentRateLimitSecondsLeft}s before commenting again.`
    : undefined;

  const handleSubmit = async (content: string, parentId: number | null = null) => {
    if (!requireAuth(user, `/manga/${manga.id}`)) return;
    if (isSubmitting || isCommentRateLimited) return;
    if (!requireTrimmed(content, parentId ? "Please write a reply." : "Please write a comment.")) return;
    setIsSubmitting(true);
    try {
      const result = await postComment({ seriesId: manga.id, content, parentId, isSpoiler: false });
      setText("");
      setReplyText("");
      setReplyingTo(null);
      if (parentId) setExpandedComments((prev) => [...prev, parentId]);
      toast.success(parentId ? "Reply posted" : "Comment posted");
      router.refresh();
    } catch (err: unknown) {
      if (!applyCommentRateLimit(err)) toast.error("Failed to post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (commentId: number) => {
    if (!requireTrimmed(editText, "Please write a comment.")) return;
    try {
      await updateComment(commentId, editText);
      setEditingId(null);
      toast.success("Comment updated");
      router.refresh();
    } catch {
      toast.error("Failed to update.");
    }
  };

  const handleVote = async (commentId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, `/manga/${manga.id}`)) return;
    try {
      await voteComment(commentId, type);
      router.refresh();
    } catch {
      toast.error("Failed to vote.");
    }
  };

  const handleDelete = async (commentId: number, commentText: string) => {
    try {
      await deleteComment(commentId);
      router.refresh();
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const startEdit = (comment: { id: number; content: string }) => {
    setEditingId(comment.id);
    setEditText(comment.content);
  };

  const renderCommentBody = (comment: any, nested = false) => {
    if (editingId === comment.id) {
      return (
        <div className={`rounded-lg p-4 border border-borders space-y-2 ${nested ? "bg-background" : "bg-foreground"}`}>
          <ContentComposer
            value={editText}
            onChange={setEditText}
            placeholder="Edit comment…"
            rows={nested ? 3 : 5}
            minHeight={nested ? "min-h-[80px]" : "min-h-[100px]"}
            onSubmit={() => void handleUpdate(comment.id)}
            submitLabel="Save"
            layout="embedded"
            onCancel={() => setEditingId(null)}
          />
        </div>
      );
    }

    return (
      <SocialPostCard
        variant={nested ? "nested" : "root"}
        author={comment.author}
        createdAt={comment.createdAt}
        content={comment.content}
        votes={comment.votes}
        itemId={comment.id}
        userId={user?.id}
        onVote={handleVote}
        onReply={!nested ? () => {
          if (!requireAuth(user, `/manga/${manga.id}`)) return;
          setReplyingTo(replyingTo === comment.id ? null : comment.id);
        } : undefined}
        replyActive={!nested && replyingTo === comment.id}
        repliesToggle={
          !nested && (comment.replies?.length ?? 0) > 0
            ? {
                count: comment.replies.length,
                expanded: expandedComments.includes(comment.id),
                onClick: () =>
                  setExpandedComments((prev) =>
                    prev.includes(comment.id) ? prev.filter((id) => id !== comment.id) : [...prev, comment.id]
                  ),
              }
            : undefined
        }
        overflowMenu={
          <CommentOverflowMenu
            id={comment.id}
            authorId={comment.author?.id}
            userId={user?.id}
            isAdmin={isAdmin}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            onEdit={() => startEdit(comment)}
            onDelete={() => void handleDelete(comment.id, comment.content)}
            nested={nested}
          />
        }
      />
    );
  };

  return (
    <>
      {user && (
      <ContentComposer
        heading="Leave a Comment"
        value={text}
        onChange={setText}
        placeholder="Write your comment…"
        rows={5}
        minHeight="min-h-[100px]"
        onSubmit={() => handleSubmit(text)}
        submitLabel="Post comment"
        submitting={isSubmitting}
        disabled={isSubmitting}
        rateLimited={isCommentRateLimited}
        rateLimitHint={commentRateHint}
        layout="card"
        className="mb-5"
      />
      )}

      {!comments?.length ? (
        <p className="text-muted text-sm">No comments yet. Be the first!</p>
      ) : (
      <div className="flex flex-col gap-4">
        {comments.map((comment) => {
          const repliesExpanded = expandedComments.includes(comment.id);
          const replyCount = comment.replies?.length ?? 0;

          return (
            <div key={comment.id} className="flex flex-col gap-2">
              {renderCommentBody(comment)}

              {replyingTo === comment.id && (
                <ContentComposer
                  value={replyText}
                  onChange={setReplyText}
                  placeholder="Write a reply…"
                  rows={3}
                  minHeight="min-h-[80px]"
                  onSubmit={() => handleSubmit(replyText, comment.id)}
                  submitLabel="Post reply"
                  submitting={isSubmitting}
                  disabled={isSubmitting}
                  rateLimited={isCommentRateLimited}
                  rateLimitHint={commentRateHint}
                  layout="reply"
                  onCancel={() => {
                    setReplyingTo(null);
                    setReplyText("");
                  }}
                />
              )}

              {repliesExpanded && replyCount > 0 && (
                <div className="space-y-3 pt-1 border-t border-borders">
                  {comment.replies.map((reply: any) => (
                    <div key={reply.id}>{renderCommentBody(reply, true)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}
