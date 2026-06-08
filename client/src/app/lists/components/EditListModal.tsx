"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Trash2, Plus, Search } from "lucide-react";
import { updateList, deleteList, addListItem, removeListItem, searchMangaForList, fetchListDetail, type ListVisibility, type CuratedListDetail } from "@/services/curatedListService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";
import { useRouter } from "next/navigation";

type EditTab = "info" | "items";

interface EditListModalProps {
  listId: number;
  initialList?: CuratedListDetail;
  onClose: () => void;
  onUpdated?: (list: CuratedListDetail) => void;
  initialTab?: EditTab;
}

export default function EditListModal({ listId, initialList, onClose, onUpdated, initialTab = "info" }: EditListModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [list, setList] = useState<CuratedListDetail | null>(initialList ?? null);
  const [title, setTitle] = useState(initialList?.title ?? "");
  const [description, setDescription] = useState(initialList?.description ?? "");
  const [visibility, setVisibility] = useState<ListVisibility>(initialList?.visibility ?? "public");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; title: string | null; cover: string | null }[]>([]);
  const [seriesIdInput, setSeriesIdInput] = useState("");
  const [loading, setLoading] = useState(!initialList);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refreshList = useCallback(async () => {
    const data = await fetchListDetail(listId);
    setList(data.list);
    setTitle(data.list.title);
    setDescription(data.list.description);
    setVisibility(data.list.visibility);
    onUpdated?.(data.list);
    return data.list;
  }, [listId, onUpdated]);

  const loadList = useCallback(async () => {
    try {
      return await refreshList();
    } catch (err) {
      toastApiError(err, "Failed to load list");
      onClose();
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshList, onClose]);

  useEffect(() => {
    if (initialList) return;
    void loadList();
  }, [initialList, loadList]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await searchMangaForList(searchQuery.trim());
        setSearchResults(data.results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateList(listId, { title: title.trim(), description: description.trim(), visibility });
      toast.success("List updated");
      await refreshList();
    } catch (err) {
      toastApiError(err, "Failed to update list");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this list permanently?")) return;
    setDeleting(true);
    try {
      await deleteList(listId);
      toast.success("List deleted");
      onClose();
      router.push("/lists/mine");
    } catch (err) {
      toastApiError(err, "Failed to delete list");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddById = async () => {
    const id = parseInt(seriesIdInput, 10);
    if (isNaN(id)) {
      toast.error("Enter a valid series ID");
      return;
    }
    try {
      await addListItem(listId, id);
      toast.success("Manga added");
      setSeriesIdInput("");
      await refreshList();
    } catch (err) {
      toastApiError(err, "Failed to add manga");
    }
  };

  const handleAddManga = async (seriesId: number) => {
    try {
      await addListItem(listId, seriesId);
      toast.success("Manga added");
      setSearchQuery("");
      setSearchResults([]);
      await refreshList();
    } catch (err) {
      toastApiError(err, "Failed to add manga");
    }
  };

  const handleRemove = async (seriesId: number) => {
    try {
      await removeListItem(listId, seriesId);
      toast.success("Manga removed");
      await refreshList();
    } catch (err) {
      toastApiError(err, "Failed to remove manga");
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-background border border-borders rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-borders bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold">Edit List</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-foreground text-muted" aria-label="Close"><X className="size-5" /></button>
          </div>
          <div className="flex gap-1 px-4 pb-3">
            <button type="button" onClick={() => setTab("info")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "info" ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`}>Info</button>
            <button type="button" onClick={() => setTab("items")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "items" ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`}>Items</button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {tab === "info" && (
            <>
              <div>
                <label className="text-sm font-medium text-muted block mb-1.5">Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CONTENT_LIMITS.listTitle} className="w-full px-3 py-2 bg-foreground border border-borders rounded-lg text-primary" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted block mb-1.5">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CONTENT_LIMITS.listDescription} rows={3} className="w-full px-3 py-2 bg-foreground border border-borders rounded-lg text-primary resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted block mb-2">Visibility</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setVisibility("public")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${visibility === "public" ? "bg-accent text-white" : "bg-foreground text-muted"}`}>Public</button>
                  <button type="button" onClick={() => setVisibility("private")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${visibility === "private" ? "bg-accent text-white" : "bg-foreground text-muted"}`}>Private</button>
                </div>
              </div>
              <button type="button" onClick={handleSave} disabled={saving} className="w-full py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="w-full py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 font-medium disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete List"}
              </button>
            </>
          )}
          {tab === "items" && (
            <>
              <div>
                <h3 className="font-medium text-primary mb-2">Add manga</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title..." className="w-full pl-9 pr-3 py-2 bg-foreground border border-borders rounded-lg text-primary" />
                </div>
                {searchResults.length > 0 && (
                  <div className="border border-borders rounded-lg divide-y divide-borders mb-3 max-h-40 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button key={r.id} type="button" onClick={() => handleAddManga(r.id)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-foreground text-left">
                        {r.cover ? <img src={r.cover} alt="" className="size-8 rounded object-cover" /> : <div className="size-8 rounded bg-background" />}
                        <span className="text-sm text-primary truncate">{r.title}</span>
                        <Plus className="size-4 text-accent ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="number" value={seriesIdInput} onChange={(e) => setSeriesIdInput(e.target.value)} placeholder="Or enter series ID" className="flex-1 px-3 py-2 bg-foreground border border-borders rounded-lg text-primary" />
                  <button type="button" onClick={handleAddById} className="px-4 py-2 rounded-lg bg-foreground border border-borders text-primary hover:bg-foreground/80">Add</button>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-primary mb-2">Items ({list?.items.length ?? 0})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {list?.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-foreground">
                      <span className="text-sm text-primary flex-1 truncate">{item.title}</span>
                      <button type="button" onClick={() => handleRemove(item.id)} className="text-red-400 hover:text-red-300 p-1" aria-label="Remove"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                  {!list?.items.length && <p className="text-sm text-muted">No manga in this list yet. Use the manga page &quot;Add to List&quot; button or search above.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
