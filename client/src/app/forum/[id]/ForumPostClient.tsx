"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, MessageSquare, Pin } from "lucide-react";
import { toast } from "react-toastify";
import { getBoardPost, createBoardReply, voteBoardPost, voteBoardReply, adminBoardPost, updateBoardPost, deleteBoardPost, updateBoardReply, deleteBoardReply } from "@/services/boardService";
import { useUser } from "@/providers/UserProvider";
import ContentComposer from "@/components/content/ContentComposer";
import CommentListHeader from "@/components/content/CommentListHeader";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import VoteBar from "@/components/social/VoteBar";
import MarkdownView from "@/components/markdown/MarkdownView";
import Pill from "@/components/Pill";
import UserAvatar from "@/components/UserAvatar";
import SingleDropdown from "@/components/Dropdown";
import { FORUM_POST_CATEGORY_OPTIONS, getForumCategoryLabel } from "@/constants/forumCategories";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { boardPostAdminItems, isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";
import { formatTimeAgo } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { applyPostVote, applyReplyVote, postVoteScore } from "@/lib/forumExcerpt";

type ReplySort = "recent" | "oldest" | "top" | "worst";

const SORT_OPTIONS: { value: ReplySort; label: string }[] = [
  { value: "top", label: "Best" },
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "worst", label: "Worst" },
];

function ForumReplyOverflowMenu({ id, authorId, userId, isAdmin, menuOpenId, setMenuOpenId, onEdit, onDelete, nested}: {
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

function countReplies(node: { replies?: any[] }): number {
  if (!node.replies?.length) return 0;
  return node.replies.reduce((sum, reply) => sum + 1 + countReplies(reply), 0);
}

function countBoardReplies(nodes: { replies?: any[] }[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countBoardReplies(node.replies ?? []), 0);
}

function sortReplies(replies: any[], sort: ReplySort): any[] {
  const sorted = [...replies];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "top":
      return sorted.sort((a, b) => postVoteScore(b.votes) - postVoteScore(a.votes));
    case "worst":
      return sorted.sort((a, b) => postVoteScore(a.votes) - postVoteScore(b.votes));
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export default function ForumPostClient({ postId }: { postId: number }) {
  const router = useRouter();
  const { user } = useUser();
  const [detail, setDetail] = useState<{ post: any; replies: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<ReplySort>("recent");
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<number[]>([]);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editReplyText, setEditReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = isAdminUser(user?.role);
  const { isRateLimited: isReplyRateLimited, applyRateLimitFromError: applyReplyRateLimit, rateLimitSecondsLeft: replyRateLimitSecondsLeft } = useSubmitRateLimit();
  const replyRateHint = isReplyRateLimited ? `Please wait ${replyRateLimitSecondsLeft}s before replying again.` : undefined;

  const loadPost = (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    getBoardPost(postId)
      .then((data) => {
        if (!data?.post) {
          setDetail(null);
          return;
        }
        setDetail(data);
      })
      .catch(() => {
        if (!options?.silent) setDetail(null);
        toast.error("Failed to load post");
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    loadPost();
  }, [postId]);

  const handleReply = async (content: string, parentId?: number) => {
    if (!requireAuth(user, `/forum/${postId}`)) return;
    if (isSubmitting || isReplyRateLimited) return;
    if (!requireTrimmed(content, parentId ? "Please write a reply." : "Please write a comment.")) return;
    setIsSubmitting(true);
    try {
      await createBoardReply(postId, content, parentId);
      setText("");
      setReplyText("");
      setReplyingToId(null);
      if (parentId) setExpandedReplies((prev) => [...new Set([...prev, parentId])]);
      loadPost({ silent: true });
      toast.success(parentId ? "Reply posted" : "Comment posted");
    } catch (err: unknown) {
      if (!applyReplyRateLimit(err)) toastApiError(err, "Failed to reply");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdmin = async (updates: Record<string, boolean>) => {
    try {
      await adminBoardPost(postId, updates);
      setMenuOpenId(null);
      if (updates.isDeleted) {
        router.push("/forum");
        toast.success("Post deleted");
        return;
      }
      loadPost({ silent: true });
      toast.success("Updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update");
    }
  };

  if (loading && !detail) {
    return <p className="container mx-auto px-4 xl:px-0 pt-25 pb-8 text-muted text-sm">Loading…</p>;
  }

  if (!detail?.post) {
    return (
      <div className="container mx-auto px-4 xl:px-0 pt-25 pb-8 space-y-4">
        <p className="text-muted">Post not found.</p>
        <Link href="/forum" className="inline-flex items-center gap-2 text-accent hover:underline">
          <ArrowLeft className="size-4" />
          Back to Forum
        </Link>
      </div>
    );
  }

  const current = detail.post;
  const replies = detail.replies ?? [];
  const isLocked = Boolean(current.isLocked);
  const isOwner = current.author?.id === user?.id;
  const postMenuKey = current.id;

  const handleSubmitReply = async (parentId?: number) => {
    const content = parentId ? replyText : text;
    await handleReply(content, parentId);
  };

  const handleVoteReply = async (replyId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, `/forum/${postId}`)) return;
    if (!user?.id) return;
    const previous = detail;
    setDetail((current) => {
      if (!current) return current;
      return { ...current, replies: applyReplyVote(current.replies, replyId, user.id, type) };
    });
    try {
      await voteBoardReply(replyId, type);
    } catch (err: unknown) {
      setDetail(previous);
      toastApiError(err, "Failed to vote.");
    }
  };

  const startEditReply = (reply: { id: number; content: string }) => {
    setEditingReplyId(reply.id);
    setEditReplyText(reply.content);
  };

  const renderBoardReply = (reply: any, depth = 0) => {
    const nested = depth > 0;
    const replyCount = countReplies(reply);
    const repliesExpanded = expandedReplies.includes(reply.id);

    if (editingReplyId === reply.id) {
      return (
        <div key={reply.id} className={`rounded-lg p-4 border border-borders space-y-2 ${nested ? "bg-background ml-4 border-l-2 border-l-borders pl-3" : "bg-foreground"}`}>
          <ContentComposer
            value={editReplyText}
            onChange={setEditReplyText}
            placeholder="Edit comment…"
            rows={nested ? 3 : 5}
            minHeight={nested ? "min-h-[80px]" : "min-h-[100px]"}
            maxLength={CONTENT_LIMITS.boardReply}
            onSubmit={() => void handleSaveReply(reply.id)}
            submitLabel="Save"
            layout="embedded"
            onCancel={() => setEditingReplyId(null)}
          />
        </div>
      );
    }

    return (
      <div key={reply.id} className={nested ? "ml-4 border-l-2 border-l-borders pl-3" : ""}>
        <SocialPostCard
          variant={nested ? "nested" : "root"}
          author={reply.author}
          createdAt={reply.createdAt}
          content={reply.content}
          votes={reply.votes ?? []}
          itemId={reply.id}
          userId={user?.id}
          onVote={handleVoteReply}
          onReply={!isLocked ? () => {
            if (!requireAuth(user, `/forum/${postId}`)) return;
            setReplyingToId(replyingToId === reply.id ? null : reply.id);
          } : undefined}
          replyActive={replyingToId === reply.id}
          repliesToggle={
            replyCount > 0
              ? {
                  count: replyCount,
                  expanded: repliesExpanded,
                  onClick: () =>
                    setExpandedReplies((prev) =>
                      prev.includes(reply.id) ? prev.filter((id) => id !== reply.id) : [...prev, reply.id]
                    ),
                }
              : undefined
          }
          overflowMenu={
            <ForumReplyOverflowMenu
              id={reply.id}
              authorId={reply.author?.id}
              userId={user?.id}
              isAdmin={isAdmin}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              onEdit={() => startEditReply(reply)}
              onDelete={() => void handleDeleteReply(reply.id)}
              nested={nested}
            />
          }
        >
          {replyingToId === reply.id && !isLocked && (
            <ContentComposer
              value={replyText}
              onChange={setReplyText}
              placeholder="Write a reply…"
              rows={3}
              minHeight="min-h-[80px]"
              maxLength={CONTENT_LIMITS.boardReply}
              onSubmit={() => void handleSubmitReply(reply.id)}
              submitLabel="Post reply"
              submitting={isSubmitting}
              disabled={isSubmitting}
              rateLimited={isReplyRateLimited}
              rateLimitHint={replyRateHint}
              layout="reply"
              onCancel={() => {
                setReplyingToId(null);
                setReplyText("");
              }}
            />
          )}

          {repliesExpanded && reply.replies?.length ? (
            <div className="space-y-3 pt-3 mt-1 border-t border-borders">
              {reply.replies.map((child: any) => renderBoardReply(child, depth + 1))}
            </div>
          ) : null}
        </SocialPostCard>
      </div>
    );
  };

  const handleSavePost = async () => {
    if (!requireTrimmed(editTitle, "Please enter a title.")) return;
    if (!requireTrimmed(editContent, "Please write your post.")) return;
    try {
      await updateBoardPost(current.id, { title: editTitle, content: editContent, category: editCategory });
      setEditingPost(false);
      loadPost({ silent: true });
      toast.success("Post updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update post");
    }
  };

  const handleDeletePost = async () => {
    try {
      await deleteBoardPost(current.id);
      router.push("/forum");
      toast.success("Post deleted");
    } catch (err: unknown) {
      toastApiError(err, "Failed to delete post");
    }
  };

  const handleSaveReply = async (replyId: number) => {
    if (!requireTrimmed(editReplyText, "Please write a reply.")) return;
    try {
      await updateBoardReply(replyId, editReplyText);
      setEditingReplyId(null);
      loadPost({ silent: true });
      toast.success("Reply updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update reply");
    }
  };

  const handleDeleteReply = async (replyId: number) => {
    try {
      await deleteBoardReply(replyId);
      loadPost({ silent: true });
      toast.success("Reply deleted");
    } catch (err: unknown) {
      toastApiError(err, "Failed to delete reply");
    }
  };

  const overflowMenu = (isOwner || isAdmin) ? (
    <ContentOverflowMenu
      open={menuOpenId === postMenuKey}
      onOpenChange={(open) => setMenuOpenId(open ? postMenuKey : null)}
      isOwner={isOwner}
      isAdmin={isAdmin}
      onEdit={
        isOwner
          ? () => {
              setEditTitle(current.title);
              setEditContent(current.content);
              setEditCategory(current.category || "general");
              setEditingPost(true);
            }
          : undefined
      }
      onDelete={isOwner ? () => void handleDeletePost() : undefined}
      adminItems={
        isAdmin
          ? boardPostAdminItems(current, {
              onPin: () => void handleAdmin({ isPinned: !current.isPinned }),
              onLock: () => void handleAdmin({ isLocked: !current.isLocked }),
              onDelete: !isOwner ? () => void handleAdmin({ isDeleted: true }) : undefined,
            })
          : []
      }
    />
  ) : undefined;

  const replyCount = countBoardReplies(replies);
  const sortedReplies = sortReplies(replies, sort);

  return (
    <div className="container mx-auto px-4 xl:px-0 pt-25 pb-8 flex flex-col gap-8 w-full max-w-full md:max-w-2/3">
      <Link href="/forum" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent w-fit">
        <ArrowLeft className="size-4" />
        Back to Forum
      </Link>

      {editingPost ? (
        <div className="space-y-3 min-w-0">
          <input
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            placeholder="Title"
            maxLength={CONTENT_LIMITS.boardTitle}
            className="w-full min-w-0 bg-background rounded-lg px-3 py-2 text-primary border border-borders"
          />
          <div className="w-full sm:w-48">
            <SingleDropdown options={FORUM_POST_CATEGORY_OPTIONS as any} onChange={setEditCategory} initialValue={editCategory} size="w-full" />
          </div>
          <ContentComposer
            value={editContent}
            onChange={setEditContent}
            placeholder="Edit your post…"
            maxLength={CONTENT_LIMITS.boardPost}
            onSubmit={handleSavePost}
            submitLabel="Save"
            layout="embedded"
            onCancel={() => setEditingPost(false)}
          />
        </div>
      ) : (
        <article className="space-y-3 min-w-0 bg-foreground border border-borders rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <UserAvatar src={current.author?.image} width={48} height={48} className="size-12 rounded-full object-cover shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0 pt-0.5">
                <Link href={`/users/${current.author?.id}`} className="font-semibold text-primary hover:text-accent truncate">
                  {current.author?.name ?? "Unknown"}
                </Link>
                <span className="text-sm text-muted">{formatTimeAgo(current.createdAt)}</span>
              </div>
            </div>
            {overflowMenu}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill text={getForumCategoryLabel(current.category)} theme="accent" size="px-2.5 py-0.5 text-xs" />
            {current.isPinned ? <Pin className="size-4 text-accent shrink-0" aria-label="Pinned" /> : null}
            {current.isLocked ? <Lock className="size-4 text-red-400 shrink-0" aria-label="Locked" /> : null}
          </div>

          <h1 className="text-3xl font-bold text-primary wrap-break-words">{current.title}</h1>

          <div className="prose prose-invert max-w-none min-w-0 wrap-break-words text-primary">
            <MarkdownView content={current.content} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <VoteBar
              votes={current.votes ?? []}
              itemId={current.id}
              userId={user?.id}
              onVote={async (id, type) => {
                if (!requireAuth(user, `/forum/${postId}`)) return;
                if (!user?.id) return;
                const previous = detail;
                setDetail((current) => {
                  if (!current) return current;
                  const [post] = applyPostVote([current.post], id, user.id, type);
                  return { ...current, post };
                });
                try {
                  await voteBoardPost(id, type);
                } catch (err: unknown) {
                  setDetail(previous);
                  toastApiError(err, "Failed to vote");
                }
              }}
              scoreMode
            />
            <div className="flex items-center gap-1.5">
              <MessageSquare className="size-4 shrink-0" />
              <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
            </div>
          </div>
        </article>
      )}

      <section>
        {isLocked ? (
          <p className="text-sm text-muted mb-5">This post is locked. New comments are disabled.</p>
        ) : user ? (
          <ContentComposer
            value={text}
            onChange={setText}
            placeholder="Write your comment…"
            rows={5}
            minHeight="min-h-[100px]"
            maxLength={CONTENT_LIMITS.boardReply}
            onSubmit={() => void handleSubmitReply()}
            submitLabel="Post comment"
            submitting={isSubmitting}
            disabled={isSubmitting}
            rateLimited={isReplyRateLimited}
            rateLimitHint={replyRateHint}
            layout="comment"
            avatarUrl={user.image}
            className="mb-5"
          />
        ) : null}

        <CommentListHeader
          total={replyCount}
          sort={sort}
          options={SORT_OPTIONS}
          onSortChange={setSort}
        />

        {!replies.length ? (
          <p className="text-muted text-sm">No comments yet. Be the first!</p>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedReplies.map((reply: any) => renderBoardReply(reply))}
          </div>
        )}
      </section>
    </div>
  );
}
