"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookmarkIcon, Check, Plus, X } from "lucide-react";
import { toast } from "react-toastify";
import { BOOKMARK_STATUSES, fetchBookmarkStatus, getStatusLabel, setBookmark, type BookmarkStatus } from "@/services/bookmarkService";
import { addListItem, createList, fetchMyLists, removeListItem, type CuratedList } from "@/services/curatedListService";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";
import { useUser } from "@/providers/UserProvider";

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">{children}</p>;
}

export default function SeriesBookmarkModal({ isOpen, onClose, seriesId, mangaTitle }: { isOpen: boolean; onClose: () => void; seriesId: number; mangaTitle: string }) {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [lists, setLists] = useState<CuratedList[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<BookmarkStatus | null>(null);
  const busy = bookmarkLoading || listLoading || creating;

  useEffect(() => setMounted(true), []);

  const loadLists = useCallback(async () => {
    if (!user) {
      setLists([]);
      return;
    }
    try {
      const data = await fetchMyLists({ seriesId });
      setLists(data.lists);
    } catch {
      setLists([]);
    }
  }, [seriesId, user]);

  const loadBookmarkStatus = useCallback(async () => {
    if (!user) {
      setCurrentStatus(null);
      return;
    }
    try {
      const status = await fetchBookmarkStatus(seriesId);
      setCurrentStatus(status);
    } catch {
      setCurrentStatus(null);
    }
  }, [seriesId, user]);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) root.classList.add("lock-scroll");
    else root.classList.remove("lock-scroll");
    return () => root.classList.remove("lock-scroll");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void loadLists();
    void loadBookmarkStatus();
    setShowCreate(false);
    setNewTitle("");
  }, [isOpen, loadLists, loadBookmarkStatus]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleBookmarkSelect = async (status: BookmarkStatus) => {
    setBookmarkLoading(true);
    try {
      await setBookmark(seriesId, status);
      setCurrentStatus(status);
      toast.success(`Bookmarked as ${getStatusLabel(status)}`);
    } catch (error) {
      toastApiError(error, "Failed to add bookmark");
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleListToggle = async (list: CuratedList) => {
    setListLoading(true);
    try {
      if (list.hasSeries) {
        await removeListItem(list.id, seriesId);
        toast.info(`Removed from "${list.title}"`);
      } else {
        await addListItem(list.id, seriesId);
        toast.success(`Added to "${list.title}"`);
      }
      await loadLists();
    } catch (error) {
      toastApiError(error, "Failed to update list");
    } finally {
      setListLoading(false);
    }
  };

  const handleCreateList = async () => {
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
    } catch (error) {
      toastApiError(error, "Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="series-save-modal-title" className="relative z-10 flex w-[95%] max-w-2xl animate-in fade-in zoom-in flex-col overflow-hidden rounded-xl border border-borders bg-foreground shadow-2xl duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borders px-5 py-4">
          <div className="min-w-0 pr-4">
            <h2 id="series-save-modal-title" className="text-lg font-semibold text-primary">Save to Library</h2>
            <p className="mt-0.5 truncate text-sm text-muted">{mangaTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full p-1 text-muted transition-colors hover:bg-background hover:text-primary" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="grid max-h-[min(68vh,26rem)] grid-cols-1 gap-6 overflow-y-auto px-5 py-5 md:grid-cols-2 md:overflow-hidden">
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Bookmarks</p>
              {currentStatus ? (
                <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">{getStatusLabel(currentStatus)}</span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-borders bg-background">
              <div className="custom-scrollbar max-h-64 divide-y divide-borders overflow-y-auto md:max-h-none md:h-full">
                {BOOKMARK_STATUSES.map((entry) => {
                  const active = currentStatus === entry.value;
                  return (
                    <button key={entry.value} type="button" disabled={busy} onClick={() => handleBookmarkSelect(entry.value)} className={`flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-accent/15 font-medium text-accent" : "text-primary hover:bg-foreground"}`}>
                      {active ? <Check className="size-4 shrink-0 text-accent" /> : <BookmarkIcon className="size-4 shrink-0 text-muted" />}
                      <span>{entry.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <SectionLabel>Lists</SectionLabel>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-borders bg-background">
              <div className="custom-scrollbar min-h-0 flex-1 divide-y divide-borders overflow-y-auto">
                {lists.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">No lists yet.</p>
                ) : (
                  lists.map((list) => (
                    <button key={list.id} type="button" onClick={() => handleListToggle(list)} disabled={busy} className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50">
                      {list.hasSeries ? <Check className="size-4 shrink-0 text-accent" /> : <span className="size-4 shrink-0" />}
                      <span className={`min-w-0 flex-1 truncate text-sm ${list.hasSeries ? "font-medium text-accent" : "text-primary"}`}>{list.title}</span>
                      <span className="shrink-0 text-xs text-muted">{list.itemCount}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-borders p-3">
                {showCreate ? (
                  <div className="space-y-2">
                    <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={CONTENT_LIMITS.listTitle} placeholder="New list title" className="w-full rounded-lg border border-borders bg-foreground px-3 py-2 text-sm text-primary" autoFocus />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCreateList} disabled={busy} className="flex-1 cursor-pointer rounded-md bg-accent py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{creating ? "Creating..." : "Create & Add"}</button>
                      <button type="button" onClick={() => { setShowCreate(false); setNewTitle(""); }} className="cursor-pointer rounded-md bg-foreground px-3 py-2 text-sm text-muted transition-colors hover:text-primary">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowCreate(true)} disabled={busy} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-50">
                    <Plus className="size-4 text-accent" />
                    Create new list
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-borders px-5 py-4">
          <button type="button" onClick={onClose} className="w-full cursor-pointer rounded-md bg-background py-2 text-sm text-primary transition-colors hover:bg-background/50">Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
