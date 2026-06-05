"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createAdminSticker, deleteAdminSticker, fetchAdminStickers, updateAdminSticker, type AdminContentSticker } from "@/services/stickerService";
import { invalidateStickersCache } from "@/components/content/ContentMediaPicker";
import { isAllowedImageUrl } from "@/lib/contentImages";

export default function StickersAdminClient() {
  const [loading, setLoading] = useState(true);
  const [stickers, setStickers] = useState<AdminContentSticker[]>([]);
  const [label, setLabel] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setStickers(await fetchAdminStickers());
    } catch {
      toast.error("Failed to load stickers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    const url = imageUrl.trim();
    if (!url) {
      toast.warning("Image URL is required");
      return;
    }
    if (!isAllowedImageUrl(url)) {
      toast.warning("URL must be a site path like /stickers/name.png or http(s) ending in .png, .jpg, .gif, .webp, .avif, .bmp, or .svg");
      return;
    }
    setSaving(true);
    try {
      await createAdminSticker({ label: label.trim() || undefined, imageUrl: url, sortOrder });
      invalidateStickersCache();
      setLabel("");
      setImageUrl("");
      setSortOrder(0);
      await load();
      toast.success("Sticker added");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add sticker");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (sticker: AdminContentSticker) => {
    try {
      await updateAdminSticker(sticker.id, { isActive: !sticker.isActive });
      invalidateStickersCache();
      await load();
    } catch {
      toast.error("Failed to update sticker");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAdminSticker(id);
      invalidateStickersCache();
      await load();
      toast.success("Sticker deleted");
    } catch {
      toast.error("Failed to delete sticker");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Loader2 className="size-5 animate-spin" />
        Loading stickers…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-foreground rounded-lg border border-borders p-4 space-y-3">
        <h2 className="text-lg font-semibold text-primary">Add sticker</h2>
        <p className="text-sm text-muted">Stickers insert an image URL into user messages. Use site paths like <code className="text-primary">/stickers/name.png</code> or full http(s) image URLs.</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          maxLength={120}
          className="w-full rounded-lg border border-borders bg-background px-3 py-2 text-primary"
        />
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="/stickers/name.png"
          className="w-full rounded-lg border border-borders bg-background px-3 py-2 text-primary"
        />
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
          placeholder="Sort order"
          className="w-32 rounded-lg border border-borders bg-background px-3 py-2 text-primary"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          <Plus className="size-4" />
          {saving ? "Adding…" : "Add sticker"}
        </button>
      </div>

      <div className="bg-foreground rounded-lg border border-borders overflow-hidden">
        <div className="px-4 py-3 border-b border-borders font-semibold text-primary">Stickers ({stickers.length})</div>
        {stickers.length === 0 ? (
          <p className="p-4 text-sm text-muted">No stickers yet.</p>
        ) : (
          <ul className="divide-y divide-borders">
            {stickers.map((sticker) => (
              <li key={sticker.id} className="flex items-center gap-4 p-4">
                <img src={sticker.imageUrl} alt={sticker.label ?? ""} className="size-12 object-contain rounded border border-borders bg-background shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-primary font-medium truncate">{sticker.label || `Sticker #${sticker.id}`}</p>
                  <p className="text-xs text-muted truncate">{sticker.imageUrl}</p>
                  <p className="text-xs text-muted mt-0.5">Order: {sticker.sortOrder}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggle(sticker)}
                  className={`shrink-0 px-3 py-1 rounded-md text-xs border border-borders ${sticker.isActive ? "text-green-400" : "text-muted"}`}
                >
                  {sticker.isActive ? "Active" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(sticker.id)}
                  className="shrink-0 p-2 text-red-400 hover:bg-background rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
