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
