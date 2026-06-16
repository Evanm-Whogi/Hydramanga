"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ListIcon, Lock, Globe } from "lucide-react";
import { getProfileLists, type ProfileListItem } from "@/services/profileService";
import { fetchMyLists, fetchSavedLists, type CuratedList } from "@/services/curatedListService";
import CreateListModal from "@/app/lists/components/CreateListModal";
import { toastApiError } from "@/lib/rateLimit";

type ListRow = Pick<ProfileListItem, "id" | "title" | "description" | "visibility" | "itemCount">;

function ListRowLink({ list }: { list: ListRow }) {
  return (
    <Link href={`/lists/${list.id}`} className="flex items-center gap-4 bg-foreground rounded-lg p-4 border border-borders hover:bg-foreground/80 transition-colors shadow-md">
      <div className="size-12 rounded-lg bg-background flex items-center justify-center shrink-0">
        <ListIcon className="size-5 text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-primary line-clamp-1">{list.title}</h3>
          <span className="inline-flex items-center gap-1 text-xs text-muted shrink-0">
            {list.visibility === "private" ? <Lock className="size-3" /> : <Globe className="size-3" />}
            {list.itemCount} items
          </span>
        </div>
        {list.description ? <p className="text-sm text-muted line-clamp-2 mt-1">{list.description}</p> : null}
      </div>
    </Link>
  );
}

function toListRow(list: ProfileListItem | CuratedList): ListRow {
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    visibility: list.visibility,
    itemCount: list.itemCount,
  };
}

export default function ProfileLists({ identifier, mode = "public" }: { identifier?: string; mode?: "public" | "mine" | "saved" }) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "mine") {
        const data = await fetchMyLists({ sort: "newest" });
        setLists((data.lists ?? []).map(toListRow));
      } else if (mode === "saved") {
        const data = await fetchSavedLists({ sort: "newest" });
        setLists((data.lists ?? []).map(toListRow));
      } else {
        if (!identifier) {
          setLists([]);
          return;
        }
        const data = await getProfileLists(identifier);
        setLists((data.lists ?? []).map(toListRow));
      }
    } catch (err) {
      setLists([]);
      if (mode !== "public") toastApiError(err, mode === "mine" ? "Failed to load your lists" : "Failed to load saved lists");
    } finally {
      setLoading(false);
    }
  }, [identifier, mode]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="bg-foreground rounded-lg p-6 animate-pulse h-40 shadow-md" />;

  const emptyMessage = mode === "mine"
    ? "You haven't created any lists yet."
    : mode === "saved"
      ? "You haven't saved any lists yet."
      : "No public lists yet.";

  return (
    <div className="space-y-4">
      {mode === "mine" && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90">
            <Plus className="size-4" /> Create List
          </button>
        </div>
      )}

      {lists.length === 0 ? (
        <div className="bg-foreground rounded-lg p-6 shadow-md">
          <p className="text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <ListRowLink key={list.id} list={list} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
