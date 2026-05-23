"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement } from "@/services/announcementService";
import { toast } from "react-toastify";
import { Send } from "lucide-react";
import ContentComposer from "@/components/content/ContentComposer";
import { requireTrimmed } from "@/lib/requireContent";

export default function AnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"info" | "warning">("info");
  const [isPublished, setIsPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!requireTrimmed(title, "Please enter a title.")) return;
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
    } catch {
      toast.error("Failed to create announcement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-6">
      <ContentComposer
        heading="New announcement (admin)"
        title={title}
        onTitleChange={setTitle}
        titlePlaceholder="Announcement title"
        titleId="ann-title"
        titleMaxLength={255}
        value={content}
        onChange={setContent}
        placeholder="Write your announcement…"
        rows={8}
        showPreviewToggle
        minHeight="min-h-[160px]"
        middle={
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
        }
        onSubmit={handleSubmit}
        submitLabel="Post announcement"
        submitting={submitting}
        disabled={submitting}
        submitIcon={<Send className="size-4" />}
        layout="card"
        className="p-4"
      />
    </div>
  );
}
