"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import ForumFilters from "./components/ForumFilters";
import ForumPostCard from "./components/ForumPostCard";
import ContentComposer from "@/components/content/ContentComposer";
import SingleDropdown from "@/components/Dropdown";
import { FORUM_POST_CATEGORY_OPTIONS, type ForumSort } from "@/constants/forumCategories";
import { useUser } from "@/providers/UserProvider";
import { createBoardPost, getBoardPosts, voteBoardPost } from "@/services/boardService";
import { requireAuth } from "@/lib/requireAuth";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";
import { applyPostVote } from "@/lib/forumExcerpt";

const DEFAULT_CATEGORY = "all";
const DEFAULT_SORT: ForumSort = "latest";

type ForumFiltersState = {
  q: string;
  category: string;
  sort: ForumSort;
  page: number;
};

function parseForumSort(value: string | null): ForumSort {
  if (value === 'top' || value === 'oldest') return value;
  return DEFAULT_SORT;
}

function filtersFromSearchParams(searchParams: URLSearchParams): ForumFiltersState {
  return {
    q: searchParams.get("q") || "",
    category: searchParams.get("category") || DEFAULT_CATEGORY,
    sort: parseForumSort(searchParams.get("sort")),
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1),
  };
}

function buildSearchParams(filters: { q: string; category: string; sort: string; page: number }) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category && filters.category !== DEFAULT_CATEGORY) params.set("category", filters.category);
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export default function ForumClient() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams()!;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<Partial<Pick<ForumFiltersState, 'q' | 'category' | 'sort'>>>({});
  const filtersRef = useRef(filtersFromSearchParams(searchParams));

  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");

  const { isRateLimited, applyRateLimitFromError, rateLimitSecondsLeft } = useSubmitRateLimit();

  filtersRef.current = filters;

  const loadPosts = useCallback(async (nextFilters: typeof filters) => {
    setLoading(true);
    try {
      const data = await getBoardPosts({
        page: nextFilters.page,
        q: nextFilters.q || undefined,
        category: nextFilters.category,
        sort: nextFilters.sort,
      });
      setPosts(data.posts ?? []);
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.hasMore));
    } catch {
      toast.error("Failed to load posts");
      setPosts([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(filters);
  }, [filters, loadPosts]);

  useEffect(() => {
    const params = buildSearchParams(filters);
    const qs = params.toString();
    router.replace(qs ? `/forum?${qs}` : "/forum", { scroll: false });
  }, [filters, router]);

  const updateFilters = useCallback((partial: Partial<typeof filters>, immediate = false) => {
    if (immediate) {
      setFilters((prev) => ({ ...prev, ...partial, page: partial.page ?? 1 }));
      return;
    }
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const next = { ...filtersRef.current, ...pendingRef.current, page: 1 };
      pendingRef.current = {};
      setFilters(next);
    }, 300);
  }, []);

  const handleVote = async (postId: number, type: "like" | "dislike") => {
    if (!requireAuth(user, "/forum")) return;
    if (!user?.id) return;
    const previous = posts;
    setPosts((current) => applyPostVote(current, postId, user.id, type, filtersRef.current.sort));
    try {
      await voteBoardPost(postId, type);
    } catch (err: unknown) {
      setPosts(previous);
      toastApiError(err, "Failed to vote");
    }
  };

  const handleCreate = async () => {
    if (!requireAuth(user, "/forum")) return;
    if (isRateLimited) return;
    if (!requireTrimmed(title, "Please enter a title.")) return;
    if (!requireTrimmed(content, "Please write your post.")) return;
    try {
      await createBoardPost({ title, content, category });
      setTitle("");
      setContent("");
      setCategory("general");
      setFilters((prev) => ({ ...prev, page: 1 }));
      await loadPosts({ ...filtersRef.current, page: 1 });
      toast.success("Post created");
    } catch (err: unknown) {
      if (!applyRateLimitFromError(err)) toastApiError(err, "Failed to create post");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col gap-6 w-full">
      <ForumFilters
        q={filters.q}
        category={filters.category}
        sort={filters.sort}
        onQChange={(value) => updateFilters({ q: value }, true)}
        onCategoryChange={(value) => updateFilters({ category: value }, true)}
        onSortChange={(value) => updateFilters({ sort: value as ForumSort }, true)}
      />

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
          middle={
            <SingleDropdown key={category} options={FORUM_POST_CATEGORY_OPTIONS as any} onChange={setCategory} initialValue={category} size="w-full" className="bg-background" matchInputHeight />
          }
          onSubmit={handleCreate}
          onCancel={() => setCategory("general")}
          submitLabel="Post"
          layout="comment"
          avatarUrl={user.image}
          rateLimited={isRateLimited}
          rateLimitHint={isRateLimited ? `Please wait ${rateLimitSecondsLeft}s before posting again.` : undefined}
        />
      )}

      <div className="flex flex-col gap-4 min-w-0">
        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-muted text-sm">No posts found.</p>
        ) : (
          posts.map((post) => (
            <ForumPostCard key={post.id} post={post} userId={user?.id} onVote={handleVote} />
          ))
        )}
      </div>

      {!loading && total > 0 ? (
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
          <span>{total} {total === 1 ? "post" : "posts"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
              className="rounded-md border border-borders px-3 py-1.5 text-primary disabled:opacity-40 hover:bg-foreground"
            >
              Previous
            </button>
            <span className="tabular-nums">Page {filters.page}</span>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              className="rounded-md border border-borders px-3 py-1.5 text-primary disabled:opacity-40 hover:bg-foreground"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
