"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListIcon } from "lucide-react";
import { fetchListsForSeries, type CuratedList } from "@/services/curatedListService";

export default function FeaturedInLists({ seriesId }: { seriesId: number }) {
  const [lists, setLists] = useState<CuratedList[] | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchListsForSeries(seriesId)
      .then((res) => { if (mounted) setLists(res.lists); })
      .catch(() => { if (mounted) setLists([]); });
    return () => { mounted = false; };
  }, [seriesId]);

  if (!lists || lists.length === 0) return null;

  return (
    <div className="bg-foreground rounded-md p-4 md:p-5 w-full shadow-md">
      <div className="flex flex-col gap-3">
        <h2 className="text-base md:text-lg font-bold">Featured In</h2>
        <div className="flex flex-col gap-3">
          {lists.map((list) => {
            const covers = list.previewCovers ?? [];
            const authorName = list.author?.displayUsername || list.author?.username || list.author?.name || "Unknown";
            return (
              <Link key={list.id} href={`/lists/${list.id}`} className="flex gap-3 items-center hover:opacity-80 transition-opacity">
                <div className="shrink-0 w-12 h-16 rounded overflow-hidden bg-background grid grid-cols-2 grid-rows-2 gap-px">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="relative overflow-hidden bg-background min-h-0 min-w-0">
                      {covers[i] ? (
                        <img src={covers[i]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-muted"><ListIcon className="size-3" /></div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{list.title}</span>
                  <span className="text-xs text-muted truncate">by {authorName} · {list.itemCount} manga</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
