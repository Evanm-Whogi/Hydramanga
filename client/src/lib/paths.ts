/** Absolute app routes for manga navigation (always use these instead of relative hrefs). */
export function mangaPath(id: number | string): string {
  return `/manga/${id}`;
}

export function mangaReadPath(seriesId: number | string, chapterId: number | string): string {
  return `/manga/${seriesId}/read/${chapterId}`;
}

export function authorPath(name: string): string {
  return `/authors/${encodeURIComponent(name)}`;
}
