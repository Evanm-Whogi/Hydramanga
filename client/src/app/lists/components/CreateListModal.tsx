"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createList, type ListVisibility } from "@/services/curatedListService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

interface CreateListModalProps {
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateListModal({ onClose, onCreated }: CreateListModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ListVisibility>("public");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createList({ title: title.trim(), description: description.trim(), visibility });
      toast.success("List created!");
      onCreated?.();
      onClose();
    } catch (err) {
      toastApiError(err, "Failed to create list");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-background border border-borders rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borders px-4 py-3">
          <h2 className="text-lg font-semibold">Create List</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-foreground text-muted" aria-label="Close"><X className="size-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-muted block mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CONTENT_LIMITS.listTitle} className="w-full px-3 py-2 bg-foreground border border-borders rounded-lg text-primary" placeholder="My favorite shonen" required />
          </div>
          <div>
            <label className="text-sm font-medium text-muted block mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CONTENT_LIMITS.listDescription} rows={3} className="w-full px-3 py-2 bg-foreground border border-borders rounded-lg text-primary resize-none" placeholder="What's this list about?" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted block mb-2">Visibility</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVisibility("public")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${visibility === "public" ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`}>Public</button>
              <button type="button" onClick={() => setVisibility("private")} className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${visibility === "private" ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`}>Private</button>
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-2.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {isSubmitting ? <><Loader2 className="size-4 animate-spin" /> Creating...</> : "Create List"}
          </button>
        </form>
      </div>
    </div>
  );
}
