export interface ProfileVisibility {
  bio: boolean;
  readingStats: boolean;
  favorites: boolean;
  lists: boolean;
  bookmarks: boolean;
  comments: boolean;
  wall: boolean;
  recentReads: boolean;
}

export const DEFAULT_PROFILE_VISIBILITY: ProfileVisibility = {
  bio: true,
  readingStats: true,
  favorites: true,
  lists: true,
  bookmarks: true,
  comments: true,
  wall: true,
  recentReads: true,
};

export function normalizeProfileVisibility(raw: unknown): ProfileVisibility {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    bio: src.bio !== false,
    readingStats: src.readingStats !== false,
    favorites: src.favorites !== false,
    lists: src.lists !== false,
    bookmarks: src.bookmarks !== false,
    comments: src.comments !== false,
    wall: src.wall !== false,
    recentReads: src.recentReads !== false,
  };
}

export function canViewProfileSection(visibility: ProfileVisibility, section: keyof ProfileVisibility, isOwner: boolean): boolean {
  if (isOwner) return true;
  return visibility[section] !== false;
}
