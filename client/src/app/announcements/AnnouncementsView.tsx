"use client";

import { useUser } from "@/providers/UserProvider";
import MarkdownView from "@/components/markdown/MarkdownView";
import AnnouncementForm from "./AnnouncementForm";

export type Announcement = {
  id: number;
  title: string;
  content: string;
  type: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AnnouncementsView({announcements}: {announcements: Announcement[]}) {
  const { user } = useUser();
  const isAdmin = user?.role === "admin";

  return (
    <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] overflow-hidden">
      <div className="flex flex-col space-y-4">
        {isAdmin && <AnnouncementForm />}
        {announcements.length === 0 && (
          <p className="text-muted">No new announcements today.</p>
        )}
        {announcements.map((ann) => (
          <article
            key={ann.id}
            className="bg-foreground p-5 rounded-lg border border-borders flex flex-col"
          >
            <div className="flex justify-between items-start gap-4">
              <h3 className="text-lg font-bold text-primary">{ann.title}</h3>
              <span className="text-xs text-muted uppercase tracking-widest shrink-0">
                {new Date(ann.publishedAt || ann.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-2 text-muted leading-relaxed">
              <MarkdownView content={ann.content || ""} />
            </div>
            <div className="mt-3 flex items-center">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${
                  ann.type === "warning"
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-blue-500/20 text-blue-500"
                }`}
              >
                {ann.type}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
