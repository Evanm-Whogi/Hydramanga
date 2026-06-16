"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getProfileRecentReads, PROFILE_PAGE_SIZE, type ProfileRecentReadItem } from "@/services/profileService";
import { mangaPath } from "@/lib/paths";
import ProfilePagination from "./ProfilePagination";

export default function ProfileRecentReads({ identifier }: { identifier: string }) {
  const [items, setItems] = useState<ProfileRecentReadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadItems = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const data = await getProfileRecentReads(identifier, nextPage, PROFILE_PAGE_SIZE);
      setItems(data.items ?? []);
      setTotal(data.pagination.total);
      setPage(nextPage);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    loadItems(1);
  }, [loadItems]);

  if (loading && items.length === 0) return <div className="bg-foreground rounded-lg p-6 animate-pulse h-40 shadow-md" />;

  if (!loading && items.length === 0) {
    return (
      <div className="bg-foreground rounded-lg p-6 shadow-md">
        <p className="text-muted">No recent reads yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="bg-foreground rounded-lg p-6 animate-pulse h-40 shadow-md" />
        ) : (
          items.map((item) => (
            <Link key={`${item.seriesId}-${item.updatedAt}`} href={mangaPath(item.seriesId)} className="flex gap-4 bg-foreground rounded-lg p-4 hover:bg-foreground/80 transition-colors shadow-md">
              <img src={item.cover || "/notFound.png"} alt={item.title ?? "Manga"} className="w-16 aspect-2/3 object-cover rounded-md shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-primary line-clamp-2">{item.title}</p>
                <p className="text-sm text-muted capitalize mt-1">{item.type || "Unknown"} · {Math.round(item.percentageCompleted ?? 0)}% complete</p>
                <p className="text-xs text-muted mt-1">Last read {new Date(item.updatedAt).toLocaleString()}</p>
              </div>
            </Link>
          ))
        )}
      </div>
      <ProfilePagination page={page} total={total} onPageChange={loadItems} loading={loading} />
    </div>

  );
}
