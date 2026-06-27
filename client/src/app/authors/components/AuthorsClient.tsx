"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import SingleDropdown from "@/components/Dropdown";
import AuthorCard from "@/components/AuthorCard";
import AuthorCarouselCard from "@/components/AuthorCarouselCard";
import HomepageCarouselSection from "@/components/homepage/carousel/HomepageCarouselSection";
import HomepageCarouselItem from "@/components/homepage/carousel/HomepageCarouselItem";
import { fetchAuthors, fetchTopAuthors, AUTHOR_SORT_OPTIONS, AUTHOR_PAGE_SIZE, type AuthorSort, type AuthorSummary } from "@/services/authorService";
import { toastApiError } from "@/lib/rateLimit";

const DEFAULT_SORT = "works";
const ALPHABET = ["#", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

type Filters = { search: string; letter: string; sort: string };

function buildSearchParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.letter) params.set("letter", f.letter);
  if (f.sort && f.sort !== DEFAULT_SORT) params.set("sort", f.sort);
  return params;
}

function filtersFromSearchParams(searchParams: URLSearchParams): Filters {
  return {
    search: searchParams.get("search") || "",
    letter: searchParams.get("letter") || "",
    sort: searchParams.get("sort") || DEFAULT_SORT,
  };
}

export default function AuthorsClient() {
  const searchParams = useSearchParams()!;
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<Partial<Filters>>({});
  const filtersRef = useRef(filtersFromSearchParams(searchParams));

  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [authors, setAuthors] = useState<AuthorSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [topAuthors, setTopAuthors] = useState<AuthorSummary[]>([]);

  filtersRef.current = filters;

  useEffect(() => {
    fetchTopAuthors(10)
      .then(setTopAuthors)
      .catch(() => setTopAuthors([]));
  }, []);

  const loadAuthors = useCallback(async (f: Filters, pageNum: number, append: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchAuthors({
        search: f.search || undefined,
        letter: f.letter || undefined,
        sort: f.sort as AuthorSort,
        page: pageNum,
        limit: AUTHOR_PAGE_SIZE,
      });
      setAuthors((prev) => (append ? [...prev, ...data.authors] : data.authors));
      setTotal(data.total);
    } catch (err) {
      if (!append) setAuthors([]);
      toastApiError(err, "Failed to load authors");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadAuthors(filters, 1, false);
  }, [filters, loadAuthors]);

  useEffect(() => {
    const qs = buildSearchParams(filters).toString();
    router.replace(qs ? `/authors?${qs}` : "/authors", { scroll: false });
  }, [filters, router]);

  const updateFilters = useCallback((partial: Partial<Filters>) => {
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const next = { ...filtersRef.current, ...pendingRef.current };
      pendingRef.current = {};
      setFilters(next);
      setPage(1);
    }, 300);
  }, []);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadAuthors(filters, nextPage, true);
  };

  const hasMore = authors.length < total;

  return (
    <div className="space-y-8">
      {topAuthors.length > 0 && (
        <HomepageCarouselSection title="Top Authors">
          {topAuthors.map((author) => (
            <HomepageCarouselItem key={author.name}>
              <AuthorCarouselCard author={author} />
            </HomepageCarouselItem>
          ))}
        </HomepageCarouselSection>
      )}

      <div className="flex flex-col gap-3">
        <SearchBar onChange={(val) => updateFilters({ search: val })} initialValue={filters.search} size="w-full" placeholder="Search authors..." />
        <div className="flex flex-wrap gap-1.5 w-full">
          <button
            type="button"
            onClick={() => updateFilters({ letter: "" })}
            className={`flex-1 min-w-9 px-2 py-1.5 rounded-md text-sm transition-colors ${filters.letter === "" ? "bg-accent text-white" : "bg-foreground text-muted hover:bg-foreground/70"}`}
          >
            All
          </button>
          {ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => updateFilters({ letter })}
              className={`flex-1 min-w-9 px-2 py-1.5 rounded-md text-sm hover:cursor-pointer transition-colors ${filters.letter === letter ? "bg-accent text-white" : "bg-foreground text-muted hover:bg-foreground/70"}`}
            >
              {letter}
            </button>
          ))}
        </div>
        <div className="flex ml-auto w-32">
          <SingleDropdown options={AUTHOR_SORT_OPTIONS} onChange={(val) => updateFilters({ sort: val })} initialValue={filters.sort} size="w-48" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-38 rounded-xl bg-foreground animate-pulse" />
          ))}
        </div>
      ) : authors.length === 0 ? (
        <p className="text-center text-muted py-12">No authors match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {authors.map((author) => (
            <AuthorCard key={author.name} author={author} />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="px-6 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50">
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
