"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement } from "@/services/announcementService";
import { toast } from "react-toastify";
import { Send } from "lucide-react";
import MarkdownEditor from "@/components/markdown/MarkdownEditor";

export default function AnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"info" | "warning">("info");
  const [isPublished, setIsPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      await createAnnouncement({
        title: title.trim(),
        content: content.trim() || "",
        type,
        isPublished,
      });
      toast.success(isPublished ? "Announcement published." : "Announcement saved as draft.");
      setTitle("");
      setContent("");
      setIsPublished(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to create announcement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-foreground p-6 rounded-lg border border-borders mb-6">
      <h2 className="text-xl font-semibold text-primary mb-4">New announcement (admin)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ann-title" className="block text-sm font-medium text-muted mb-1">
            Title
          </label>
          <input
            id="ann-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            className="w-full rounded-lg border border-borders bg-background px-3 py-2 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            maxLength={255}
          />
        </div>

        <div>
          <div className="mb-1">
            <label className="block text-sm font-medium text-muted">Content (Markdown)</label>
          </div>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write your announcement. Use the toolbar for **bold**, *italic*, underline, `code`, headings, and lists."
            rows={8}
            showPreviewToggle={true}
            minHeight="min-h-[160px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded border-borders text-accent focus:ring-accent"
            />
            <span className="text-sm text-muted">Publish immediately</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "info" | "warning")}
              className="rounded-lg border border-borders bg-background px-3 py-1.5 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-4" />
          {submitting ? "Posting…" : "Post announcement"}
        </button>
      </form>
    </div>
  );
}
