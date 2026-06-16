"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postComment, voteComment, updateComment, deleteComment, fetchComments, type CommentSort, type CommentPagination } from "@/services/commentService";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";
import ContentComposer from "@/components/content/ContentComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { toastApiError } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

const SORT_OPTIONS: { value: CommentSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "top", label: "Top" },
  { value: "worst", label: "Worst" },
];

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

type CommentNode = {
  id: number;
  content: string;
  createdAt: string;
  author?: { id?: string };
  votes?: { userId: string; type: string }[];
  replies?: CommentNode[];
};

function countReplies(node: CommentNode): number {
  if (!node.replies?.length) return 0;
  return node.replies.reduce((sum, r) => sum + 1 + countReplies(r), 0);
}

export default function Comments({
  manga,
  chapterId,
  comments: initialComments,
  commentPagination: initialPagination,
  className,
}: {
  manga: { id: number };
  chapterId?: number;
  comments?: CommentNode[];
  commentPagination?: CommentPagination;
  className?: string;
}) {
  const [comments, setComments] = useState<CommentNode[]>(initialComments ?? []);
  const [pagination, setPagination] = useState<CommentPagination | undefined>(initialPagination);
  const [sort, setSort] = useState<CommentSort>("recent");
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(!chapterId);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = isAdminUser(user?.role);
  const {isRateLimited: isCommentRateLimited, applyRateLimitFromError: applyCommentRateLimit, rateLimitSecondsLeft: commentRateLimitSecondsLeft} = useSubmitRateLimit();

  const returnTo = chapterId ? `/manga/${manga.id}/read/${chapterId}` : `/manga/${manga.id}`;

  const commentRateHint = isCommentRateLimited
    ? `Please wait ${commentRateLimitSecondsLeft}s before commenting again.`
    : undefined;

  useEffect(() => {
    if (!chapterId) {
      setComments(initialComments ?? []);
      setPagination(initialPagination);
    }
  }, [chapterId, initialComments, initialPagination]);

  const reloadComments = useCallback(async (nextSort: CommentSort, page = 1, append = false) => {
    try {
      const result = await fetchComments(manga.id, { chapterId, sort: nextSort, page });
      setComments((prev) => (append ? [...prev, ...result.comments] : result.comments));
      setPagination(result.pagination);
      setInitialLoadDone(true);
    } catch {
      toast.error("Failed to load comments");
    }
  }, [manga.id, chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    setInitialLoadDone(false);
    setSort("recent");
    setReplyingTo(null);
    setEditingId(null);
    void reloadComments("recent", 1, false);
  }, [chapterId, manga.id, reloadComments]);

  const handleSortChange = async (nextSort: CommentSort) => {
    setSort(nextSort);
    await reloadComments(nextSort, 1, false);
  };

  const handleLoadMore = async () => {
    if (!pagination?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await reloadComments(sort, pagination.page + 1, true);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmit = async (content: string, parentId: number | null = null) => {
    if (!requireAuth(user, returnTo)) return;
    if (isSubmitting || isCommentRateLimited) return;
    if (!requireTrimmed(content, parentId ? "Please write a reply." : "Please write a comment.")) return;
    setIsSubmitting(true);
    try {
      await postComment({ seriesId: manga.id, chapterId, content, parentId, isSpoiler: false });
      setText("");
      setReplyText("");
      setReplyingTo(null);
      if (parentId) setExpandedComments((prev) => [...new Set([...prev, parentId])]);
      toast.success(parentId ? "Reply posted" : "Comment posted");
      await reloadComments(sort, 1, false);
      router.refresh();
    } catch (err: unknown) {
      if (!applyCommentRateLimit(err)) toastApiError(err, "Failed to post.");
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
      await reloadComments(sort, 1, false);
      router.refresh();
    } catch (err: unknown) {
      toastApiError(err, "Failed to update.");
    }
  };

  const handleVote = async (commentId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, returnTo)) return;
    try {
      await voteComment(commentId, type);
      await reloadComments(sort, pagination?.page ?? 1, false);
      router.refresh();
    } catch (err: unknown) {
      toastApiError(err, "Failed to vote.");
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await deleteComment(commentId);
      await reloadComments(sort, 1, false);
      router.refresh();
    } catch (err: unknown) {
      toastApiError(err, "Failed to delete.");
    }
  };

  const startEdit = (comment: { id: number; content: string }) => {
    setEditingId(comment.id);
    setEditText(comment.content);
  };

  const renderComment = (comment: CommentNode, depth = 0) => {
    const nested = depth > 0;
    const replyCount = countReplies(comment);
    const repliesExpanded = expandedComments.includes(comment.id);

    if (editingId === comment.id) {
      return (
        <div key={comment.id} className={`rounded-lg p-4 border border-borders space-y-2 ${nested ? "bg-background ml-4 border-l-2 border-l-borders" : "bg-foreground"}`}>
          <ContentComposer
            value={editText}
            onChange={setEditText}
            placeholder="Edit comment…"
            rows={nested ? 3 : 5}
            minHeight={nested ? "min-h-[80px]" : "min-h-[100px]"}
            maxLength={CONTENT_LIMITS.comment}
            onSubmit={() => void handleUpdate(comment.id)}
            submitLabel="Save"
            layout="embedded"
            onCancel={() => setEditingId(null)}
          />
        </div>
      );
    }

    return (
      <div key={comment.id} className={nested ? "ml-4 border-l-2 border-l-borders pl-3" : ""}>
        <SocialPostCard
          variant={nested ? "nested" : "root"}
          author={comment.author as any}
          createdAt={comment.createdAt}
          content={comment.content}
          votes={comment.votes}
          itemId={comment.id}
          userId={user?.id}
          onVote={handleVote}
          onReply={() => {
            if (!requireAuth(user, returnTo)) return;
            setReplyingTo(replyingTo === comment.id ? null : comment.id);
          }}
          replyActive={replyingTo === comment.id}
          repliesToggle={
            replyCount > 0
              ? {
                  count: replyCount,
                  expanded: repliesExpanded,
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
              onDelete={() => void handleDelete(comment.id)}
              nested={nested}
            />
          }
        >
          {replyingTo === comment.id && (
            <ContentComposer
              value={replyText}
              onChange={setReplyText}
              placeholder="Write a reply…"
              rows={3}
              minHeight="min-h-[80px]"
              maxLength={CONTENT_LIMITS.comment}
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

          {repliesExpanded && comment.replies?.length ? (
            <div className="space-y-3 pt-3 mt-1 border-t border-borders">
              {comment.replies.map((reply) => renderComment(reply, depth + 1))}
            </div>
          ) : null}
        </SocialPostCard>
      </div>
    );
  };

  return (
    <section className={className}>
      {chapterId && !initialLoadDone ? (
        <p className="text-muted text-sm py-4">Loading comments…</p>
      ) : (
    <>
      {user && (
      <ContentComposer
        heading="Leave a Comment"
        value={text}
        onChange={setText}
        placeholder="Write your comment…"
        rows={5}
        minHeight="min-h-[100px]"
        maxLength={CONTENT_LIMITS.comment}
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

      {comments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
          <label className="text-sm text-muted">
            Sort by{" "}
            <select
              value={sort}
              onChange={(e) => void handleSortChange(e.target.value as CommentSort)}
              className="ml-1 rounded-md border border-borders bg-background px-2 py-1 text-sm text-primary"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {pagination && pagination.total > 0 && (
            <span className="text-xs text-muted">{pagination.total} top-level comment{pagination.total === 1 ? "" : "s"}</span>
          )}
        </div>
      )}

      {!comments?.length ? (
        <p className="text-muted text-sm">No comments yet. Be the first!</p>
      ) : (
      <div className="flex flex-col gap-4">
        {comments.map((comment) => renderComment(comment))}
        {pagination?.hasMore && (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="self-center rounded-lg border border-borders bg-foreground px-4 py-2 text-sm text-primary hover:bg-foreground/70 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        )}
      </div>
      )}
    </>
      )}
    </section>
  );
}
