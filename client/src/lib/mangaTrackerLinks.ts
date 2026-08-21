type MangaSourceEntry = { id?: string | number | null };
export type MangaSourceMap = Record<string, MangaSourceEntry | undefined>;

export type MangaTrackerLink = {
  key: string;
  label: string;
  icon: string;
  href: string | null;
};

const TRACKER_ICON_BASE = '/trackerIcons';

function getSourceId(source: MangaSourceMap | null | undefined, key: string): string | null {
  const id = source?.[key]?.id;
  if (id == null || id === '') return null;
  return String(id);
}

export function buildMangaTrackerLinks(mangaId: number | string, source: MangaSourceMap | null | undefined, title: string): MangaTrackerLink[] {
  const anilistId = getSourceId(source, 'anilist');
  const malId = getSourceId(source, 'my_anime_list');
  const mangaUpdatesId = getSourceId(source, 'manga_updates');
  const animePlanetId = getSourceId(source, 'anime_planet');
  const kitsuId = getSourceId(source, 'kitsu');
  const seriesId = String(mangaId);
  const encodedTitle = encodeURIComponent(title.trim() || '');

  return [
    {key: 'anilist', label: 'AniList', icon: `${TRACKER_ICON_BASE}/anilist.png`, href: anilistId ? `https://anilist.co/manga/${anilistId}` : null},
    {key: 'my_anime_list', label: 'MyAnimeList', icon: `${TRACKER_ICON_BASE}/myanimelist.png`, href: malId ? `https://myanimelist.net/manga/${malId}` : null},
    {key: 'kuroiru', label: 'Kuroiru', icon: `${TRACKER_ICON_BASE}/kuroiru.png`, href: malId ? `https://kuroiru.co/manga/${malId}` : null},
    {key: 'manga_updates', label: 'MangaUpdates', icon: `${TRACKER_ICON_BASE}/mangaupdates.png`, href: mangaUpdatesId ? `https://www.mangaupdates.com/series/${mangaUpdatesId}` : null},
    {key: 'mangabaka', label: 'MangaBaka', icon: `${TRACKER_ICON_BASE}/mangabaka.png`, href: `https://mangabaka.org/${seriesId}`},
    {key: 'kenmei', label: 'Kenmei', icon: `${TRACKER_ICON_BASE}/kenmei.png`, href: encodedTitle ? `https://kenmei.co/search?q=${encodedTitle}` : null},
    {key: 'anime_planet', label: 'Anime-Planet', icon: `${TRACKER_ICON_BASE}/anime-planet.png`, href: animePlanetId ? `https://www.anime-planet.com/manga/${animePlanetId}` : null},
    {key: 'kitsu', label: 'Kitsu', icon: `${TRACKER_ICON_BASE}/kitsu.png`, href: kitsuId ? `https://kitsu.io/manga/${kitsuId}` : null},
  ];
}