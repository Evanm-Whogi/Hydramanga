"use client";

import { BookCheck, BookX } from "lucide-react";
import { mangaHasImportedChapters, type MangaImportFields } from "@/lib/mangaImport";
import { isAdminUser } from "@/lib/contentMenu";
import { useUser } from "@/providers/UserProvider";

export default function MangaImportBadge({ manga }: { manga?: MangaImportFields | null }) {
  const { user } = useUser();
  if (!isAdminUser(user?.role)) return null;

  const imported = mangaHasImportedChapters(manga);

  return (
    <span
      title={imported ? "Chapters available" : "Not imported yet"}
      className={imported ? "text-emerald-400" : "text-muted-foreground/70"}
      aria-label={imported ? "Imported" : "Not imported"}
    >
      {imported ? <BookCheck className="size-5" /> : <BookX className="size-5" />}
    </span>
  );
}
