"use client";

import { useEffect, useState } from "react";
import { Pin, Lock } from "lucide-react";
import { toast } from "react-toastify";
import { getBoardPosts, getBoardPost, createBoardPost, createBoardReply, voteBoardPost, voteBoardReply, adminBoardPost, updateBoardPost, deleteBoardPost, updateBoardReply, deleteBoardReply } from "@/services/boardService";  
import { useUser } from "@/providers/UserProvider";
import ContentComposer from "@/components/content/ContentComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { boardPostAdminItems, isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

export default function BoardClient() {
  const { user } = useUser();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [replyTextByPostId, setReplyTextByPostId] = useState<Record<number, string>>({});
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshVersions, setRefreshVersions] = useState<Record<number, number>>({});

  const isAdmin = isAdminUser(user?.role);
  const {isRateLimited: isPostRateLimited, applyRateLimitFromError: applyPostRateLimit, rateLimitSecondsLeft: postRateLimitSecondsLeft} = useSubmitRateLimit();
  const {isRateLimited: isReplyRateLimited, applyRateLimitFromError: applyReplyRateLimit, rateLimitSecondsLeft: replyRateLimitSecondsLeft} = useSubmitRateLimit();

  const bumpPostRefresh = (postId: number) => {
    setRefreshVersions((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
  };

  const loadPosts = () => {
    getBoardPosts()
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => toast.error("Failed to load posts"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleCreate = async () => {
    if (!requireAuth(user, '/board')) return;
    if (isPostRateLimited) return;
    if (!requireTrimmed(title, "Please enter a title.")) return;
    if (!requireTrimmed(content, "Please write your post.")) return;
    try {
      await createBoardPost(title, content);
      setTitle("");
      setContent("");
      loadPosts();
      toast.success("Post created");
    } catch (err: unknown) {
      if (!applyPostRateLimit(err)) toastApiError(err, "Failed to create post");
    }
  };

  const handleReply = async (postId: number) => {
    if (!requireAuth(user, '/board')) return;
    if (isReplyRateLimited) return;
    const replyText = replyTextByPostId[postId] ?? "";
    if (!requireTrimmed(replyText, "Please write a reply.")) return;
    try {
      await createBoardReply(postId, replyText);
      setReplyTextByPostId((prev) => ({ ...prev, [postId]: "" }));
      bumpPostRefresh(postId);
      toast.success("Reply posted");
    } catch (err: unknown) {
      if (!applyReplyRateLimit(err)) toastApiError(err, "Failed to reply");
    }
  };

  const handleAdmin = async (postId: number, updates: Record<string, boolean>) => {
    try {
      await adminBoardPost(postId, updates);
      setMenuOpenKey(null);
      loadPosts();
      bumpPostRefresh(postId);
      toast.success("Updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update");
    }
  };

  return (
    <div className="container mx-auto px-4 xl:px-0 py-8 flex flex-col gap-6 w-full md:w-2/3">
      {user && (
      <ContentComposer
        title={title}
        onTitleChange={setTitle}
        titlePlaceholder="Title"
        titleMaxLength={CONTENT_LIMITS.boardTitle}
        value={content}
        onChange={setContent}
        placeholder="Write your post…"
        maxLength={CONTENT_LIMITS.boardPost}
        onSubmit={handleCreate}
        submitLabel="Post"
        layout="card"
        rateLimited={isPostRateLimited}
        rateLimitHint={
          isPostRateLimited
            ? `Please wait ${postRateLimitSecondsLeft}s before posting again.`
            : undefined
        }
      />
      )}

      <div className="space-y-4 min-w-0 overflow-x-hidden">
        {loading ? (
          <div className="bg-foreground rounded-lg p-4 border border-borders">
            <p className="text-muted">Loading…</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-foreground rounded-lg p-4 border border-borders">
            <p className="text-muted">No posts yet. Be the first to post.</p>
          </div>
        ) : (
          posts.map((post) => (
            <BoardPostCard
              key={post.id}
              post={post}
              user={user}
              isAdmin={isAdmin}
              menuOpenKey={menuOpenKey}
              setMenuOpenKey={setMenuOpenKey}
              onAdmin={handleAdmin}
              refreshVersion={refreshVersions[post.id] ?? 0}
              onVotePost={async (id, type) => {
                if (!requireAuth(user, '/board')) return;
                await voteBoardPost(id, type);
                bumpPostRefresh(id);
              }}
              onVoteReply={async (postId, replyId, type) => {
                if (!requireAuth(user, '/board')) return;
                await voteBoardReply(replyId, type);
                bumpPostRefresh(postId);
              }}
              onReply={handleReply}
              replyText={replyTextByPostId[post.id] ?? ""}
              setReplyText={(value) =>
                setReplyTextByPostId((prev) => ({ ...prev, [post.id]: value }))
              }
              isReplyRateLimited={isReplyRateLimited}
              replyRateLimitSecondsLeft={replyRateLimitSecondsLeft}
              onPostUpdated={() => {
                loadPosts();
                bumpPostRefresh(post.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BoardPostCard({post, refreshVersion, user, isAdmin, menuOpenKey, setMenuOpenKey, onAdmin, onVotePost, onVoteReply, onReply, replyText, setReplyText, onPostUpdated, isReplyRateLimited, replyRateLimitSecondsLeft}: {post: any, refreshVersion: number, user: ReturnType<typeof useUser>['user'], isAdmin: boolean, menuOpenKey: string | null, setMenuOpenKey: (key: string | null) => void, onAdmin: (postId: number, updates: Record<string, boolean>) => Promise<void>, onVotePost: (postId: number, type: "like" | "dislike") => Promise<void>, onVoteReply: (postId: number, replyId: number, type: "like" | "dislike") => Promise<void>, onReply: (postId: number) => Promise<void>, replyText: string, setReplyText: (value: string) => void, onPostUpdated: () => void, isReplyRateLimited: boolean, replyRateLimitSecondsLeft: number}) {
  const [detail, setDetail] = useState<{ post: any; replies: any[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editReplyText, setEditReplyText] = useState("");

  useEffect(() => {
    let mounted = true;
    const isInitial = refreshVersion === 0;
    const locked = Boolean(post.isLocked);
    const shouldFetch = !locked || repliesExpanded || refreshVersion > 0;

    if (!shouldFetch) {
      setDetail({ post, replies: [] });
      setLoadingDetail(false);
      return;
    }

    if (isInitial) setLoadingDetail(true);

    getBoardPost(post.id)
      .then((d) => {
        if (mounted && d?.post) setDetail(d);
      })
      .catch(() => {
        if (mounted) setDetail({ post, replies: [] });
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [post.id, refreshVersion, post.isLocked, repliesExpanded]);

  const current = detail?.post ?? post;
  const isLocked = Boolean(current.isLocked);
  const replies = detail?.replies ?? [];
  const isOwner = current.author?.id === user?.id;
  const postMenuKey = `post-${current.id}`;

  const handleSubmitReply = async () => {
    await onReply(current.id);
    setReplyOpen(false);
    setRepliesExpanded(true);
  };

  const handleSavePost = async () => {
    if (!requireTrimmed(editTitle, "Please enter a title.")) return;
    if (!requireTrimmed(editContent, "Please write your post.")) return;
    try {
      await updateBoardPost(current.id, { title: editTitle, content: editContent });
      setEditingPost(false);
      onPostUpdated();
      toast.success("Post updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update post");
    }
  };

  const handleDeletePost = async () => {
    try {
      await deleteBoardPost(current.id);
      onPostUpdated();
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
      onPostUpdated();
      toast.success("Reply updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update reply");
    }
  };

  const handleDeleteReply = async (replyId: number) => {
    try {
      await deleteBoardReply(replyId);
      onPostUpdated();
      toast.success("Reply deleted");
    } catch (err: unknown) {
      toastApiError(err, "Failed to delete reply");
    }
  };

  const replyCount = loadingDetail ? (post.replyCount ?? 0) : replies.length;

  const overflowMenu = (isOwner || isAdmin) ? (
    <ContentOverflowMenu
      open={menuOpenKey === postMenuKey}
      onOpenChange={(open) => setMenuOpenKey(open ? postMenuKey : null)}
      isOwner={isOwner}
      isAdmin={isAdmin}
      onEdit={
        isOwner
          ? () => {
              setEditTitle(current.title);
              setEditContent(current.content);
              setEditingPost(true);
            }
          : undefined
      }
      onDelete={isOwner ? () => void handleDeletePost() : undefined}
      adminItems={
        isAdmin
          ? boardPostAdminItems(current, {
              onPin: () => void onAdmin(current.id, { isPinned: !current.isPinned }),
              onLock: () => void onAdmin(current.id, { isLocked: !current.isLocked }),
              onDelete: !isOwner ? () => void onAdmin(current.id, { isDeleted: true }) : undefined,
            })
          : []
      }
    />
  ) : undefined;

  if (editingPost) {
    return (
      <div className="bg-foreground rounded-lg p-4 border border-borders space-y-3 min-w-0 overflow-x-hidden">
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Title"
          maxLength={CONTENT_LIMITS.boardTitle}
          className="w-full min-w-0 max-w-full box-border bg-background rounded-lg px-3 py-2 text-primary border border-borders overflow-x-hidden"
        />
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
    );
  }

  return (
    <SocialPostCard
      anchorId={`post-${current.id}`}
      author={current.author}
      createdAt={current.createdAt}
      content={current.content}
      title={current.title}
      titlePrefix={
        <>
          {current.isPinned && <Pin className="size-5 text-accent shrink-0" />}
          {current.isLocked && <Lock className="size-5 text-red-400 shrink-0" />}
        </>
      }
      overflowMenu={overflowMenu}
      votes={current.votes ?? []}
      itemId={current.id}
      userId={user?.id}
      onVote={(id, type) => onVotePost(id, type)}
      onReply={!isLocked ? () => {
        if (!requireAuth(user, '/board')) return;
        setReplyOpen((open) => !open);
      } : undefined}
      replyActive={replyOpen}
      repliesToggle={
        !loadingDetail && replyCount > 0
          ? {
              count: replyCount,
              expanded: repliesExpanded,
              onClick: () => setRepliesExpanded((open) => !open),
            }
          : undefined
      }
    >
      {replyOpen && !isLocked && (
        <ContentComposer
          value={replyText}
          onChange={setReplyText}
          placeholder="Write a reply…"
          maxLength={CONTENT_LIMITS.boardReply}
          onSubmit={handleSubmitReply}
          submitLabel="Post reply"
          layout="reply"
          rateLimited={isReplyRateLimited}
          rateLimitHint={
            isReplyRateLimited
              ? `Please wait ${replyRateLimitSecondsLeft}s before replying again.`
              : undefined
          }
          onCancel={() => {
            setReplyOpen(false);
            setReplyText("");
          }}
        />
      )}

      {loadingDetail && !isLocked && (
        <p className="text-sm text-muted mt-3">Loading replies…</p>
      )}

      {repliesExpanded && !loadingDetail && replyCount > 0 && (
        <div className="space-y-3 pt-3 mt-1 border-t border-borders">
          {replies.map((reply: any) => {
            const replyOwner = reply.author?.id === user?.id;
            const replyMenuKey = `reply-${reply.id}`;

            if (editingReplyId === reply.id) {
              return (
                <div key={reply.id} className="bg-background rounded-lg p-3 space-y-2">
                  <ContentComposer
                    value={editReplyText}
                    onChange={setEditReplyText}
                    placeholder="Edit reply…"
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
              <SocialPostCard
                key={reply.id}
                variant="nested"
                author={reply.author}
                createdAt={reply.createdAt}
                content={reply.content}
                votes={reply.votes ?? []}
                itemId={reply.id}
                userId={user?.id}
                onVote={(id, type) => onVoteReply(current.id, id, type)}
                overflowMenu={
                  replyOwner || isAdmin ? (
                    <ContentOverflowMenu
                      open={menuOpenKey === replyMenuKey}
                      onOpenChange={(open) => setMenuOpenKey(open ? replyMenuKey : null)}
                      iconClassName="size-4"
                      isOwner={replyOwner}
                      isAdmin={isAdmin}
                      onEdit={
                        replyOwner
                          ? () => {
                              setEditReplyText(reply.content);
                              setEditingReplyId(reply.id);
                            }
                          : undefined
                      }
                      onDelete={replyOwner ? () => void handleDeleteReply(reply.id) : undefined}
                      adminItems={
                        isAdmin && !replyOwner
                          ? [{ label: "Delete", variant: "danger", onClick: () => void handleDeleteReply(reply.id) }]
                          : []
                      }
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </SocialPostCard>
  );
}
