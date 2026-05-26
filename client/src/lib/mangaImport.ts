export type MangaImportFields = {
  hasImportedChapters?: boolean;
  latestChapter?: unknown | null;
};

export function mangaHasImportedChapters(manga: MangaImportFields | null | undefined): boolean {
  if (!manga) return false;
  if (typeof manga.hasImportedChapters === "boolean") return manga.hasImportedChapters;
  return !!manga.latestChapter;
}
