"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchListComments, postListComment, voteListComment, deleteListComment, type ListCommentSort, type ListCommentNode, type ListCommentPagination } from "@/services/curatedListService";
import { toast } from "react-toastify";
import { useUser } from "@/providers/UserProvider";
import ContentComposer from "@/components/content/ContentComposer";
import CommentListHeader from "@/components/content/CommentListHeader";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { toastApiError } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

const SORT_OPTIONS: { value: ListCommentSort; label: string }[] = [
  { value: "top", label: "Best" },
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "worst", label: "Worst" },
];

function CommentOverflowMenu({ id, authorId, userId, isAdmin, menuOpenId, setMenuOpenId, onDelete, nested }: {
  id: number; authorId?: string; userId?: string; isAdmin: boolean; menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void; onDelete: () => void; nested?: boolean;
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
      onDelete={onDelete}
      adminItems={isAdmin && !isOwner ? [{ label: "Delete", variant: "danger", onClick: onDelete }] : []}
    />
  );
}

function countReplies(node: ListCommentNode): number {
  if (!node.replies?.length) return 0;
  return node.replies.reduce((sum, r) => sum + 1 + countReplies(r), 0);
}

export default function ListComments({ listId, initialComments, initialPagination, hideTitle }: {
  listId: number;
  initialComments: ListCommentNode[];
  initialPagination?: ListCommentPagination;
  hideTitle?: boolean;
}) {
  const { user } = useUser();
  const isAdmin = isAdminUser(user?.role);
  const [comments, setComments] = useState(initialComments ?? []);
  const [pagination, setPagination] = useState(initialPagination);
  const [sort, setSort] = useState<ListCommentSort>("recent");
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { isRateLimited, applyRateLimitFromError, rateLimitSecondsLeft } = useSubmitRateLimit();
  const rateHint = isRateLimited ? `Please wait ${rateLimitSecondsLeft}s before commenting again.` : undefined;

  useEffect(() => {
    setComments(initialComments ?? []);
    setPagination(initialPagination);
  }, [initialComments, initialPagination]);

  const reload = useCallback(async (nextSort: ListCommentSort, page = 1, append = false) => {
    try {
      const data = await fetchListComments(listId, { sort: nextSort, page });
      setComments((prev) => (append ? [...prev, ...data.comments] : data.comments));
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load comments");
    }
  }, [listId]);

  const handleSubmit = async (content: string, parentId: number | null = null) => {
    if (!requireAuth(user, `/lists/${listId}`)) return;
    if (isSubmitting || isRateLimited) return;
    if (!requireTrimmed(content, parentId ? "Please write a reply." : "Please write a comment.")) return;
    setIsSubmitting(true);
    try {
      await postListComment(listId, { content, parentId: parentId ?? undefined });
      setText("");
      setReplyText("");
      setReplyingTo(null);
      if (parentId) setExpandedComments((prev) => [...new Set([...prev, parentId])]);
      toast.success(parentId ? "Reply posted" : "Comment posted");
      await reload(sort, 1, false);
    } catch (err) {
      if (!applyRateLimitFromError(err)) toastApiError(err, "Failed to post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (commentId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, `/lists/${listId}`)) return;
    try {
      await voteListComment(listId, commentId, type);
      await reload(sort, pagination?.page ?? 1, false);
    } catch (err) {
      toastApiError(err, "Failed to vote.");
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await deleteListComment(listId, commentId);
      await reload(sort, 1, false);
    } catch (err) {
      toastApiError(err, "Failed to delete.");
    }
  };

  const renderComment = (comment: ListCommentNode, depth = 0) => {
    const nested = depth > 0;
    const replyCount = countReplies(comment);
    const repliesExpanded = expandedComments.includes(comment.id);

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
            if (!requireAuth(user, `/lists/${listId}`)) return;
            setReplyingTo(replyingTo === comment.id ? null : comment.id);
          }}
          replyActive={replyingTo === comment.id}
          repliesToggle={replyCount > 0 ? { count: replyCount, expanded: repliesExpanded, onClick: () => setExpandedComments((prev) => prev.includes(comment.id) ? prev.filter((id) => id !== comment.id) : [...prev, comment.id]) } : undefined}
          overflowMenu={
            <CommentOverflowMenu id={comment.id} authorId={comment.author?.id ?? comment.userId} userId={user?.id} isAdmin={isAdmin} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId} onDelete={() => void handleDelete(comment.id)} nested={nested} />
          }
        >
          {replyingTo === comment.id && (
            <ContentComposer value={replyText} onChange={setReplyText} placeholder="Write a reply…" rows={3} minHeight="min-h-[80px]" maxLength={CONTENT_LIMITS.listComment} onSubmit={() => handleSubmit(replyText, comment.id)} submitLabel="Post reply" submitting={isSubmitting} disabled={isSubmitting} rateLimited={isRateLimited} rateLimitHint={rateHint} layout="reply" onCancel={() => { setReplyingTo(null); setReplyText(""); }} />
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
    <section className={hideTitle ? "pt-2" : "mt-10"}>
      {!hideTitle && <h2 className="text-xl font-semibold text-primary mb-4">Comments</h2>}
      {user && (
        <ContentComposer value={text} onChange={setText} placeholder="Write your comment…" rows={5} minHeight="min-h-[100px]" maxLength={CONTENT_LIMITS.listComment} onSubmit={() => handleSubmit(text)} submitLabel="Post comment" submitting={isSubmitting} disabled={isSubmitting} rateLimited={isRateLimited} rateLimitHint={rateHint} layout="comment" avatarUrl={user.image} className="mb-5" />
      )}
      <CommentListHeader
        total={pagination?.total ?? comments.length}
        sort={sort}
        options={SORT_OPTIONS}
        onSortChange={(v) => { setSort(v); void reload(v, 1, false); }}
      />
      <div className="space-y-4">{comments.map((c) => renderComment(c))}</div>
      {!comments.length && <p className="text-muted text-center py-8">No comments yet.</p>}
      {pagination?.hasMore && (
        <div className="flex justify-center mt-6">
          <button type="button" disabled={loadingMore} onClick={async () => { setLoadingMore(true); try { await reload(sort, (pagination?.page ?? 1) + 1, true); } finally { setLoadingMore(false); } }} className="px-4 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50">{loadingMore ? "Loading..." : "Load more"}</button>
        </div>
      )}
    </section>
  );
}
