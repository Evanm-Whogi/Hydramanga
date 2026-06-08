"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import ListsGrid from "./ListsGrid";
import CreateListModal from "./CreateListModal";
import { fetchMyLists, type CuratedList } from "@/services/curatedListService";
import { toastApiError } from "@/lib/rateLimit";

export default function MineListsClient() {
  const [lists, setLists] = useState<CuratedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyLists({ sort: "newest" });
      setLists(data.lists);
    } catch (err) {
      setLists([]);
      toastApiError(err, "Failed to load your lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="flex justify-end mb-6">
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90">
          <Plus className="size-4" /> Create List
        </button>
      </div>
      <ListsGrid lists={lists} loading={loading} emptyMessage="You haven't created any lists yet." />
      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
    </>
  );
}
