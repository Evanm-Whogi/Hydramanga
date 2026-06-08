"use client";

import { useState, useEffect, useCallback } from "react";
import ListsGrid from "./ListsGrid";
import { fetchSavedLists, type CuratedList } from "@/services/curatedListService";
import { toastApiError } from "@/lib/rateLimit";

export default function SavedListsClient() {
  const [lists, setLists] = useState<CuratedList[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSavedLists({ sort: "newest" });
      setLists(data.lists);
    } catch (err) {
      setLists([]);
      toastApiError(err, "Failed to load saved lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <ListsGrid lists={lists} loading={loading} emptyMessage="You haven't saved any lists yet." />;
}
