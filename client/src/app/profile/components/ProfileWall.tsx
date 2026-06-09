"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { createProfileWallPost, deleteProfileWallPost, getProfileWall, updateProfileWallPost, voteProfileWallPost, PROFILE_PAGE_SIZE, type ProfileWallPost, type ProfileWallSort, type ProfilePagination } from "@/services/profileService";
import ContentComposer from "@/components/content/ContentComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { useUser } from "@/providers/UserProvider";
import { requireAuth } from "@/lib/requireAuth";
import { toastApiError } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/contentMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

const SORT_OPTIONS: { value: ProfileWallSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "top", label: "Top" },
  { value: "worst", label: "Worst" },
];

function PostOverflowMenu({ id, authorId, userId, wallOwnerId, isAdmin, menuOpenId, setMenuOpenId, onEdit, onDelete, nested }: {
  id: number; authorId?: string; userId?: string; wallOwnerId: string; isAdmin: boolean; menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void; onEdit: () => void; onDelete: () => void; nested?: boolean;
}) {
  const isAuthor = authorId === userId;
  const isWallOwner = userId === wallOwnerId;
  if (!isAuthor && !isWallOwner && !isAdmin) return null;
  return (
    <ContentOverflowMenu
      open={menuOpenId === id}
      onOpenChange={(open) => setMenuOpenId(open ? id : null)}
      iconClassName={nested ? "size-4" : "size-5"}
      isOwner={isAuthor}
      isAdmin={isAdmin}
      onEdit={isAuthor ? onEdit : undefined}
      onDelete={isAuthor || isWallOwner ? onDelete : undefined}
      adminItems={isAdmin && !isAuthor ? [{ label: "Delete", variant: "danger", onClick: onDelete }] : []}
    />
  );
}

function countReplies(node: ProfileWallPost): number {
  if (!node.replies?.length) return 0;
  return node.replies.reduce((sum, r) => sum + 1 + countReplies(r), 0);
}

export default function ProfileWall({ identifier, wallOwnerId }: { identifier: string; wallOwnerId: string }) {
  const { user } = useUser();
  const isAdmin = isAdminUser(user?.role);
  const authPath = identifier === "me" ? "/users/me" : `/users/${identifier}`;
  const [posts, setPosts] = useState<ProfileWallPost[]>([]);
  const [pagination, setPagination] = useState<ProfilePagination | undefined>();
  const [sort, setSort] = useState<ProfileWallSort>("recent");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [expandedPosts, setExpandedPosts] = useState<number[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { isRateLimited, applyRateLimitFromError, rateLimitSecondsLeft } = useSubmitRateLimit();
  const rateHint = isRateLimited ? `Please wait ${rateLimitSecondsLeft}s before posting again.` : undefined;

  const reload = useCallback(async (nextSort: ProfileWallSort, page = 1, append = false) => {
    try {
      const data = await getProfileWall(identifier, page, PROFILE_PAGE_SIZE, nextSort);
      setPosts((prev) => (append ? [...prev, ...data.posts] : data.posts));
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load wall posts");
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    setLoading(true);
    void reload(sort, 1, false);
  }, [reload, sort]);

  const handleSubmit = async (content: string, parentId: number | null = null) => {
    if (!requireAuth(user, authPath)) return;
    if (isSubmitting || isRateLimited) return;
    if (!requireTrimmed(content, parentId ? "Please write a reply." : "Please write a post.")) return;
    setIsSubmitting(true);
    try {
      await createProfileWallPost(identifier, content, parentId ?? undefined);
      setText("");
      setReplyText("");
      setReplyingTo(null);
      if (parentId) setExpandedPosts((prev) => [...new Set([...prev, parentId])]);
      toast.success(parentId ? "Reply posted" : "Posted to wall");
      await reload(sort, 1, false);
    } catch (err) {
      if (!applyRateLimitFromError(err)) toastApiError(err, "Failed to post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (postId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, authPath)) return;
    try {
      await voteProfileWallPost(identifier, postId, type);
      await reload(sort, pagination?.page ?? 1, false);
    } catch (err) {
      toastApiError(err, "Failed to vote.");
    }
  };

  const handleDelete = async (postId: number) => {
    try {
      await deleteProfileWallPost(identifier, postId);
      toast.success("Post deleted");
      await reload(sort, 1, false);
    } catch (err) {
      toastApiError(err, "Failed to delete.");
    }
  };

  const handleEdit = async (postId: number) => {
    if (!requireTrimmed(editText, "Please write something.")) return;
    setIsSubmitting(true);
    try {
      await updateProfileWallPost(identifier, postId, editText);
      setEditingId(null);
      setEditText("");
      toast.success("Post updated");
      await reload(sort, pagination?.page ?? 1, false);
    } catch (err) {
      toastApiError(err, "Failed to update.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPost = (post: ProfileWallPost, depth = 0) => {
    const nested = depth > 0;
    const replyCount = countReplies(post);
    const repliesExpanded = expandedPosts.includes(post.id);
    const authorId = post.author?.id ?? post.authorUserId;

    return (
      <div key={post.id} className={nested ? "ml-4 border-l-2 border-l-borders pl-3" : ""}>
        {editingId === post.id ? (
          <ContentComposer
            value={editText}
            onChange={setEditText}
            placeholder="Edit your post…"
            rows={nested ? 3 : 5}
            minHeight={nested ? "min-h-[80px]" : "min-h-[100px]"}
            maxLength={CONTENT_LIMITS.comment}
            onSubmit={() => void handleEdit(post.id)}
            submitLabel="Save"
            submitting={isSubmitting}
            disabled={isSubmitting}
            layout={nested ? "reply" : "card"}
            onCancel={() => { setEditingId(null); setEditText(""); }}
          />
        ) : (
          <SocialPostCard
            variant={nested ? "nested" : "root"}
            author={post.author as any}
            createdAt={post.createdAt}
            content={post.content}
            votes={post.votes}
            itemId={post.id}
            userId={user?.id}
            onVote={handleVote}
            onReply={() => {
              if (!requireAuth(user, authPath)) return;
              setReplyingTo(replyingTo === post.id ? null : post.id);
            }}
            replyActive={replyingTo === post.id}
            repliesToggle={replyCount > 0 ? { count: replyCount, expanded: repliesExpanded, onClick: () => setExpandedPosts((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id]) } : undefined}
            overflowMenu={
              <PostOverflowMenu
                id={post.id}
                authorId={authorId}
                userId={user?.id}
                wallOwnerId={wallOwnerId}
                isAdmin={isAdmin}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onEdit={() => { setEditingId(post.id); setEditText(post.content); setMenuOpenId(null); }}
                onDelete={() => void handleDelete(post.id)}
                nested={nested}
              />
            }
          >
            {replyingTo === post.id && (
              <ContentComposer value={replyText} onChange={setReplyText} placeholder="Write a reply…" rows={3} minHeight="min-h-[80px]" maxLength={CONTENT_LIMITS.comment} onSubmit={() => handleSubmit(replyText, post.id)} submitLabel="Post reply" submitting={isSubmitting} disabled={isSubmitting} rateLimited={isRateLimited} rateLimitHint={rateHint} layout="reply" onCancel={() => { setReplyingTo(null); setReplyText(""); }} />
            )}
            {repliesExpanded && post.replies?.length ? (
              <div className="space-y-3 pt-3 mt-1 border-t border-borders">
                {post.replies.map((reply) => renderPost(reply, depth + 1))}
              </div>
            ) : null}
          </SocialPostCard>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {user && (
        <ContentComposer heading="Write on this wall" value={text} onChange={setText} placeholder="Say something…" rows={5} minHeight="min-h-[100px]" maxLength={CONTENT_LIMITS.comment} onSubmit={() => handleSubmit(text)} submitLabel="Post" submitting={isSubmitting} disabled={isSubmitting} rateLimited={isRateLimited} rateLimitHint={rateHint} layout="card" />
      )}

      {loading && posts.length === 0 ? (
        <div className="bg-foreground rounded-lg p-6 animate-pulse h-40" />
      ) : (
        <>
          {posts.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm text-muted">
                Sort by{" "}
                <select value={sort} onChange={(e) => setSort(e.target.value as ProfileWallSort)} className="ml-1 px-2 py-1 bg-foreground border border-borders rounded text-primary text-sm">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="space-y-4">{posts.map((post) => renderPost(post))}</div>
          {!loading && posts.length === 0 && (
            <div className="bg-foreground rounded-lg p-6">
              <p className="text-muted text-center">No wall posts yet.</p>
            </div>
          )}
          {pagination?.hasMore && (
            <div className="flex justify-center mt-6">
              <button type="button" disabled={loadingMore} onClick={async () => { setLoadingMore(true); try { await reload(sort, (pagination?.page ?? 1) + 1, true); } finally { setLoadingMore(false); } }} className="px-4 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50">{loadingMore ? "Loading..." : "Load more"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
