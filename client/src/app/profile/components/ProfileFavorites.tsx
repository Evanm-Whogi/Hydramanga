"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Plus, X, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import MangaCard from "@/components/MangaCard";
import { getProfileFavorites, setMyFavorites } from "@/services/profileService";
import { searchMangaByTitle } from "@/services/mangaService";
import { toastApiError } from "@/lib/rateLimit";

const MAX_FAVORITES = 10;

type FavoriteManga = { id: number; title?: string | null; cover?: unknown; [key: string]: unknown };

function SortableFavoriteCard({ item, onRemove }: { item: FavoriteManga; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        className="absolute top-2 left-2 z-20 rounded-full bg-background/90 p-1.5 text-muted hover:text-primary cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <MangaCard manga={item} />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 z-20 rounded-full bg-red-600/90 p-1 text-white"
        aria-label="Remove favorite"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export default function ProfileFavorites({ identifier, isOwner }: { identifier: string; isOwner: boolean }) {
  const [favorites, setFavorites] = useState<FavoriteManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FavoriteManga[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<FavoriteManga[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadFavorites = async () => {
    try {
      const data = await getProfileFavorites(identifier);
      const items = (data.favorites ?? []) as FavoriteManga[];
      setFavorites(items);
      setDraftItems(items);
    } catch {
      setFavorites([]);
      setDraftItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, [identifier]);

  useEffect(() => {
    if (!editing || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchMangaByTitle(query.trim());
        setResults((data.items ?? []) as FavoriteManga[]);
      } catch (err) {
        setResults([]);
        toastApiError(err, "Search failed");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await setMyFavorites(draftItems.map((item) => item.id));
      const items = (data.favorites ?? []) as FavoriteManga[];
      setFavorites(items);
      setDraftItems(items);
      setEditing(false);
      setQuery("");
      toast.success("Favorites updated");
    } catch (err) {
      toastApiError(err, "Failed to update favorites");
    } finally {
      setSaving(false);
    }
  };

  const addFavorite = (item: FavoriteManga) => {
    if (draftItems.some((f) => f.id === item.id)) return;
    if (draftItems.length >= MAX_FAVORITES) {
      toast.error(`You can only add up to ${MAX_FAVORITES} favorites`);
      return;
    }
    setDraftItems((prev) => [...prev, item]);
  };

  const removeFavorite = (id: number) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraftItems((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftItems(favorites);
    setQuery("");
  };

  if (loading) {
    return <div className="bg-foreground rounded-lg p-6 animate-pulse h-40" />;
  }

  const displayItems = editing ? draftItems : favorites;

  return (
    <div className="bg-foreground rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-primary">Favorites</h3>
        {isOwner && (
          editing ? (
            <div className="flex gap-2">
              <button onClick={cancelEdit} className="px-3 py-1.5 rounded-md bg-background text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-md bg-accent text-sm text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-background text-sm hover:bg-background/70">
              <Plus className="size-4" /> Edit
            </button>
          )
        )}
      </div>

      {editing && (
        <div className="mb-4 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manga to add..."
            className="w-full p-3 bg-background rounded-md border border-white/10 outline-none focus:ring-1 focus:ring-white/20"
          />
          {searching && <p className="text-sm text-muted">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-2">
              {results.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addFavorite(item)}
                  disabled={draftItems.some((f) => f.id === item.id) || draftItems.length >= MAX_FAVORITES}
                  className="w-full text-left px-3 py-2 rounded-md bg-background hover:bg-background/70 disabled:opacity-50"
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
          {draftItems.length > 1 && (
            <p className="text-xs text-muted">Drag the grip handle to reorder favorites.</p>
          )}
        </div>
      )}

      {displayItems.length === 0 ? (
        <p className="text-sm text-muted">{isOwner ? "Add up to 10 favorite manga to showcase on your profile." : "No favorites yet."}</p>
      ) : editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftItems.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {draftItems.map((item) => (
                <SortableFavoriteCard key={item.id} item={item} onRemove={() => removeFavorite(item.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayItems.map((item) => (
            <MangaCard key={item.id} manga={item} />
          ))}
        </div>
      )}
    </div>
  );
}
