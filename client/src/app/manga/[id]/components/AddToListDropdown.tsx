"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ListIcon, ChevronDownIcon, Plus, Check } from "lucide-react";
import { fetchMyLists, addListItem, removeListItem, createList, type CuratedList } from "@/services/curatedListService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import { useUser } from "@/providers/UserProvider";
import { requireAuth } from "@/lib/requireAuth";
import { CONTENT_LIMITS } from "@/lib/contentLimits";
import { useClickOutside } from "@/hooks/useClickOutside";

export default function AddToListDropdown({ seriesId, mangaTitle }: { seriesId: number; mangaTitle?: string }) {
  const { user } = useUser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<CuratedList[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const data = await fetchMyLists({ seriesId });
      setLists(data.lists);
    } catch {
      setLists([]);
    }
  }, [seriesId]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setShowCreate(false);
    setNewTitle("");
  }, []);

  useClickOutside(rootRef, closeDropdown, open);

  useEffect(() => {
    if (!user) {
      setLists([]);
      return;
    }
    void loadLists();
  }, [user, loadLists]);

  useEffect(() => {
    if (open) void loadLists();
  }, [open, loadLists]);

  const handleToggle = async (list: CuratedList) => {
    setActionLoading(true);
    try {
      if (list.hasSeries) {
        await removeListItem(list.id, seriesId);
        toast.info(`Removed from "${list.title}"`);
      } else {
        await addListItem(list.id, seriesId);
        toast.success(`Added to "${list.title}"`);
      }
      await loadLists();
    } catch (err) {
      toastApiError(err, "Failed to update list");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      toast.error("List title is required");
      return;
    }
    setCreating(true);
    try {
      const result = await createList({ title, visibility: "public" });
      await addListItem(result.list.id, seriesId);
      toast.success(`Created "${title}" and added manga`);
      setNewTitle("");
      setShowCreate(false);
      await loadLists();
    } catch (err) {
      toastApiError(err, "Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  const inListCount = lists.filter((l) => l.hasSeries).length;

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        onClick={() => { if (!requireAuth(user, `/manga/${seriesId}`)) return; setOpen((prev) => !prev); }}
        disabled={actionLoading}
        className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none text-primary transition-all shadow-md ${actionLoading ? "animate-manga-pulse" : ""}`}
      >
        <ListIcon className={`size-6 mr-2 transition-colors ${inListCount > 0 ? "text-accent" : ""}`} />
        <span>{inListCount > 0 ? `In ${inListCount} list${inListCount === 1 ? "" : "s"}` : "Add to List"}</span>
        <ChevronDownIcon className={`ml-2 size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-foreground rounded-md shadow-xl z-50 flex flex-col min-w-52 max-w-72 overflow-hidden border border-white/10">
          {lists.length === 0 && !showCreate ? (
            <p className="px-4 py-3 text-sm text-muted">No lists yet.</p>
          ) : (
            lists.map((list) => (
              <button key={list.id} type="button" onClick={() => handleToggle(list)} disabled={actionLoading} className="px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer flex items-center gap-2 disabled:opacity-50">
                {list.hasSeries ? <Check className="size-4 text-accent shrink-0" /> : <span className="size-4 shrink-0" />}
                <span className={`truncate flex-1 ${list.hasSeries ? "text-accent font-medium" : ""}`}>{list.title}</span>
                <span className="text-xs text-muted shrink-0">{list.itemCount}</span>
              </button>
            ))
          )}
          <div className="h-px bg-white/10 w-full" />
          {showCreate ? (
            <div className="p-3 space-y-2">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={CONTENT_LIMITS.listTitle} placeholder="New list title" className="w-full px-3 py-2 text-sm bg-background border border-borders rounded-lg text-primary" autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={handleCreate} disabled={creating} className="flex-1 px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50">{creating ? "Creating..." : "Create & Add"}</button>
                <button type="button" onClick={() => { setShowCreate(false); setNewTitle(""); }} className="px-3 py-1.5 text-sm rounded-md bg-background text-muted hover:text-primary">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer flex items-center gap-2 font-medium">
              <Plus className="size-4 text-accent" /> Create new list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
