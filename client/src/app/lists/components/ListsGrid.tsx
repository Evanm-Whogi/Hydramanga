"use client";

import { memo } from "react";
import ListCard from "@/components/ListCard";
import type { CuratedList } from "@/services/curatedListService";

function ListsGrid({ lists, loading, emptyMessage }: { lists: CuratedList[]; loading?: boolean; emptyMessage?: string }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-foreground animate-pulse" />
        ))}
      </div>
    );
  }

  if (!lists.length) {
    return <p className="text-center text-muted py-12">{emptyMessage ?? "No lists found."}</p>;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      {lists.map((list) => (
        <ListCard key={list.id} list={list} />
      ))}
    </div>
  );
}

export default memo(ListsGrid);
