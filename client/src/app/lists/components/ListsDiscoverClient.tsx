"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ListsFilters from "./ListsFilters";
import ListsGrid from "./ListsGrid";
import { fetchLists, type ListSort, type CuratedList } from "@/services/curatedListService";
import { toastApiError } from "@/lib/rateLimit";

const DEFAULT_SORT = "popular";

function buildSearchParams(f: { search: string; genres: string[]; sort: string }): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.genres?.length) params.set("genres", f.genres.join(","));
  if (f.sort && f.sort !== DEFAULT_SORT) params.set("sort", f.sort);
  return params;
}

function filtersFromSearchParams(searchParams: URLSearchParams) {
  return {
    search: searchParams.get("search") || "",
    genres: searchParams.get("genres")?.split(",").filter(Boolean) || [],
    sort: searchParams.get("sort") || DEFAULT_SORT,
  };
}

export default function ListsDiscoverClient() {
  const searchParams = useSearchParams()!;
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<Partial<{ search: string; genres: string[]; sort: string }>>({});
  const filtersRef = useRef(filtersFromSearchParams(searchParams));

  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [lists, setLists] = useState<CuratedList[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  filtersRef.current = filters;

  const loadLists = useCallback(async (f: typeof filters, off: number, append: boolean) => {
    if (off === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchLists({
        search: f.search || undefined,
        genres: f.genres.length ? f.genres : undefined,
        sort: f.sort as ListSort,
        limit: 20,
        offset: off,
      });
      setLists((prev) => (append ? [...prev, ...data.lists] : data.lists));
      setTotal(data.total);
    } catch (err) {
      if (!append) setLists([]);
      toastApiError(err, "Failed to load lists");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    loadLists(filters, 0, false);
  }, [filters, loadLists]);

  useEffect(() => {
    const params = buildSearchParams(filters);
    const qs = params.toString();
    router.replace(qs ? `/lists?${qs}` : "/lists", { scroll: false });
  }, [filters, router]);

  const updateFilters = useCallback((partial: Partial<typeof filters>) => {
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const next = { ...filtersRef.current, ...pendingRef.current };
      pendingRef.current = {};
      setFilters(next);
      setOffset(0);
    }, 300);
  }, []);

  const loadMore = () => {
    const nextOffset = offset + 20;
    setOffset(nextOffset);
    loadLists(filters, nextOffset, true);
  };

  const hasMore = lists.length < total;

  return (
    <>
      <ListsFilters filters={filters} onFilterChange={updateFilters} params={{ search: filters.search, genres: filters.genres.join(","), sort: filters.sort }} />
      <ListsGrid lists={lists} loading={loading} emptyMessage="No public lists match your filters." />
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="px-6 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50">
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
